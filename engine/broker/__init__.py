"""Broker factory — picks the execution backend from configuration.

Configuration is read from environment variables, with a local ``.env``
file at the repository root (gitignored) as a dev convenience:

- ``BROKER_PROVIDER`` — ``ctrader`` (default, the only live-data source)
  or ``mock`` (dry-run/development only — never feeds live data to the UI)
- ``CTRADER_CLIENT_ID`` / ``CTRADER_CLIENT_SECRET`` — Open API app
- ``CTRADER_ACCESS_TOKEN`` / ``CTRADER_REFRESH_TOKEN`` — OAuth tokens
  (see scripts/ctrader_oauth.py; the refresh token self-heals expiry)
- ``CTRADER_ACCOUNT_ID`` — optional; auto-discovered from the token
- ``CTRADER_DEMO`` — ``1`` (default) or ``0``
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def load_env_file(path: str | os.PathLike | None = None) -> None:
    """Load a simple KEY=VALUE file into os.environ (never overriding).

    Defaults to ``<repo-root>/.env``.  Values may be single/double quoted.
    """
    if path is None:
        # engine/broker/__init__.py -> repo root = parents[2]
        candidates = [
            Path(__file__).resolve().parents[2] / ".env",
            Path.cwd() / ".env",
        ]
        path = next((p for p in candidates if p.exists()), None)
    if path is None:
        return
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError as e:
        logger.warning("could not load env file %s: %s", path, e)


def get_broker(symbols: list[str] | None = None):
    """Return the configured :class:`~engine.broker.base.BrokerAdapter`.

    ``ctrader`` is the default and the only source of live data.  Missing
    ``CTRADER_*`` configuration fails loudly here instead of silently
    degrading — live data is never fabricated.  ``mock`` is a dry-run /
    development backend only.
    """
    load_env_file()
    provider = os.environ.get("BROKER_PROVIDER", "ctrader").strip().lower()
    if provider == "ctrader":
        missing = [
            name
            for name in ("CTRADER_CLIENT_ID", "CTRADER_CLIENT_SECRET")
            if not os.environ.get(name, "").strip()
        ]
        has_token = any(
            os.environ.get(n, "").strip()
            for n in ("CTRADER_ACCESS_TOKEN", "CTRADER_REFRESH_TOKEN")
        )
        if missing or not has_token:
            raise ValueError(
                "BROKER_PROVIDER=ctrader is missing required env: "
                + (", ".join(missing) if missing else "a token")
                + ". Run scripts/ctrader_oauth.py to obtain tokens, or set "
                "BROKER_PROVIDER=mock for dry-run only (mock never feeds "
                "live data to the UI)."
            )
        from .ctrader_broker import CtraderBrokerAdapter

        return CtraderBrokerAdapter(symbols=symbols)
    if provider == "mock":
        from .mock_broker import MockBrokerAdapter

        return MockBrokerAdapter()
    raise ValueError(
        f"unknown BROKER_PROVIDER {provider!r} (expected 'ctrader' or 'mock')"
    )
