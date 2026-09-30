"""
GitHub Release Checker for Tari Minotari Base Node.
Fetches the latest official release from GitHub API, parses semver,
and compares with the local node's GetVersion response.
"""

import logging
import re
import time
from typing import Dict, Any, Optional, Tuple
import httpx

logger = logging.getLogger("tari_monitor.github")


class GitHubReleaseChecker:
    def __init__(self, repo: str = "tari-project/tari", cache_ttl: int = 1800):
        self.repo = repo
        self.cache_ttl = cache_ttl
        self.last_checked: float = 0.0
        self.cached_data: Optional[Dict[str, Any]] = None

    async def get_latest_release(self) -> Dict[str, Any]:
        """Fetch latest release from GitHub API with memory caching."""
        now = time.time()
        if self.cached_data and (now - self.last_checked) < self.cache_ttl:
            return self.cached_data

        url = f"https://api.github.com/repos/{self.repo}/releases/latest"
        headers = {
            "User-Agent": "Tari-Minotari-Monitor/1.0",
            "Accept": "application/vnd.github.v3+json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    release_info = {
                        "tag_name": data.get("tag_name", "v0.0.0"),
                        "name": data.get("name") or data.get("tag_name"),
                        "html_url": data.get("html_url", f"https://github.com/{self.repo}/releases"),
                        "published_at": data.get("published_at"),
                        "body": (data.get("body") or "")[:500],
                        "is_prerelease": data.get("prerelease", False),
                    }
                    self.cached_data = release_info
                    self.last_checked = now
                    logger.info("GitHub API: Successfully fetched latest release %s", release_info["tag_name"])
                    return release_info
                elif resp.status_code == 403:
                    logger.warning("GitHub API rate limit exceeded. Using cached or fallback data.")
                else:
                    logger.warning("GitHub API returned status code %s", resp.status_code)
        except Exception as e:
            logger.error("Failed to fetch release from GitHub API: %s", e)

        # Fallback to previous cache or safe placeholder
        if self.cached_data:
            return self.cached_data

        return {
            "tag_name": "v1.10.0",
            "name": "Tari Latest Release",
            "html_url": f"https://github.com/{self.repo}/releases",
            "published_at": "unknown",
            "body": "Unable to contact GitHub API directly.",
            "is_prerelease": False,
        }

    @staticmethod
    def _parse_version(v_str: str) -> Tuple[int, ...]:
        """Convert a version string like 'v1.9.3-rc.1' into comparable tuple (1, 9, 3)."""
        if not v_str:
            return (0, 0, 0)
        # Strip leading 'v'
        clean = v_str.lstrip("vV").strip()
        # Extract numeric components
        parts = re.split(r"[-+.]", clean)
        num_parts = []
        for p in parts:
            if p.isdigit():
                num_parts.append(int(p))
            else:
                break
        while len(num_parts) < 3:
            num_parts.append(0)
        return tuple(num_parts[:3])

    def check_update_available(self, current_node_version: str, latest_tag: str) -> Tuple[bool, str]:
        """
        Compare current version against latest release tag.
        Returns (is_update_available, message).
        """
        if not current_node_version or not latest_tag:
            return False, "Version unknown"

        current_tuple = self._parse_version(current_node_version)
        latest_tuple = self._parse_version(latest_tag)

        if latest_tuple > current_tuple:
            return True, f"A newer version ({latest_tag}) is available. Current: {current_node_version}"
        elif latest_tuple < current_tuple:
            return False, f"Running pre-release or development version ({current_node_version})"
        else:
            return False, f"Node is up to date ({current_node_version})"
