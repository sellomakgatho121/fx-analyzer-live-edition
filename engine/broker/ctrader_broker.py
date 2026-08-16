"""cTrader Open API client (asyncio, JSON transport).

Speaks the cTrader "ProtoOA" wire protocol over a persistent connection to
the cTrader gateway:

- WebSocket ``wss://<host>:5036`` preferred, raw TLS TCP ``<host>:5036``
  as fallback — the working transport is auto-detected at connect time.
- One JSON document per message; envelope::

      {"clientMsgId": "cmd_N", "payloadType": 2100, "payload": {...}}

- Replies echo ``clientMsgId``; asynchronous events (executions, spots,
  trader updates) arrive without one and are dispatched by ``payloadType``.

Scaling (from the official proto comments):

- prices: integer in 1/100000 of a price unit (1.2345 -> 123450)
- volume: integer in 1/100 of a unit; 1 lot = 100000 units -> 10_000_000
- money:  integer scaled by 10^moneyDigits

Auth flow: app credentials (2100) -> OAuth account auth (2102) ->
trader info (2121) -> reconcile (2124) -> symbols (2114) -> spots (2127).
The access token comes from the user's OAuth grant
(``scripts/ctrader_oauth.py``) — it cannot be obtained programmatically.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

from .base import (
    BrokerAdapter,
    BrokerAuthError,
    BrokerDisconnectedError,
    BrokerError,
    BrokerTimeoutError,
)

logger = logging.getLogger(__name__)

HOST_DEMO = "demo1.p.ctrader.com"
HOST_LIVE = "live1.p.ctrader.com"
PORT = 5036
TOKEN_URL = "https://openapi.ctrader.com/apps/token"

# --- Symbol aliasing ----------------------------------------------------
# cTrader account SymbolsList names vary by broker (e.g. BTCUSD.CRYPTO,
# US30.CASH, SPX500). When a requested logical symbol is not listed under its
# exact name, these candidates are tried — but ONLY if the live account
# SymbolsList actually contains the candidate (fail-closed: an alias never
# fabricates a symbol; resolution always happens against the account).
# Names verified against this demo account's live SymbolsList (2026-08-08):
# it lists descriptive names ("US 30", "US 500", "US TECH 100", "APPLE",
# "TESLA MOTORS") rather than ticker-style names. The descriptive name is
# listed first; broker-style candidates are kept so the same map works if
# the account/broker changes.
_SYMBOL_ALIASES = {
    "BTCUSD": ["BTCUSD.CRYPTO", "BTCUSD.CASH", "XBTUSD"],
    "ETHUSD": ["ETHUSD.CRYPTO", "ETHUSD.CASH"],
    "US30": ["US 30", "US30.CASH", "US30.CFD", "DJ30", "DJI"],
    "US500": ["US 500", "US500.CASH", "SPX500", "SP500", "SPX"],
    "USTEC": ["US TECH 100", "USTEC.CASH", "US100", "NAS100", "USTEC"],
    "UK100": ["UK 100", "UK100.CASH", "FTSE100", "UK100.CFD"],
    "GER40": ["GERMANY 40", "GER40.CASH", "DAX40", "DE40"],
    "JPN225": ["JAPAN 225", "JPN225.CASH", "JP225", "NIKKEI", "JPN225.CFD"],
    "AAPL": ["APPLE", "AAPL.US", "AAPL.NASDAQ", "AAPL.CASH"],
    "TSLA": ["TESLA MOTORS", "TSLA.US", "TSLA.NASDAQ", "TSLA.CASH"],
}

# --- ProtoOAPayloadType -------------------------------------------------
PT_HEARTBEAT = 51
PT_APP_AUTH_REQ = 2100
PT_APP_AUTH_RES = 2101
PT_ACCOUNT_AUTH_REQ = 2102
PT_ACCOUNT_AUTH_RES = 2103
PT_NEW_ORDER_REQ = 2106
PT_AMEND_POSITION_SLTP_REQ = 2110
PT_CLOSE_POSITION_REQ = 2111
PT_ASSET_LIST_REQ = 2112
PT_ASSET_LIST_RES = 2113
PT_SYMBOLS_LIST_REQ = 2114
PT_SYMBOLS_LIST_RES = 2115
PT_SYMBOL_BY_ID_REQ = 2116
PT_SYMBOL_BY_ID_RES = 2117
PT_TRADER_REQ = 2121
PT_TRADER_RES = 2122
PT_TRADER_UPDATE_EVENT = 2123
PT_RECONCILE_REQ = 2124
PT_RECONCILE_RES = 2125
PT_EXECUTION_EVENT = 2126
PT_SUBSCRIBE_SPOTS_REQ = 2127
PT_SUBSCRIBE_SPOTS_RES = 2128
PT_UNSUBSCRIBE_SPOTS_REQ = 2129
PT_UNSUBSCRIBE_SPOTS_RES = 2130
PT_SPOT_EVENT = 2131
PT_GET_TRENDBARS_REQ = 2137
PT_GET_TRENDBARS_RES = 2138
PT_ORDER_ERROR_EVENT = 2132
PT_ERROR_RES = 2142
PT_TOKEN_INVALIDATED_EVENT = 2147
PT_CLIENT_DISCONNECT_EVENT = 2148
PT_GET_ACCOUNTS_REQ = 2149
PT_GET_ACCOUNTS_RES = 2150
PT_ACCOUNT_DISCONNECT_EVENT = 2164

# --- enums --------------------------------------------------------------
ORDER_TYPE_MARKET = 1
TIF_IMMEDIATE_OR_CANCEL = 3
SIDE_BUY = 1
SIDE_SELL = 2

EXEC_ORDER_ACCEPTED = 2
EXEC_ORDER_FILLED = 3
EXEC_ORDER_MODIFIED = 4
EXEC_ORDER_CANCELLED = 5
EXEC_ORDER_EXPIRED = 6
EXEC_ORDER_REJECTED = 7
EXEC_ORDER_PARTIAL_FILL = 11

ORDER_STATUS_ACTIVE = 1

# --- trendbar periods (ProtoOATrendbarPeriod) -------------------------
# Official enum values: M1=1, M2=2, M3=3, M4=4, M5=5, M10=6, M15=7,
# M30=8, H1=9, H4=10, H12=11, D1=12, W1=13, MN1=14.
PERIOD_M1 = 1
PERIOD_M5 = 5
PERIOD_M15 = 7
PERIOD_M30 = 8
PERIOD_H1 = 9
PERIOD_H4 = 10
PERIOD_D1 = 12
PERIOD_W1 = 13
PERIOD_MN1 = 14

# Internal timeframe names -> ProtoOA period enum.
TRENDBAR_PERIODS = {
    "M1": PERIOD_M1,
    "M5": PERIOD_M5,
    "M15": PERIOD_M15,
    "M30": PERIOD_M30,
    "H1": PERIOD_H1,
    "H4": PERIOD_H4,
    "D1": PERIOD_D1,
    "W1": PERIOD_W1,
    "MN1": PERIOD_MN1,
}

# ProtoOAPriceType
PRICE_TYPE_BID = 1

# --- scaling ------------------------------------------------------------
PRICE_FACTOR = 100_000          # 1/100000 of a price unit
VOLUME_FACTOR = 10_000_000      # 1 lot = 100000 units, volume in 1/100 units

# --- notable error codes ------------------------------------------------
ERR_OA_AUTH_TOKEN_EXPIRED = 1
ERR_ACCOUNT_NOT_AUTHORIZED = 2
ERR_CH_CLIENT_AUTH_FAILURE = 101
ERR_CH_ACCESS_TOKEN_INVALID = 104
ERR_CH_CTID_ACCOUNT_NOT_FOUND = 106
ERR_CH_OA_CLIENT_NOT_FOUND = 107
ERR_NOT_ENOUGH_MONEY = 118
ERR_POSITION_NOT_FOUND = 120
ERR_TRADING_BAD_VOLUME = 125

_HEARTBEAT_INTERVAL = 25        # seconds between client heartbeats
_REQ_TIMEOUT = 15.0             # default reply timeout for plain requests
_EXEC_TIMEOUT = 30.0            # timeout for an execution event to arrive
_RECONNECT_BASE = 3.0           # initial reconnect delay (seconds)
_RECONNECT_MAX = 15.0           # cap transport retries; auth has its own cool-down
_AUTH_FAIL_DELAY = 300.0        # cool-down after auth failures
_HEARTBEAT_INTERVAL = 10.0      # ProtoOA heartbeat cadence (protocol keepalive)
_HEARTBEAT_TIMEOUT = 35.0       # drop the link after this many seconds without any server frame


class CtraderBrokerAdapter(BrokerAdapter):
    """Persistent cTrader Open API JSON client.

    Reads configuration from environment variables (see
    :func:`engine.broker.get_broker`):

    - ``CTRADER_CLIENT_ID`` / ``CTRADER_CLIENT_SECRET`` — Open API app
    - ``CTRADER_ACCESS_TOKEN`` — OAuth access token (user grant)
    - ``CTRADER_ACCOUNT_ID`` — optional; preferred if set, otherwise
      discovered from the token
    - ``CTRADER_DEMO`` — ``1`` (default) for demo, ``0`` for live
    - ``CTRADER_TRANSPORT`` — ``auto`` (default) | ``ws`` | ``tcp``
    """

    name = "ctrader"

    def __init__(self, symbols: list[str] | None = None):
        self.client_id = os.environ.get("CTRADER_CLIENT_ID", "")
        self.client_secret = os.environ.get("CTRADER_CLIENT_SECRET", "")
        self.access_token = os.environ.get("CTRADER_ACCESS_TOKEN", "")
        self.refresh_token = os.environ.get("CTRADER_REFRESH_TOKEN", "")
        self.account_id = os.environ.get("CTRADER_ACCOUNT_ID", "")
        self.demo = os.environ.get("CTRADER_DEMO", "1").lower() not in (
            "0", "false", "no",
        )
        self.transport_mode = os.environ.get("CTRADER_TRANSPORT", "auto").lower()
        self.symbols_wanted = [s.upper().replace("/", "") for s in (symbols or [])]

        self._ws = None
        self._reader = None
        self._writer = None
        self._reader_task: asyncio.Task | None = None
        self._transport_used = ""
        self._connected = False
        self._account_authed = False
        self._auth_failed = False
        self._token_invalidated = False
        self._last_rx = time.monotonic()  # updated by _on_message on any frame
        self._ctid_account_id: int | None = None
        self._trader: dict = {}
        self._assets: dict[int, str] = {}
        self._symbols: dict[str, int] = {}       # symbolName -> symbolId
        self._symbols_by_id: dict[int, str] = {}
        # symbolId -> logical engine symbol (US30, AAPL, ...) once resolved;
        # ticks/positions are emitted under the logical name, never the
        # broker's display name ("US 30"), so the whole stack stays aligned.
        self._symbol_id_to_logical: dict[int, str] = {}
        self._symbol_vols: dict[int, dict] = {}  # symbolId -> min/max/step (cents)
        self._positions: list[dict] = []
        self._orders: list[dict] = []
        self._last_spot: dict[str, dict] = {}  # symbol -> {"bid","ask",...}
        self._pending: dict[str, asyncio.Future] = {}
        self._exec_waiters: dict[str, asyncio.Future] = {}
        self._counter = 0
        self._write_lock = asyncio.Lock()
        self._disconnect_event = asyncio.Event()
        self._tick_queue: asyncio.Queue = asyncio.Queue(maxsize=2000)
        self._tick_task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._stop = False
        self._last_symbols_fetch = 0.0
        # Logical symbols that could not be resolved against this account's
        # SymbolsList (surfaced via status_snapshot → /health).
        self.unmapped_symbols: set[str] = set()

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Open the transport and run the full handshake."""
        if self._connected:
            return
        # Access tokens expire after ~30 days; if the current one is missing
        # or the server invalidated it, renew it from the (non-expiring)
        # refresh token before attempting the handshake.
        if not self.access_token or self._token_invalidated:
            if self.refresh_token and await self._refresh_access_token():
                self._token_invalidated = False
                logger.info("cTrader access token refreshed before connect")
            elif self._token_invalidated:
                logger.warning(
                    "cTrader token invalidated and no CTRADER_REFRESH_TOKEN set — "
                    "re-run scripts/ctrader_oauth.py"
                )
        host = HOST_DEMO if self.demo else HOST_LIVE
        await self._open_transport(host)
        try:
            await self._handshake()
        except BrokerAuthError:
            # A stale access token may fail account auth; try one refresh
            # and a full reconnect before surfacing the error.
            if self.refresh_token and await self._refresh_access_token():
                self._token_invalidated = False
                logger.info("cTrader auth retry with refreshed token")
                await self._close_transport()
                await self._open_transport(host)
                await self._handshake()
            else:
                await self._close_transport()
                raise
        except BaseException:
            await self._close_transport()
            raise
        self._connected = True
        self._auth_failed = False
        self._token_invalidated = False
        self._disconnect_event.clear()
        self._last_rx = time.monotonic()  # fresh silence window per connect
        logger.info(
            "cTrader connected: %s (%s, transport=%s, account=%s)",
            host, "demo" if self.demo else "live", self._transport_used,
            self._ctid_account_id,
        )

    async def _refresh_access_token(self) -> bool:
        """Exchange ``CTRADER_REFRESH_TOKEN`` for a fresh access token.

        The refresh token itself does not expire, so this heals the
        ~30-day access-token expiry automatically.  New tokens are
        persisted back to ``.env`` (same format ``ctrader_oauth.py`` uses).
        Returns True on success (``self.access_token`` updated).
        """
        rt = self.refresh_token
        if not rt or not self.client_id or not self.client_secret:
            return False
        params = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "refresh_token": rt,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        })
        try:
            with urllib.request.urlopen(
                f"{TOKEN_URL}?{params}", timeout=30
            ) as resp:
                tokens = json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - refresh is best-effort
            logger.error("cTrader token refresh failed: %s", e)
            return False
        access = tokens.get("access_token")
        if not access:
            logger.error("cTrader token refresh: no access_token in response: %s", tokens)
            return False
        self.access_token = access
        if tokens.get("refresh_token"):
            self.refresh_token = tokens["refresh_token"]
        self._persist_tokens()
        return True

    def _persist_tokens(self) -> None:
        """Write current access/refresh tokens into the repo ``.env``."""
        env_file = Path(__file__).resolve().parents[2] / ".env"
        try:
            if env_file.exists():
                lines = env_file.read_text().splitlines()
            else:
                lines = []
        except OSError as e:
            logger.warning("cTrader token refresh: cannot read %s: %s", env_file, e)
            return
        kept = []
        seen = set()
        for line in lines:
            key = line.split("=", 1)[0].strip() if "=" in line else None
            if key in ("CTRADER_ACCESS_TOKEN", "CTRADER_REFRESH_TOKEN"):
                seen.add(key)
                continue
            kept.append(line)
        if "CTRADER_ACCESS_TOKEN" not in seen:
            kept.append("")
        kept.append(f"CTRADER_ACCESS_TOKEN={self.access_token}")
        if self.refresh_token:
            if "CTRADER_REFRESH_TOKEN" not in seen:
                kept.append("")
            kept.append(f"CTRADER_REFRESH_TOKEN={self.refresh_token}")
        kept.append("")
        try:
            env_file.write_text("\n".join(kept))
            logger.info("cTrader tokens persisted to %s", env_file)
        except OSError as e:
            logger.warning("cTrader token refresh: cannot write %s: %s", env_file, e)

    async def run(self) -> None:
        """Keep the broker connected: reconnect with exponential backoff."""
        backoff = _RECONNECT_BASE
        while not self._stop:
            try:
                await self.connect()
                backoff = _RECONNECT_BASE
                await self._serve()
            except asyncio.CancelledError:
                raise
            except BrokerAuthError as e:
                logger.error("cTrader auth failure: %s — retrying in %ss", e, _AUTH_FAIL_DELAY)
                self._auth_failed = True
                backoff = _AUTH_FAIL_DELAY
            except Exception as e:  # noqa: BLE001 - keep the loop alive
                logger.error("cTrader connect failed: %s", e)
            await self._close_transport()
            if self._stop:
                break
            logger.info("cTrader reconnecting in %ss", backoff)
            await asyncio.sleep(backoff)
            backoff = min(max(backoff * 2, _RECONNECT_BASE), _RECONNECT_MAX)

    async def _serve(self) -> None:
        """Run while connected: heartbeats until the connection dies."""
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        try:
            await self._disconnect_event.wait()
        finally:
            if self._heartbeat_task:
                self._heartbeat_task.cancel()

    async def _heartbeat_loop(self) -> None:
        """ProtoOA keepalive: send a HeartbeatEvent (51) every interval.

        The server does NOT reply to client heartbeats (it sends its own
        every 10s), so the heartbeat is fire-and-forget; instead the link
        is declared dead when no server frame at all has arrived within
        ``_HEARTBEAT_TIMEOUT`` (3 missed server heartbeats)."""
        while not self._stop and not self._disconnect_event.is_set():
            try:
                await self._write(json.dumps({"payloadType": PT_HEARTBEAT, "payload": {}}))
            except Exception as e:  # noqa: BLE001 - any failure = dead link
                logger.warning("cTrader heartbeat send failed: %s", e)
                self._mark_disconnected(f"heartbeat send: {e}")
                return
            await asyncio.sleep(_HEARTBEAT_INTERVAL)
            if self._stop or self._disconnect_event.is_set():
                break
            if time.monotonic() - self._last_rx > _HEARTBEAT_TIMEOUT:
                logger.warning("cTrader no server frames in %.0fs", _HEARTBEAT_TIMEOUT)
                self._mark_disconnected("server silence")
                return

    async def disconnect(self) -> None:
        self._stop = True
        self._disconnect_event.set()
        await self._close_transport()

    async def _close_transport(self) -> None:
        self._connected = False
        self._account_authed = False
        for fut in list(self._pending.values()):
            if not fut.done():
                fut.cancel()
        self._pending.clear()
        for fut in list(self._exec_waiters.values()):
            if not fut.done():
                fut.cancel()
        self._exec_waiters.clear()
        if self._reader_task:
            self._reader_task.cancel()
            self._reader_task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:  # noqa: BLE001
                pass
            self._ws = None
        if self._writer:
            try:
                self._writer.close()
            except Exception:  # noqa: BLE001
                pass
            self._writer = None
        self._reader = None

    # ------------------------------------------------------------------
    # transport
    # ------------------------------------------------------------------

    def _transport_open(self) -> bool:
        return self._ws is not None or self._writer is not None

    def _ssl_context(self) -> ssl.SSLContext:
        """TLS context for the gateway.

        The official Spotware clients (Open-API-Example-mobile-trader)
        connect with certificate validation disabled because the gateway
        presents a ``*.spotware.com`` certificate for the
        ``*.ctrader.com`` hostnames.  We mirror that by default; set
        ``CTRADER_SSL_VERIFY=1`` to enforce strict verification instead.
        """
        ctx = ssl.create_default_context()
        if os.environ.get("CTRADER_SSL_VERIFY", "0").lower() not in ("1", "true", "yes"):
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        return ctx

    async def _open_transport(self, host: str) -> None:
        # Empirically verified: wss://<host>:5036 is the live transport
        # (raw TLS TCP is refused with a reset). WebSocket is primary.
        # Mobile links time out the WS opening handshake intermittently
        # (~50% on this device), so retry WS before falling back to TCP.
        modes = ["ws", "tcp"] if self.transport_mode == "auto" else [self.transport_mode]
        last_err: Exception | None = None
        for attempt in range(1, 4):
            for mode in modes:
                try:
                    if mode == "ws":
                        await self._open_ws(f"wss://{host}:{PORT}")
                    else:
                        await self._open_tcp(host)
                    self._transport_used = mode
                    return
                except Exception as e:  # noqa: BLE001 - try the next mode
                    last_err = e
                    logger.warning(
                        "cTrader %s transport attempt %d/3 failed: %s",
                        mode, attempt, e,
                    )
                    await self._close_transport()
            await asyncio.sleep(1.5 * attempt)
        raise BrokerError(
            f"cTrader unreachable ({host}:{PORT}, modes={modes}): {last_err}"
        )

    async def _open_ws(self, uri: str) -> None:
        import websockets

        self._ws = await websockets.connect(
            uri,
            ssl=self._ssl_context(),
            ping_interval=None,   # protocol heartbeats, not WS pings
            ping_timeout=None,
            open_timeout=60,
            max_size=8 * 1024 * 1024,
        )
        self._reader_task = asyncio.create_task(self._ws_reader())

    async def _open_tcp(self, host: str) -> None:
        self._reader, self._writer = await asyncio.open_connection(
            host, PORT, ssl=self._ssl_context(), limit=8 * 1024 * 1024
        )
        self._reader_task = asyncio.create_task(self._tcp_reader())

    async def _ws_reader(self) -> None:
        try:
            async for raw in self._ws:
                try:
                    if isinstance(raw, (bytes, bytearray)):
                        raw = raw.decode("utf-8")
                    self._on_message(json.loads(raw))
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    logger.warning("cTrader unparseable frame: %s", e)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning("cTrader WS reader ended: %s", e)
        self._mark_disconnected("ws reader closed")

    async def _tcp_reader(self) -> None:
        """Read newline/JSON-framed messages; tolerates no-newline framing."""
        buffer = b""
        try:
            while True:
                chunk = await self._reader.read(65536)
                if not chunk:
                    raise EOFError("connection closed by server")
                buffer += chunk
                while True:
                    buffer = buffer.lstrip(b" \r\n")
                    if not buffer:
                        break
                    line_end = buffer.find(b"\n")
                    candidate = buffer if line_end == -1 else buffer[:line_end]
                    try:
                        obj = json.loads(candidate.decode("utf-8"))
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        if line_end != -1:
                            logger.warning("cTrader unparseable line: %.200s", candidate)
                            buffer = buffer[line_end + 1:]
                            continue
                        break  # partial JSON — wait for more data
                    self._on_message(obj)
                    buffer = buffer[line_end + 1:] if line_end != -1 else b""
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning("cTrader TCP reader ended: %s", e)
        self._mark_disconnected("tcp reader closed")

    async def _write(self, text: str) -> None:
        async with self._write_lock:
            if self._ws is not None:
                await self._ws.send(text)
            elif self._writer is not None:
                self._writer.write(text.encode("utf-8"))
                await self._writer.drain()
            else:
                raise BrokerDisconnectedError("cTrader transport closed")

    def _mark_disconnected(self, reason: str) -> None:
        if self._connected:
            logger.info("cTrader disconnected (%s)", reason)
        self._connected = False
        self._account_authed = False
        self._disconnect_event.set()

    # ------------------------------------------------------------------
    # messaging
    # ------------------------------------------------------------------

    def _new_msg_id(self) -> str:
        self._counter += 1
        return f"cmd_{self._counter}"

    def _register_pending(self, msg_id: str) -> asyncio.Future:
        fut = asyncio.get_running_loop().create_future()
        self._pending[msg_id] = fut
        return fut

    async def _send(
        self, payload_type: int, payload: dict | None = None, timeout: float = _REQ_TIMEOUT
    ) -> dict:
        """Send a request and await its reply. Raises BrokerError on 2142."""
        if not self._transport_open():
            raise BrokerDisconnectedError("cTrader not connected")
        msg_id = self._new_msg_id()
        fut = self._register_pending(msg_id)
        envelope = json.dumps(
            {"clientMsgId": msg_id, "payloadType": payload_type, "payload": payload or {}}
        )
        await self._write(envelope)
        try:
            res = await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            self._pending.pop(msg_id, None)
            raise BrokerTimeoutError(
                f"cTrader no reply for payloadType {payload_type} (timeout {timeout}s)"
            ) from None
        except asyncio.CancelledError:
            # Transport teardown (reconnect) cancelled our pending reply.
            # Surface it as a disconnect — not a CancelledError (a
            # BaseException that escapes except-Exception handlers) — so the
            # scan loop and other callers degrade instead of dying.
            self._pending.pop(msg_id, None)
            raise BrokerDisconnectedError(
                f"cTrader request {payload_type} cancelled by disconnect"
            ) from None
        finally:
            self._pending.pop(msg_id, None)
        if res.get("payloadType") == PT_ERROR_RES:
            p = res.get("payload") or {}
            self._raise_error(p.get("errorCode"), p.get("description") or "request failed")
        return res

    def _raise_error(self, code, description: str) -> None:
        if code in (
            ERR_CH_CLIENT_AUTH_FAILURE, ERR_CH_OA_CLIENT_NOT_FOUND,
            ERR_CH_ACCESS_TOKEN_INVALID, ERR_OA_AUTH_TOKEN_EXPIRED,
            ERR_ACCOUNT_NOT_AUTHORIZED, ERR_CH_CTID_ACCOUNT_NOT_FOUND,
        ):
            raise BrokerAuthError(f"cTrader auth error {code}: {description}")
        raise BrokerError(f"cTrader error {code}: {description}")

    def _on_message(self, msg: dict) -> None:
        self._last_rx = time.monotonic()  # any frame proves the link is alive
        client_msg_id = msg.get("clientMsgId")
        if client_msg_id and client_msg_id in self._pending:
            pt = msg.get("payloadType")
            if pt == PT_EXECUTION_EVENT:
                # The server echoes clientMsgId on execution events, including
                # the transient ACCEPTED that precedes a fill. Only resolve the
                # request future on a terminal execution.
                exec_type = (msg.get("payload") or {}).get("executionType")
                terminal = (EXEC_ORDER_FILLED, EXEC_ORDER_PARTIAL_FILL,
                            EXEC_ORDER_REJECTED, EXEC_ORDER_CANCELLED,
                            EXEC_ORDER_EXPIRED, EXEC_ORDER_MODIFIED)
                if exec_type not in terminal:
                    client_msg_id = None  # keep waiting for the terminal event
            if client_msg_id:
                fut = self._pending.pop(client_msg_id, None)
                if fut and not fut.done():
                    fut.set_result(msg)
            # Fall through: the server may echo clientMsgId on asynchronous
            # events too (executions), so those still need dispatching.
        pt = msg.get("payloadType")
        payload = msg.get("payload") or {}
        if pt == PT_HEARTBEAT:
            loop = asyncio.get_running_loop()
            loop.create_task(self._write(json.dumps({"payloadType": PT_HEARTBEAT})))
        elif pt == PT_SPOT_EVENT:
            self._on_spot(payload)
        elif pt == PT_EXECUTION_EVENT:
            self._on_execution(payload)
        elif pt == PT_ORDER_ERROR_EVENT:
            coid = payload.get("clientOrderId")
            if coid and coid in self._exec_waiters:
                fut = self._exec_waiters.get(coid)
                if fut and not fut.done():
                    fut.set_result(payload)
        elif pt == PT_TRADER_UPDATE_EVENT:
            trader = payload.get("trader")
            if isinstance(trader, dict):
                self._trader = trader
        elif pt == PT_TOKEN_INVALIDATED_EVENT:
            logger.error(
                "cTrader access token invalidated (reason: %s) — "
                "will attempt auto-refresh on reconnect",
                payload.get("reason"),
            )
            self._token_invalidated = True
            self._auth_failed = True
            self._mark_disconnected("token invalidated")
        elif pt in (PT_CLIENT_DISCONNECT_EVENT, PT_ACCOUNT_DISCONNECT_EVENT):
            self._mark_disconnected(f"server event {pt}")
        else:
            logger.debug("cTrader unhandled event payloadType=%s", pt)

    # ------------------------------------------------------------------
    # handshake
    # ------------------------------------------------------------------

    async def _handshake(self) -> None:
        if not self.client_id or not self.client_secret:
            raise BrokerAuthError("CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET not set")
        # 1. App auth — validates the Open API app credentials (no token).
        try:
            await self._send(
                PT_APP_AUTH_REQ,
                {"clientId": self.client_id, "clientSecret": self.client_secret},
            )
        except BrokerError as e:
            raise BrokerAuthError(f"cTrader app auth failed: {e}") from e
        logger.info("cTrader app credentials accepted")

        # 2. OAuth access token.
        if not self.access_token:
            raise BrokerAuthError(
                "CTRADER_ACCESS_TOKEN not set — run scripts/ctrader_oauth.py and "
                "put the token into .env (CTRADER_ACCESS_TOKEN=...)"
            )
        # Discover accounts from the token itself; CTRADER_ACCOUNT_ID in
        # .env acts as a *preference*, not an override — a stale id must
        # not fail auth with CH_CTID_TRADER_ACCOUNT_NOT_FOUND.
        accounts = await self._get_accounts(self.access_token)
        picked = self._pick_account(accounts)
        if not picked:
            raise BrokerAuthError(
                "no account found for the access token "
                f"(wanted demo={self.demo}); got: "
                + ", ".join(str(a) for a in accounts)
            )
        self.account_id = str(picked)
        self._ctid_account_id = int(self.account_id)

        # 3. Account auth.
        try:
            await self._send(
                PT_ACCOUNT_AUTH_REQ,
                {
                    "ctidTraderAccountId": self._ctid_account_id,
                    "accessToken": self.access_token,
                },
            )
        except BrokerError as e:
            raise BrokerAuthError(f"cTrader account auth failed: {e}") from e
        self._account_authed = True

        # 4. Pull state. Symbols MUST be cached before reconcile so position
        #    normalization can resolve symbolId -> name (otherwise positions
        #    come back with the raw numeric symbolId).
        await self._fetch_trader()
        await self._fetch_symbols()
        await self._reconcile()
        await self._subscribe_spots()

        # 5. Start the tick consumer (spans reconnects).
        if self._tick_task is None or self._tick_task.done():
            self._tick_task = asyncio.create_task(self._tick_loop())

    async def _get_accounts(self, access_token: str) -> list[dict]:
        res = await self._send(
            PT_GET_ACCOUNTS_REQ, {"accessToken": access_token}, timeout=_REQ_TIMEOUT
        )
        return (res.get("payload") or {}).get("ctidTraderAccount") or []

    def _pick_account(self, accounts: list[dict]) -> int | None:
        wanted = str(self.account_id) if self.account_id else None
        for a in accounts:
            if wanted and str(a.get("ctidTraderAccountId")) == wanted:
                return a.get("ctidTraderAccountId")
        for a in accounts:
            if a.get("isLive") is not self.demo:
                return a.get("ctidTraderAccountId")
        return accounts[0].get("ctidTraderAccountId") if accounts else None

    async def _fetch_trader(self) -> None:
        res = await self._send(PT_TRADER_REQ, {"ctidTraderAccountId": self._ctid_account_id})
        trader = (res.get("payload") or {}).get("trader")
        if isinstance(trader, dict):
            self._trader = trader
        # Asset list -> names for the currency display.
        try:
            res = await self._send(
                PT_ASSET_LIST_REQ, {"ctidTraderAccountId": self._ctid_account_id}
            )
            for asset in (res.get("payload") or {}).get("asset") or []:
                if asset.get("assetId") is not None and asset.get("name"):
                    self._assets[int(asset["assetId"])] = asset["name"]
        except BrokerError as e:
            logger.warning("cTrader asset list failed: %s", e)

    async def _reconcile(self) -> None:
        if not self._account_authed:
            return
        try:
            res = await self._send(
                PT_RECONCILE_REQ,
                {
                    "ctidTraderAccountId": self._ctid_account_id,
                    "returnProtectionOrders": True,
                },
                timeout=_REQ_TIMEOUT,
            )
        except asyncio.CancelledError:
            # The transport cancelled this future while reconnecting; fail
            # cleanly instead of taking down the caller's event loop.
            raise BrokerError("cTrader connection reset during reconcile") from None
        payload = res.get("payload") or {}
        self._positions = [self._norm_position(p) for p in (payload.get("position") or [])]
        self._orders = [self._norm_order(o) for o in (payload.get("order") or [])]
        logger.info(
            "cTrader reconciled: %d positions, %d orders",
            len(self._positions), len(self._orders),
        )
        await self._notify_positions()

    async def _fetch_symbols(self) -> None:
        now = time.monotonic()
        if now - self._last_symbols_fetch < 60 and self._symbols:
            return
        res = await self._send(
            PT_SYMBOLS_LIST_REQ, {"ctidTraderAccountId": self._ctid_account_id}
        )
        for sym in (res.get("payload") or {}).get("symbol") or []:
            sid = sym.get("symbolId")
            sname = sym.get("symbolName")
            if sid is None or not sname:
                continue
            self._symbols[sname.upper()] = int(sid)
            self._symbols_by_id[int(sid)] = sname.upper()
        self._last_symbols_fetch = now
        logger.info("cTrader symbol list: %d symbols cached", len(self._symbols))

    async def _fetch_symbol_meta(self, symbol_id: int) -> dict:
        """Fetch full ProtoOASymbol metadata (digits, volume step) for one
        symbol.  The SymbolsList reply omits these fields; the broker
        rejects relative SL/TP that are not tick-aligned to the symbol's
        digits, so they must come from SymbolById."""
        res = await self._send(
            PT_SYMBOL_BY_ID_REQ,
            {
                "ctidTraderAccountId": self._ctid_account_id,
                "symbolId": int(symbol_id),
            },
        )
        for sym in (res.get("payload") or {}).get("symbol") or []:
            if int(sym.get("symbolId", -1)) != int(symbol_id):
                continue
            # Per-symbol volume scale: FX pairs express volume in raw units
            # of 1/10^7 lot (minVolume ~100000 = 0.01 lot); indices,
            # stocks and crypto use 1/100-lot units (minVolume ~1..100
            # = 0.01..1.00 lot).  A single VOLUME_FACTOR is wrong for
            # non-FX symbols and gets rejected with TRADING_BAD_VOLUME.
            min_vol = sym.get("minVolume")
            vol_scale = VOLUME_FACTOR if (min_vol or 0) >= 10000 else 100
            meta = {
                "min": min_vol,
                "max": sym.get("maxVolume"),
                "step": sym.get("stepVolume"),
                "digits": sym.get("digits"),
                "vol_scale": vol_scale,
            }
            self._symbol_vols[int(symbol_id)] = meta
            return meta
        logger.warning("cTrader SymbolById returned no entry for %s", symbol_id)
        return {}

    async def _symbol_meta_or_fetch(self, symbol_id: int) -> dict:
        meta = self._symbol_vols.get(int(symbol_id)) or {}
        if meta.get("digits") is None:
            meta = await self._fetch_symbol_meta(symbol_id)
        return meta

    def _vol_scale(self, symbol_id: int) -> int:
        try:
            return int(
                (self._symbol_vols.get(int(symbol_id)) or {}).get("vol_scale")
                or VOLUME_FACTOR
            )
        except (TypeError, ValueError):
            return VOLUME_FACTOR

    async def _resolve_symbol(self, symbol: str) -> int:
        """Resolve a logical symbol to a cTrader symbolId.

        Resolution order (fail-closed, always against the live account
        SymbolsList):
          1. exact name match
          2. alias candidates for well-known logical names (BTCUSD ->
             BTCUSD.CRYPTO, US30 -> US 30, ...) — only when the account
             actually lists that exact candidate

        Symbols that still cannot be resolved are recorded in
        ``self.unmapped_symbols`` and raise BrokerError so the caller fails
        closed (never fabricates a price/bar for an unknown symbol).

        The resolved symbolId is remembered as the *logical* symbol so that
        ticks, positions and orders carry the engine's canonical name (US30)
        instead of the broker's display name (US 30).
        """
        sid: int | None = None
        if symbol in self._symbols:
            sid = self._symbols[symbol]
        else:
            await self._fetch_symbols()
            if symbol in self._symbols:
                sid = self._symbols[symbol]
            else:
                for alias in _SYMBOL_ALIASES.get(symbol, ()):
                    if alias in self._symbols:
                        logger.info("cTrader alias: %s -> %s", symbol, alias)
                        sid = self._symbols[alias]
                        break
        if sid is None:
            self.unmapped_symbols.add(symbol)
            raise BrokerError(f"symbol {symbol} not found on this cTrader account")
        self._symbol_id_to_logical[sid] = symbol
        return sid

    async def _subscribe_spots(self) -> None:
        if not self.symbols_wanted:
            return
        ids = []
        for s in self.symbols_wanted:
            try:
                ids.append(await self._resolve_symbol(s))
            except BrokerError:
                logger.warning("cTrader: skip spot subscription for unknown %s", s)
        if not ids:
            return
        # The server can be slow to answer the first subscribe (and a slow
        # reply would otherwise fail the whole connect), so retry with
        # backoff instead of giving up after one timeout.
        for attempt in range(1, 4):
            try:
                await self._send(
                    PT_SUBSCRIBE_SPOTS_REQ,
                    {
                        "ctidTraderAccountId": self._ctid_account_id,
                        "symbolId": ids,
                        "subscribeToSpotTimestamp": True,
                    },
                )
                logger.info("cTrader subscribed to %d spot feeds", len(ids))
                return
            except BrokerError as e:
                logger.warning(
                    "cTrader spot subscription attempt %d/3 failed: %s", attempt, e
                )
                await asyncio.sleep(5 * attempt)
        logger.error("cTrader spot subscription failed after 3 attempts")

    # ------------------------------------------------------------------
    # trading
    # ------------------------------------------------------------------

    def _next_client_order_id(self) -> str:
        self._counter += 1
        return f"fx{int(time.time() * 1000)}{self._counter}"

    async def _await_execution(self, client_order_id: str, timeout: float = _EXEC_TIMEOUT) -> dict:
        """Wait for the execution/order-error event matching a clientOrderId.

        cTrader emits a transient EXEC_ORDER_ACCEPTED event before the
        terminal one (FILLED / REJECTED / ...). Keep waiting until a terminal
        event arrives so callers never see "accepted" as a failure.
        """
        deadline = time.monotonic() + timeout
        terminal = (EXEC_ORDER_FILLED, EXEC_ORDER_PARTIAL_FILL,
                    EXEC_ORDER_REJECTED, EXEC_ORDER_CANCELLED,
                    EXEC_ORDER_EXPIRED, EXEC_ORDER_MODIFIED)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise BrokerTimeoutError(
                    f"cTrader no execution event for {client_order_id} within {timeout}s"
                )
            fut = asyncio.get_running_loop().create_future()
            self._exec_waiters[client_order_id] = fut
            try:
                event = await asyncio.wait_for(fut, remaining)
            except asyncio.TimeoutError:
                raise BrokerTimeoutError(
                    f"cTrader no execution event for {client_order_id} within {timeout}s"
                ) from None
            finally:
                self._exec_waiters.pop(client_order_id, None)
            if event.get("executionType") in terminal:
                return event
            # Transient event (e.g. accepted); keep waiting for the terminal one.

    async def _send_order_request(self, payload_type: int, payload: dict, coid: str) -> dict:
        """Send an order request; resolve from error-reply or execution event."""
        if not self._transport_open() or not self._account_authed:
            raise BrokerDisconnectedError("cTrader not connected")
        msg_id = self._new_msg_id()
        err_fut = self._register_pending(msg_id)
        exec_fut = self._exec_waiters[coid] = asyncio.get_running_loop().create_future()
        await self._write(
            json.dumps({"clientMsgId": msg_id, "payloadType": payload_type, "payload": payload})
        )
        try:
            done, _ = await asyncio.wait(
                {err_fut, exec_fut}, timeout=_EXEC_TIMEOUT, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            self._pending.pop(msg_id, None)
            self._exec_waiters.pop(coid, None)
            for fut in (err_fut, exec_fut):
                if not fut.done():
                    fut.cancel()
        if exec_fut in done:
            if exec_fut.cancelled():
                raise BrokerDisconnectedError(
                    "cTrader order request cancelled by disconnect"
                )
            return exec_fut.result()
        if err_fut in done:
            if err_fut.cancelled():
                raise BrokerDisconnectedError(
                    "cTrader order request cancelled by disconnect"
                )
            res = err_fut.result()
            rt = res.get("payloadType")
            if rt == PT_EXECUTION_EVENT:
                # Server echoed clientMsgId on the execution event itself.
                return res.get("payload") or {}
            if rt == PT_ORDER_ERROR_EVENT:
                p = res.get("payload") or {}
                raise BrokerError(
                    f"cTrader order error {p.get('errorCode')}: "
                    f"{p.get('description', '')}".strip()
                )
            if rt == PT_ERROR_RES:
                p = res.get("payload") or {}
                self._raise_error(p.get("errorCode"), p.get("description") or "order failed")
            raise BrokerError(f"cTrader order failed: unexpected reply {rt}")
        raise BrokerTimeoutError(f"cTrader no execution event within {_EXEC_TIMEOUT}s")

    async def amend_position_sltp(
        self, position_id, stop_loss: float | None = None, take_profit: float | None = None
    ) -> dict:
        """Amend the SL/TP of an open position. Values are real prices;
        None keeps the current level. At least one must be provided."""
        if not self._connected or not self._account_authed:
            raise BrokerDisconnectedError("cTrader not connected")
        if stop_loss is None and take_profit is None:
            raise BrokerError("amend requires stop_loss and/or take_profit")
        payload = {"ctidTraderAccountId": self._ctid_account_id,
                   "positionId": int(position_id)}
        # NOTE: the server validates AMEND SL/TP against the literal bid/ask
        # (unlike NEW_ORDER), so these fields must be sent unscaled.
        if stop_loss is not None:
            payload["stopLoss"] = self._round_price(float(stop_loss))
        if take_profit is not None:
            payload["takeProfit"] = self._round_price(float(take_profit))
        coid = self._next_client_order_id()
        payload["clientOrderId"] = coid
        logger.info("cTrader amend position %s sl=%s tp=%s",
                    position_id, stop_loss, take_profit)
        try:
            event = await self._send_order_request(
                PT_AMEND_POSITION_SLTP_REQ, payload, coid)
        except BrokerTimeoutError:
            # The demo feed often applies the modify but never emits the
            # MODIFIED execution event; reconcile and verify instead of
            # failing the whole trail.
            try:
                await self._reconcile()
                pos = next((p for p in self._positions
                            if str(p.get("position_id")) == str(position_id)), None)
            except Exception:
                pos = None
            if pos is not None and self._sltp_matches(pos, stop_loss, take_profit):
                return {"status": "amended", "verified": True,
                        "position": pos, "note": "applied (verified via reconcile)"}
            raise
        return self._map_execution(event, closing=False)

    @staticmethod
    def _sltp_matches(pos: dict, stop_loss, take_profit) -> bool:
        """True if the position's SL/TP match the requested levels (within
        half a pip) — used to verify amends that timed out on the feed."""
        tol = 0.0005
        if stop_loss is not None:
            cur = pos.get("stop_loss")
            if cur is None or abs(float(cur) - float(stop_loss)) > tol:
                return False
        if take_profit is not None:
            cur = pos.get("take_profit")
            if cur is None or abs(float(cur) - float(take_profit)) > tol:
                return False
        return True

    async def execute_market_order(
        self,
        symbol: str,
        action: str,
        volume_lots: float = 0.01,
        sl: float | None = None,
        tp: float | None = None,
        comment: str = "FX Analyzer Pro",
    ) -> dict:
        if not self._connected or not self._account_authed:
            raise BrokerDisconnectedError("cTrader not connected — broker trades unavailable")
        symbol = symbol.upper().replace("/", "")
        symbol_id = await self._resolve_symbol(symbol)
        side = SIDE_BUY if action == "BUY" else SIDE_SELL

        vol_meta = await self._symbol_meta_or_fetch(symbol_id)
        vol_scale = vol_meta.get("vol_scale") or self._vol_scale(symbol_id)
        raw_volume = int(round(float(volume_lots) * vol_scale))
        if raw_volume <= 0:
            raise BrokerError(f"invalid volume {volume_lots} lot")
        step = vol_meta.get("step") or 1
        if step:
            raw_volume = int(raw_volume / step) * step
        if vol_meta.get("min") and raw_volume < vol_meta["min"]:
            raw_volume = vol_meta["min"]
        if vol_meta.get("max") and raw_volume > vol_meta["max"]:
            raw_volume = vol_meta["max"]

        order = {
            "ctidTraderAccountId": self._ctid_account_id,
            "symbolId": symbol_id,
            "orderType": ORDER_TYPE_MARKET,
            "tradeSide": side,
            "volume": raw_volume,
            "timeInForce": TIF_IMMEDIATE_OR_CANCEL,
            "label": "FX Analyzer",
            "comment": comment,
        }
        # Absolute SL/TP are NOT supported for MARKET orders, so convert to
        # relative values against the current quote (applied by the server
        # to the actual fill price).
        if sl is not None or tp is not None:
            quote = self._last_spot.get(symbol)
            if not quote:
                raise BrokerError(
                    f"no current quote for {symbol} — cannot place SL/TP; "
                    "wait for a tick or retry"
                )
            digits = vol_meta.get("digits") or 5
            entry = quote.get("ask") if action == "BUY" else quote.get("bid")
            if sl is not None:
                dist = (entry - float(sl)) if action == "BUY" \
                    else (float(sl) - entry)
                rel = int(round(round(dist, digits) * PRICE_FACTOR))
                if rel <= 0:
                    raise BrokerError(f"SL {sl} is on the wrong side of the market")
                order["relativeStopLoss"] = rel
            if tp is not None:
                dist = (float(tp) - entry) if action == "BUY" \
                    else (entry - float(tp))
                rel = int(round(round(dist, digits) * PRICE_FACTOR))
                if rel <= 0:
                    raise BrokerError(f"TP {tp} is on the wrong side of the market")
                order["relativeTakeProfit"] = rel

        coid = self._next_client_order_id()
        order["clientOrderId"] = coid
        logger.info(
            "cTrader market order: %s %s %.2f lot (symbolId=%s, rawVolume=%s)",
            symbol, action, volume_lots, symbol_id, raw_volume,
        )
        event = await self._send_order_request(PT_NEW_ORDER_REQ, order, coid)
        return self._map_execution(event)

    async def close_position(
        self, position_id, volume_lots: float | None = None
    ) -> dict:
        if not self._connected or not self._account_authed:
            raise BrokerDisconnectedError("cTrader not connected")
        match = next(
            (p for p in self._positions
             if p.get("position_id") == int(position_id)),
            None,
        )
        if not match and not volume_lots:
            # cTrader requires a volume on CLOSE_POSITION_REQ; default to the
            # full position size, resolved from the position cache.
            try:
                await self._reconcile()
            except BrokerError as e:
                logger.warning("cTrader reconcile failed: %s", e)
            match = next(
                (p for p in self._positions
                 if p.get("position_id") == int(position_id)),
                None,
            )
        if match:
            if not volume_lots:
                volume_lots = float(match.get("volume") or 0)
            close_scale = self._vol_scale(match.get("symbol_id"))
        else:
            close_scale = VOLUME_FACTOR
        if not volume_lots:
            raise BrokerError(f"position {position_id} not found")
        payload = {
            "ctidTraderAccountId": self._ctid_account_id,
            "positionId": int(position_id),
            "volume": int(round(float(volume_lots) * close_scale)),
        }
        coid = self._next_client_order_id()
        payload["clientOrderId"] = coid
        logger.info("cTrader close position %s (volume=%s)", position_id, volume_lots)
        event = await self._send_order_request(PT_CLOSE_POSITION_REQ, payload, coid)
        result = self._map_execution(event, closing=True)
        # The FILLED close event can still carry the closed position; drop it
        # from the cache so stale snapshots never show it as open.
        self._positions = [
            p for p in self._positions if p.get("position_id") != int(position_id)
        ]
        return result

    # ------------------------------------------------------------------
    # state
    # ------------------------------------------------------------------

    async def get_account_info(self) -> dict:
        base = {
            "provider": "ctrader",
            "mode": "demo" if self.demo else "live",
        }
        if not self._connected or not self._account_authed:
            return {
                **base,
                "connected": False,
                "account": None,
                "server": None,
                # Fail closed: never fabricate a zero balance.
                "balance": None,
                "equity": None,
                "currency": None,
                "message": "cTrader not authenticated",
            }
        balance = self._money(self._trader.get("balance"))
        equity = self._money(self._trader.get("equity", self._trader.get("balance")))
        deposit_id = self._trader.get("depositAssetId")
        currency = None
        if deposit_id is not None:
            try:
                currency = self._assets.get(int(deposit_id), str(deposit_id))
            except (ValueError, TypeError):
                currency = str(deposit_id)
        return {
            **base,
            "connected": True,
            "account": self._trader.get("traderLogin"),
            "server": self._trader.get("brokerName"),
            "balance": balance,
            "equity": equity,
            "currency": currency,
            "message": None,
        }

    async def get_positions(self) -> list:
        if not self._connected or not self._account_authed:
            return []
        try:
            await self._reconcile()
        except BrokerError as e:
            logger.warning("cTrader reconcile failed: %s", e)
        return list(self._positions)

    async def get_pending_orders(self) -> list:
        if not self._connected or not self._account_authed:
            return []
        try:
            await self._reconcile()
        except BrokerError as e:
            logger.warning("cTrader reconcile failed: %s", e)
        return [
            o for o in self._orders if o.get("status") == "active"
        ]

    async def get_ohlcv(
        self, symbol: str, timeframe: str = "M15", limit: int = 500
    ) -> list[dict]:
        """Recent OHLCV bars for ``symbol`` via ProtoOAGetTrendbarsReq.

        Returns a list of dicts (oldest first)::

            {"time": int(epoch seconds), "open": float, "high": float,
             "low": float, "close": float, "tick_volume": float}

        Raises BrokerError if the symbol/timeframe is unknown to the
        account — the caller must fail closed (never fabricate bars).
        """
        if not self._connected or not self._account_authed:
            raise BrokerDisconnectedError("cTrader not connected")
        period = TRENDBAR_PERIODS.get((timeframe or "M15").upper(), PERIOD_M15)
        symbol_id = await self._resolve_symbol(symbol)
        res = await self._send(
            PT_GET_TRENDBARS_REQ,
            {
                "ctidTraderAccountId": self._ctid_account_id,
                "symbolId": symbol_id,
                "period": period,
                "priceType": PRICE_TYPE_BID,
                "count": max(1, min(int(limit), 1000)),
            },
            timeout=20.0,
        )
        bars = []
        for tb in (res.get("payload") or {}).get("trendbar") or []:
            # ProtoOATrendbar carries the bar's LOW plus deltas from it:
            #   low, deltaOpen, deltaClose, deltaHigh  (all price-points)
            #   utcTimestampInMinutes (whole minutes since the epoch)
            #   volume
            low = int(tb.get("low") or 0)
            open_pts = low + int(tb.get("deltaOpen") or 0)
            high_pts = low + int(tb.get("deltaHigh") or 0)
            close_pts = low + int(tb.get("deltaClose") or 0)
            bars.append({
                "time": int(tb.get("utcTimestampInMinutes") or 0) * 60,
                "open": open_pts / PRICE_FACTOR,
                "high": high_pts / PRICE_FACTOR,
                "low": low / PRICE_FACTOR,
                "close": close_pts / PRICE_FACTOR,
                "tick_volume": float(tb.get("volume") or 0),
            })
        bars.sort(key=lambda b: b["time"])
        return bars

    # ------------------------------------------------------------------
    # events
    # ------------------------------------------------------------------

    def _on_spot(self, payload: dict) -> None:
        symbol = self._symbol_id_to_logical.get(payload.get("symbolId")) or (
            self._symbols_by_id.get(
                payload.get("symbolId"), str(payload.get("symbolId"))
            )
        )
        ts = payload.get("timestamp") or time.time()
        if ts > 10_000_000_000:  # ProtoOA spot timestamps are milliseconds
            ts /= 1000.0
        bid = (payload.get("bid") or 0) / PRICE_FACTOR
        ask = (payload.get("ask") or 0) / PRICE_FACTOR
        prev = self._last_spot.get(symbol, {})
        # cTrader streams one-sided ticks (bid-only or ask-only, the other
        # side is 0). Merging with the last quote preserves the missing side
        # so _last_spot always carries a valid bid AND ask — otherwise a
        # bid-only tick makes execute_market_order compute a BUY's relative
        # SL from entry=ask=0 and reject it as "wrong side of the market".
        spot = {
            "symbol": symbol,
            "bid": bid if bid > 0 else prev.get("bid", 0.0),
            "ask": ask if ask > 0 else prev.get("ask", 0.0),
            "timestamp": ts,  # epoch seconds, same contract as get_ohlcv()
        }
        self._last_spot[symbol] = spot
        try:
            self._tick_queue.put_nowait(spot)
        except asyncio.QueueFull:
            pass  # slow consumer — drop the tick

    async def _tick_loop(self) -> None:
        while True:
            spot = await self._tick_queue.get()
            cb = self.tick_cb
            if cb:
                try:
                    await cb(spot)
                except Exception as e:  # noqa: BLE001
                    logger.warning("cTrader tick callback error: %s", e)

    def _on_execution(self, payload: dict) -> None:
        order = payload.get("order") or {}
        pos = payload.get("position") or {}
        coid = order.get("clientOrderId")
        # Only resolve waiters on terminal execution events; the transient
        # EXEC_ORDER_ACCEPTED precedes the fill and must not end the wait.
        exec_type = payload.get("executionType")
        if exec_type in (EXEC_ORDER_FILLED, EXEC_ORDER_PARTIAL_FILL,
                         EXEC_ORDER_REJECTED, EXEC_ORDER_CANCELLED,
                         EXEC_ORDER_EXPIRED, EXEC_ORDER_MODIFIED):
            if coid and coid in self._exec_waiters:
                fut = self._exec_waiters.get(coid)
                if fut and not fut.done():
                    fut.set_result(payload)
        # Keep caches fresh so reconcile-on-demand is cheap.
        if pos.get("positionId"):
            if exec_type in (EXEC_ORDER_FILLED, EXEC_ORDER_PARTIAL_FILL,
                             EXEC_ORDER_MODIFIED):
                pid = pos.get("positionId")
                self._positions = [
                    p for p in self._positions if p.get("position_id") != pid
                ]
                norm = self._norm_position(pos)
                # MODIFIED: position still open — refresh SL/TP. FILLED: a
                # full close arrives with volume 0 — keep only what remains.
                if exec_type == EXEC_ORDER_MODIFIED:
                    self._positions.append(norm)
                elif float(norm.get("volume") or 0) > 0:
                    self._positions.append(norm)
            asyncio.get_running_loop().create_task(self._notify_positions())
        if order.get("orderId"):
            self._orders = [
                o for o in self._orders if o.get("order_id") != order.get("orderId")
            ]
            self._orders.append(self._norm_order(order))

    async def _notify_positions(self) -> None:
        cb = self.position_change_cb
        if cb:
            try:
                await cb(list(self._positions))
            except Exception as e:  # noqa: BLE001
                logger.warning("cTrader positions callback error: %s", e)

    def _map_execution(self, event: dict, closing: bool = False) -> dict:
        if "errorCode" in event and "executionType" not in event:
            # ProtoOAOrderErrorEvent
            raise BrokerError(
                f"cTrader order error {event.get('errorCode')}: "
                f"{event.get('description', '')}".strip()
            )
        exec_type = event.get("executionType")
        order = event.get("order") or {}
        pos = event.get("position") or {}
        if exec_type in (EXEC_ORDER_FILLED, EXEC_ORDER_PARTIAL_FILL):
            result = {
                "status": "closed" if closing else "filled",
                "ticket": order.get("orderId"),
                "position_id": pos.get("positionId") or order.get("positionId"),
                "volume": (order.get("executedVolume") or 0)
                / self._vol_scale((order.get("tradeData") or {}).get("symbolId")),
                # cTrader returns the real price in execution events; only
                # spot ticks and candles arrive as integer price-points.
                "price": float(order.get("executionPrice") or 0),
                "message": "filled on cTrader",
            }
            return result
        if exec_type == EXEC_ORDER_REJECTED:
            codes = event.get("errorCode") or []
            desc = event.get("description") or f"rejected (codes: {codes})"
            raise BrokerError(f"cTrader order rejected: {desc}")
        if exec_type in (EXEC_ORDER_CANCELLED, EXEC_ORDER_EXPIRED):
            raise BrokerError(f"cTrader order {exec_type}: cancelled/expired")
        if exec_type == EXEC_ORDER_MODIFIED:
            symbol = (self._symbol_id_to_logical.get(
                (order.get("tradeData") or {}).get("symbolId"))
                or (pos.get("tradeData") or {}).get("symbolId"))
            return {
                "status": "amended",
                "position_id": pos.get("positionId") or order.get("positionId"),
                "stop_loss": self._norm_price(pos.get("stopLoss"), symbol) or None,
                "take_profit": self._norm_price(pos.get("takeProfit"), symbol) or None,
                "message": "position amended on cTrader",
            }
        raise BrokerError(f"cTrader unexpected execution event type {exec_type}")

    # ------------------------------------------------------------------
    # normalization helpers
    # ------------------------------------------------------------------

    def _money(self, raw) -> float:
        if raw is None:
            return 0.0
        digits = self._trader.get("moneyDigits", 2) or 2
        return round(float(raw) / (10 ** digits), 2)

    def _norm_position(self, p: dict) -> dict:
        td = p.get("tradeData") or {}
        symbol = self._symbol_id_to_logical.get(td.get("symbolId")) \
            or self._symbols_by_id.get(td.get("symbolId"), str(td.get("symbolId")))
        return {
            "position_id": p.get("positionId"),
            "symbol": symbol,
            "symbol_id": td.get("symbolId"),
            "side": "BUY" if td.get("tradeSide") == SIDE_BUY else "SELL",
            "volume": (td.get("volume") or 0) / self._vol_scale(td.get("symbolId")),
            "price": self._norm_price(p.get("price"), symbol),
            "stop_loss": self._norm_price(p.get("stopLoss"), symbol) or None,
            "take_profit": self._norm_price(p.get("takeProfit"), symbol) or None,
            "swap": self._money(p.get("swap")),
            "commission": self._money(p.get("commission")),
            "used_margin": self._money(p.get("usedMargin")),
            "label": td.get("label", ""),
        }

    @staticmethod
    def _round_price(price) -> float:
        """Round to the decimal digits the server accepts for this price
        magnitude (the server rejects more digits than the symbol allows)."""
        try:
            digits = max(1, min(5, 5 - int(math.floor(math.log10(abs(price))))))
            return round(price, digits)
        except (ValueError, OverflowError):
            return price

    def _norm_price(self, raw, symbol=None) -> float:
        if not raw:
            return 0.0
        try:
            val = float(raw)
        except (TypeError, ValueError):
            return 0.0
        if symbol:
            ref = self._last_spot.get(symbol) or {}
            spot = ref.get("bid") or ref.get("ask")
            if spot:
                # cTrader sends spot ticks as integer price-points but
                # execution/position/order prices as real floats; pick
                # whichever representation matches the live quote.
                if abs(val / PRICE_FACTOR - spot) < abs(val - spot):
                    return val / PRICE_FACTOR
                return val
        return val

    def _norm_order(self, o: dict) -> dict:
        td = o.get("tradeData") or {}
        symbol = self._symbol_id_to_logical.get(td.get("symbolId")) \
            or self._symbols_by_id.get(td.get("symbolId"), str(td.get("symbolId")))
        return {
            "order_id": o.get("orderId"),
            "symbol": symbol,
            "symbol_id": td.get("symbolId"),
            "side": "BUY" if td.get("tradeSide") == SIDE_BUY else "SELL",
            "volume": (td.get("volume") or 0) / self._vol_scale(td.get("symbolId")),
            "filled_volume": (o.get("executedVolume") or 0)
            / self._vol_scale(td.get("symbolId")),
            "order_type": o.get("orderType"),
            "status": "active" if o.get("orderStatus") == ORDER_STATUS_ACTIVE else "other",
            "price": self._norm_price(o.get("executionPrice"), symbol),
            "stop_loss": self._norm_price(o.get("stopLoss"), symbol) or None,
            "take_profit": self._norm_price(o.get("takeProfit"), symbol) or None,
            "label": td.get("label", ""),
            "position_id": o.get("positionId"),
        }
