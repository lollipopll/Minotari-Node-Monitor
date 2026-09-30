"""
Tari Minotari Base Node Monitoring Service.
Production-grade FastAPI monitoring dashboard and DevOps background worker.
Periodically polls Tari gRPC BaseNode endpoints and compares versions with GitHub releases.
"""

import os
import sys
import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic_settings import BaseSettings

from app.tari_grpc import TariBaseNodeClient
from app.github_checker import GitHubReleaseChecker

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
class Settings(BaseSettings):
    TARI_NODE_GRPC_HOST: str = "127.0.0.1"
    TARI_NODE_GRPC_PORT: int = 18145
    POLL_INTERVAL_SECONDS: int = 15
    WEB_HOST: str = "0.0.0.0"
    WEB_PORT: int = 8000
    GITHUB_REPO: str = "tari-project/tari"
    GITHUB_CHECK_INTERVAL_SECONDS: int = 1800
    TARI_NODE_TLS: bool = False
    TARI_CA_CERT_PATH: str = ""
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# -----------------------------------------------------------------------------
# Structured Docker Stdout Logging
# -----------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("minotari_monitor")

# In-memory circular log ring for UI inspection
RECENT_LOGS: List[Dict[str, str]] = []


def record_log(level: str, msg: str):
    iso_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    RECENT_LOGS.append({"time": iso_time, "level": level, "msg": msg})
    if len(RECENT_LOGS) > 100:
        RECENT_LOGS.pop(0)


# -----------------------------------------------------------------------------
# Global Monitoring State
# -----------------------------------------------------------------------------
state: Dict[str, Any] = {
    "is_online": False,
    "last_successful_check": None,
    "last_poll_attempt": None,
    "last_error": "Initializing monitoring agent...",
    "node_version": "Unknown",
    "github_latest_version": None,
    "update_available": False,
    "update_message": "",
    "github_release_url": None,
    "identity": None,
    "network_status": None,
    "tip_info": None,
    "sync_progress": None,
    "block_template": None,
    "mempool": None,
    "peers": [],
    "config": {
        "host": settings.TARI_NODE_GRPC_HOST,
        "port": settings.TARI_NODE_GRPC_PORT,
        "poll_interval": settings.POLL_INTERVAL_SECONDS,
        "tls": settings.TARI_NODE_TLS,
    },
}

tari_client = TariBaseNodeClient(
    host=settings.TARI_NODE_GRPC_HOST,
    port=settings.TARI_NODE_GRPC_PORT,
    use_tls=settings.TARI_NODE_TLS,
    ca_cert_path=settings.TARI_CA_CERT_PATH if settings.TARI_CA_CERT_PATH else None,
)

github_checker = GitHubReleaseChecker(
    repo=settings.GITHUB_REPO,
    cache_ttl=settings.GITHUB_CHECK_INTERVAL_SECONDS,
)

# -----------------------------------------------------------------------------
# Background Monitoring Task
# -----------------------------------------------------------------------------
async def monitoring_worker():
    logger.info(
        "Minotari Node Monitor worker started. Polling %s:%d every %ds",
        settings.TARI_NODE_GRPC_HOST,
        settings.TARI_NODE_GRPC_PORT,
        settings.POLL_INTERVAL_SECONDS,
    )
    record_log("INFO", f"Worker initialized for node target {settings.TARI_NODE_GRPC_HOST}:{settings.TARI_NODE_GRPC_PORT}")

    while True:
        poll_time_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        state["last_poll_attempt"] = poll_time_str

        # 1. Fetch gRPC metrics from Tari BaseNode
        try:
            metrics = await tari_client.poll_all_metrics()
            if metrics.get("success"):
                state["is_online"] = True
                state["last_successful_check"] = poll_time_str
                state["last_error"] = None
                state["node_version"] = metrics.get("version", "Unknown")
                state["identity"] = metrics.get("identity")
                state["network_status"] = metrics.get("network_status")
                state["tip_info"] = metrics.get("tip_info")
                state["sync_progress"] = metrics.get("sync_progress")
                state["block_template"] = metrics.get("block_template")
                state["mempool"] = metrics.get("mempool")
                state["peers"] = metrics.get("peers", [])

                log_msg = (
                    f"Node Online | Tip Height: {state['tip_info']['height']} | "
                    f"Sync: {state['sync_progress']['state']} | Peers: {len(state['peers'])}"
                )
                logger.info(log_msg)
                record_log("INFO", log_msg)
            else:
                state["is_online"] = False
                state["last_error"] = metrics.get("error", "gRPC query failed")
                log_msg = f"Node Offline/Unreachable: {state['last_error']}"
                logger.warning(log_msg)
                record_log("WARN", log_msg)

        except Exception as e:
            state["is_online"] = False
            state["last_error"] = f"Internal polling error: {str(e)}"
            logger.error("Exception in monitoring loop: %s", e)
            record_log("ERROR", str(e))

        # 2. Check GitHub Release Version
        try:
            gh_release = await github_checker.get_latest_release()
            latest_tag = gh_release.get("tag_name", "")
            state["github_latest_version"] = latest_tag
            state["github_release_url"] = gh_release.get("html_url")

            if state["is_online"] and state["node_version"] != "Unknown":
                update_needed, msg = github_checker.check_update_available(state["node_version"], latest_tag)
                state["update_available"] = update_needed
                state["update_message"] = msg
                if update_needed:
                    logger.warning("UPDATE ALERT: %s (Latest: %s, Current: %s)", msg, latest_tag, state["node_version"])
            else:
                state["update_available"] = False
                state["update_message"] = "Cannot verify update status while node is offline"
        except Exception as gh_err:
            logger.warning("Could not verify GitHub release: %s", gh_err)

        await asyncio.sleep(settings.POLL_INTERVAL_SECONDS)


# -----------------------------------------------------------------------------
# FastAPI Application & Lifespan
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Tari Minotari Node Monitor",
    description="DevOps monitoring dashboard and gRPC health agent for Tari minotari_node",
    version="1.0.0",
)

template_dir = os.path.join(os.path.dirname(__file__), "templates")
templates = Jinja2Templates(directory=template_dir)


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(monitoring_worker())


@app.get("/", response_class=HTMLResponse)
async def dashboard_view(request: Request):
    """Render lightweight, self-contained dashboard."""
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "state": state,
            "config": settings,
        },
    )


@app.get("/api/status", response_class=JSONResponse)
async def api_status():
    """Return complete real-time monitoring state as JSON."""
    return JSONResponse(content={**state, "logs": RECENT_LOGS[-30:]})


@app.post("/api/poll-now")
async def api_poll_now():
    """Trigger immediate gRPC check."""
    logger.info("Manual poll triggered via API.")
    record_log("INFO", "Manual health check initiated via web dashboard")
    # Quick one-shot poll
    metrics = await tari_client.poll_all_metrics()
    return JSONResponse(content={"triggered": True, "result": metrics})


@app.get("/healthz")
async def health_check():
    """Kubernetes / Docker health check probe."""
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}
