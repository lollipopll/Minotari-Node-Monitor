"""
Alert Manager for Tari Minotari Base Node Monitor.
Evaluates the 4 core health rules and dispatches notifications (Telegram/Discord/Web UI).
"""

import time
import logging
import asyncio
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger("minotari_monitor.alerts")


class AlertManager:
    def __init__(
        self,
        max_block_lag: int = 2,
        min_peer_connections: int = 5,
        state_grace_seconds: int = 300,  # 5 minutes
        telegram_bot_token: str = "",
        telegram_chat_id: str = "",
        discord_webhook_url: str = "",
    ):
        self.max_block_lag = max_block_lag
        self.min_peer_connections = min_peer_connections
        self.state_grace_seconds = state_grace_seconds
        self.telegram_bot_token = telegram_bot_token
        self.telegram_chat_id = telegram_chat_id
        self.discord_webhook_url = discord_webhook_url

        # State tracking for debounce & grace periods
        self.non_listening_since: Optional[float] = None
        self.active_alerts: Dict[str, Dict[str, Any]] = {}
        self.last_sent_notification: Dict[str, float] = {}

    def evaluate(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate node health against the 4 core rules.
        Returns a dict of rule statuses, overall health status ('HEALTHY', 'WARNING', 'CRITICAL'),
        and list of active alerts.
        """
        now = time.time()
        rules: Dict[str, Dict[str, Any]] = {}
        alerts: List[Dict[str, Any]] = []

        is_online = state.get("is_online", False)
        tip_info = state.get("tip_info") or {}
        sync_progress = state.get("sync_progress") or {}
        net_status = state.get("network_status") or {}
        block_template = state.get("block_template") or {}

        # ---------------------------------------------------------------------
        # 1. Node Global State Rule
        # ---------------------------------------------------------------------
        base_state = (tip_info.get("base_node_state") or "UNKNOWN").upper()
        init_synced = bool(tip_info.get("initial_sync_achieved", False))
        
        is_listening = (base_state == "LISTENING") and is_online

        if is_listening:
            self.non_listening_since = None
            rules["node_state"] = {
                "name": "Node State",
                "status": "OK",
                "current_value": base_state,
                "expected": "LISTENING",
                "message": f"BaseNode is active in {base_state} state (InitialSync: {init_synced})",
            }
        else:
            if self.non_listening_since is None:
                self.non_listening_since = now

            elapsed_non_listening = now - self.non_listening_since
            is_grace_period = elapsed_non_listening < self.state_grace_seconds
            grace_left_sec = max(0, int(self.state_grace_seconds - elapsed_non_listening))

            if not is_online:
                sev = "CRITICAL"
                msg = f"BaseNode daemon is OFFLINE or unreachable via gRPC ({int(elapsed_non_listening)}s)"
            elif is_grace_period:
                sev = "WARNING"
                msg = f"BaseNode in {base_state} state (grace period active: {grace_left_sec}s remaining before alert)"
            else:
                sev = "CRITICAL"
                msg = f"BaseNode stuck in non-LISTENING state ({base_state}) for > {self.state_grace_seconds // 60} minutes!"

            rules["node_state"] = {
                "name": "Node State",
                "status": sev,
                "current_value": base_state if is_online else "OFFLINE",
                "expected": "LISTENING",
                "message": msg,
                "elapsed_seconds": int(elapsed_non_listening),
            }

            if not is_grace_period or not is_online:
                alerts.append({
                    "id": "node_state_alert",
                    "rule": "Node State",
                    "severity": sev,
                    "message": msg,
                })

        # ---------------------------------------------------------------------
        # 2. Block Height & Lag Rule
        # ---------------------------------------------------------------------
        local_height = int(sync_progress.get("local_height") or tip_info.get("height") or 0)
        tip_height = int(sync_progress.get("tip") or local_height)
        lag = max(0, tip_height - local_height)
        sync_state = (sync_progress.get("state") or "UNKNOWN").upper()

        if not is_online:
            rules["block_lag"] = {
                "name": "Block Lag",
                "status": "CRITICAL",
                "current_value": "Offline",
                "expected": "Lag <= 2",
                "message": "Cannot measure block lag while node is offline",
            }
        elif lag == 0:
            rules["block_lag"] = {
                "name": "Block Lag",
                "status": "OK",
                "current_value": f"{local_height:,} (Lag: 0 blocks)",
                "expected": "Lag <= 2 blocks",
                "message": f"Local database matches network tip height ({local_height:,})",
            }
        elif lag <= self.max_block_lag:
            rules["block_lag"] = {
                "name": "Block Lag",
                "status": "OK",
                "current_value": f"{local_height:,} (Lag: {lag} block)",
                "expected": "Lag <= 2 blocks",
                "message": f"Minor propagation delay ({lag} block). Normal during block propagation.",
            }
        else:
            sev = "WARNING" if lag <= self.max_block_lag + 2 else "CRITICAL"
            msg = f"Node is lagging behind network tip by {lag} blocks! Local: {local_height:,}, Network Tip: {tip_height:,}"
            rules["block_lag"] = {
                "name": "Block Lag",
                "status": sev,
                "current_value": f"Lag: {lag} blocks",
                "expected": "Lag <= 2 blocks",
                "message": msg,
            }
            alerts.append({
                "id": "block_lag_alert",
                "rule": "Block Lag",
                "severity": sev,
                "message": msg,
            })

        # ---------------------------------------------------------------------
        # 3. Peer Connections Rule
        # ---------------------------------------------------------------------
        conns = int(net_status.get("num_node_connections") or len(state.get("peers") or []))
        net_online = (net_status.get("status") or "").upper() == "ONLINE"

        if not is_online or conns == 0:
            sev = "CRITICAL"
            msg = "Node isolated! 0 active peers (disconnected from network or peers banned)"
            rules["peer_connections"] = {
                "name": "Peer Connections",
                "status": sev,
                "current_value": f"{conns} peers",
                "expected": ">= 5 peers (Optimal 20-50)",
                "message": msg,
            }
            alerts.append({
                "id": "peer_connections_zero",
                "rule": "Peer Connections",
                "severity": sev,
                "message": msg,
            })
        elif conns < self.min_peer_connections:
            sev = "WARNING"
            msg = f"Low peer count: {conns} peers connected (< {self.min_peer_connections}). Risk of network isolation."
            rules["peer_connections"] = {
                "name": "Peer Connections",
                "status": sev,
                "current_value": f"{conns} peers",
                "expected": ">= 5 peers (Optimal 20-50)",
                "message": msg,
            }
            alerts.append({
                "id": "peer_connections_low",
                "rule": "Peer Connections",
                "severity": sev,
                "message": msg,
            })
        else:
            rules["peer_connections"] = {
                "name": "Peer Connections",
                "status": "OK",
                "current_value": f"{conns} peers",
                "expected": ">= 5 peers",
                "message": f"Active P2P mesh healthy: {conns} peers connected (Latency: {net_status.get('avg_latency_ms', 0)}ms)",
            }

        # ---------------------------------------------------------------------
        # 4. Mining Readiness & Pool Work (isMempoolInSync & template height)
        # ---------------------------------------------------------------------
        mempool_sync = bool(block_template.get("is_mempool_in_sync", True))
        template_h = int(block_template.get("height") or 0)
        expected_template_h = local_height + 1 if local_height > 0 else template_h
        height_match = (template_h == expected_template_h) or (template_h == 0 and not is_online)

        if not is_online:
            rules["mining_readiness"] = {
                "name": "Mining Pool Readiness",
                "status": "CRITICAL",
                "current_value": "Offline",
                "expected": "Mempool in sync & height = local + 1",
                "message": "Node is offline - P2Pool cannot fetch work templates",
            }
        elif not mempool_sync:
            sev = "WARNING"
            msg = "isMempoolInSync: false! Node is not receiving user mempool transactions. Block templates will be empty!"
            rules["mining_readiness"] = {
                "name": "Mining Pool Readiness",
                "status": sev,
                "current_value": "Mempool Desynced",
                "expected": "isMempoolInSync: true",
                "message": msg,
            }
            alerts.append({
                "id": "mempool_desynced",
                "rule": "Mining Pool Readiness",
                "severity": sev,
                "message": msg,
            })
        elif not height_match and local_height > 0:
            sev = "CRITICAL"
            msg = f"Template height mismatch! Template height {template_h:,} != expected next block {expected_template_h:,} (local: {local_height:,}). Mining pool will reject blocks!"
            rules["mining_readiness"] = {
                "name": "Mining Pool Readiness",
                "status": sev,
                "current_value": f"Template #{template_h:,} (Expected #{expected_template_h:,})",
                "expected": f"#{expected_template_h:,}",
                "message": msg,
            }
            alerts.append({
                "id": "mining_height_mismatch",
                "rule": "Mining Pool Readiness",
                "severity": sev,
                "message": msg,
            })
        else:
            diff_val = block_template.get("difficulty") or "1289552917928"
            diff_formatted = f"{int(diff_val):,}" if str(diff_val).isdigit() else diff_val
            rules["mining_readiness"] = {
                "name": "Mining Pool Readiness",
                "status": "OK",
                "current_value": f"Next #{template_h:,} (Diff: {diff_formatted})",
                "expected": f"Height #{local_height + 1:,} & Mempool In Sync",
                "message": f"Ready for P2Pool: Mempool in sync, template #{template_h:,} matches next block height",
            }

        # Overall health assessment
        has_critical = any(a["severity"] == "CRITICAL" for a in alerts)
        has_warning = any(a["severity"] == "WARNING" for a in alerts)
        overall_status = "CRITICAL" if has_critical else ("WARNING" if has_warning else "HEALTHY")

        result = {
            "overall_status": overall_status,
            "rules": rules,
            "active_alerts": alerts,
            "alerts_count": len(alerts),
            "evaluated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(now)),
        }

        # Handle async webhook notifications for active alerts
        self._dispatch_notifications_if_needed(alerts, overall_status)
        return result

    def _dispatch_notifications_if_needed(self, alerts: List[Dict[str, Any]], overall_status: str):
        now = time.time()
        for alert in alerts:
            alert_id = alert["id"]
            last_sent = self.last_sent_notification.get(alert_id, 0)
            # Send at most once every 30 minutes for the same firing alert
            if now - last_sent > 1800:
                self.last_sent_notification[alert_id] = now
                asyncio.create_task(self._send_external_notifications(alert))

    async def _send_external_notifications(self, alert: Dict[str, Any]):
        msg_text = (
            f"🚨 [TARI NODE ALERT] [{alert['severity']}]\n"
            f"Rule: {alert['rule']}\n"
            f"Details: {alert['message']}\n"
            f"Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}"
        )
        logger.warning("ALERT DISPATCH: %s", msg_text.replace("\n", " | "))

        async with httpx.AsyncClient(timeout=10.0) as client:
            # Telegram Bot Dispatch
            if self.telegram_bot_token and self.telegram_chat_id:
                try:
                    tg_url = f"https://api.telegram.org/bot{self.telegram_bot_token}/sendMessage"
                    await client.post(
                        tg_url,
                        json={"chat_id": self.telegram_chat_id, "text": msg_text, "parse_mode": "HTML"},
                    )
                except Exception as e:
                    logger.error("Failed to send Telegram alert: %s", e)

            # Discord Webhook Dispatch
            if self.discord_webhook_url:
                try:
                    await client.post(
                        self.discord_webhook_url,
                        json={
                            "content": msg_text,
                            "username": "Minotari Node Monitor",
                        },
                    )
                except Exception as e:
                    logger.error("Failed to send Discord webhook alert: %s", e)
