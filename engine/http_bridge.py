"""
HTTP + SSE bridge — zero-dependency fallback transport for the Node backend.

The Node ``zeromq`` native addon cannot be built on every platform (e.g.
Termux/Android), which leaves the backend without a ZMQ path to the
engine.  This module exposes the engine's ZMQ REP command socket and PUB
event stream over plain HTTP / Server-Sent Events using only the Python
standard library:

    POST  /cmd     {"cmd": "EXECUTE_TRADE", ...}  -> engine REP response (JSON)
    GET   /events  Server-Sent Events stream of engine PUB frames
    GET   /health  {"status": "ok"|"degraded", "transport": "http-bridge",
                    "zmq_pub": 5565, "zmq_cmd": 5566,
                    "subsystems": {broker, datafeed, llm, calendar, rag},
                    "uptime_seconds": N}

The bridge connects to the engine's own ZMQ sockets over loopback, so no
engine event-loop changes are required.  It runs in a daemon thread
started by ``bridge.py``.
"""

import json
import logging
import os
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import zmq

logger = logging.getLogger(__name__)

# Engine PUB topics the backend cares about
_SUB_TOPICS = (b"ticker", b"signal", b"vibe-research", b"notification", b"positions")

# Optional live-status provider registered by the engine bridge once it is
# constructed (see engine.bridge.AsyncEngineBridge.status_snapshot).  The
# /health endpoint calls it for broker/datafeed state; without it the
# endpoint falls back to env- and import-based facts.  Must never raise.
_status_provider = None
_provider_lock = threading.Lock()

# Presence of any of these env vars marks the llm subsystem as configured.
# Only the NAMES are checked — values are never read or logged.
_LLM_KEYS = ("OPENCODE_API_KEY",)

# Monotonic clock for /health uptime_seconds (module import == bridge start).
_STARTED_MONO = time.monotonic()


def register_status_provider(provider) -> None:
    """Register a callable returning {"broker": ..., "datafeed": ...}.

    Called by the engine bridge once it is fully constructed; may be called
    again to swap the provider.  Pass None to clear.
    """
    global _status_provider
    with _provider_lock:
        _status_provider = provider


class _EventsHub:
    """Fans out engine PUB frames to connected SSE clients."""

    def __init__(self, pub_port: int):
        self._pub_port = pub_port
        self._clients: dict[int, queue.Queue] = {}
        self._lock = threading.Lock()
        self._next_id = 0

    def register(self) -> tuple[int, queue.Queue]:
        with self._lock:
            self._next_id += 1
            q: queue.Queue = queue.Queue(maxsize=200)
            self._clients[self._next_id] = q
            return self._next_id, q

    def unregister(self, client_id: int) -> None:
        with self._lock:
            self._clients.pop(client_id, None)

    def run(self) -> None:
        """Subscribe to the engine PUB socket and dispatch frames."""
        ctx = zmq.Context()
        sock = ctx.socket(zmq.SUB)
        sock.setsockopt(zmq.LINGER, 0)
        sock.connect(f"tcp://127.0.0.1:{self._pub_port}")
        for topic in _SUB_TOPICS:
            sock.subscribe(topic)
        logger.info("HTTP bridge: subscribed to engine PUB on :%s", self._pub_port)

        poller = zmq.Poller()
        poller.register(sock, zmq.POLLIN)
        last_heartbeat = time.monotonic()
        while True:
            try:
                # Heartbeat every 15s so proxies/clients keep the connection open
                now = time.monotonic()
                if now - last_heartbeat >= 15:
                    self._broadcast(None)
                    last_heartbeat = now

                events = dict(poller.poll(2000))
                if sock not in events:
                    continue
                parts = sock.recv_multipart()
                frame = parts[0].decode("utf-8", "replace")
                # Engine sends a single frame: "<topic> <json>"
                space = frame.find(" ")
                if space == -1:
                    continue
                topic, payload = frame[:space], frame[space + 1:].strip()
                try:
                    data = json.loads(payload)
                except (json.JSONDecodeError, ValueError):
                    logger.warning("HTTP bridge: unparseable PUB payload for %s", topic)
                    continue
                self._broadcast({"topic": topic, "data": data})
            except Exception as e:  # noqa: BLE001 - keep the stream alive
                logger.error("HTTP bridge events loop error: %s", e)
                time.sleep(1)

    def _broadcast(self, event: dict | None) -> None:
        payload = "data: " + json.dumps(event) + "\n\n" if event else ": ping\n\n"
        with self._lock:
            for client_id, q in list(self._clients.items()):
                try:
                    q.put_nowait(payload)
                except queue.Full:
                    # Slow consumer — drop it before it stalls the hub
                    self._clients.pop(client_id, None)


def _send_command(cmd_port: int, body: dict, timeout_ms: int) -> dict:
    """Forward one command to the engine REP socket and await its reply."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.setsockopt(zmq.LINGER, 0)
    sock.connect(f"tcp://127.0.0.1:{cmd_port}")
    try:
        sock.send_json(body)
        poller = zmq.Poller()
        poller.register(sock, zmq.POLLIN)
        # zmq.Poller.poll takes MILLISECONDS
        if not poller.poll(timeout_ms):
            return {
                "status": "error",
                "message": f"Engine command timeout after {timeout_ms}ms",
            }
        reply = sock.recv_json()
        return reply if isinstance(reply, dict) else {"status": "ok", "payload": reply}
    except Exception as e:  # noqa: BLE001
        logger.error("HTTP bridge command error: %s", e)
        return {"status": "error", "message": f"Engine command failed: {e}"}
    finally:
        sock.close(linger=0)
        ctx.term()


class _BridgeHandler(BaseHTTPRequestHandler):
    server_version = "FxEngineBridge/1.0"

    # The hub + ports are attached to the server instance by start_http_bridge
    @property
    def hub(self) -> _EventsHub:
        return self.server.hub_ref  # type: ignore[attr-defined]

    @property
    def cmd_port(self) -> int:
        return self.server.cmd_port_ref  # type: ignore[attr-defined]

    # -- helpers ---------------------------------------------------------

    def _send_json(self, obj: dict, status: int = 200) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _subsystems(self) -> dict:
        """Best-effort subsystem health introspection — never raises."""
        broker = "unknown"
        datafeed = "unknown"
        unmapped: list = []
        try:
            with _provider_lock:
                provider = _status_provider
            if provider is not None:
                snap = provider() or {}
                broker = str(snap.get("broker", "unknown"))
                datafeed = str(snap.get("datafeed", "unknown"))
                # Logical symbols the live account lists under no known name
                # — operator-facing coverage signal (fail-closed: no data).
                unmapped = sorted(set(snap.get("unmapped_symbols") or []))
            elif os.environ.get("BROKER_PROVIDER", "").strip().lower() == "mock":
                # No engine status provider yet, and mock is explicitly set:
                # the mock broker is always connected (dry-run only).
                broker = "connected"
        except Exception:  # noqa: BLE001 - /health must never crash
            logger.warning("HTTP bridge: subsystem introspection failed",
                           exc_info=True)

        llm = "configured" if any(os.environ.get(k) for k in _LLM_KEYS) else "missing"

        rag = "unknown"
        try:
            from engine.rag import retriever, store, rss_loader  # noqa: F401
            rag = "ok"
        except ImportError:
            try:
                from rag import retriever, store, rss_loader  # noqa: F401
                rag = "ok"
            except ImportError:
                rag = "unknown"

        return {
            "broker": broker,
            "datafeed": datafeed,
            "llm": llm,
            "calendar": "unavailable",  # no calendar feed wired in; never fabricated
            "rag": rag,
            "unmapped_symbols": unmapped,
        }

    def _health(self) -> dict:
        """Assemble the /health payload (subsystem introspection never raises)."""
        subsystems = self._subsystems()
        status = "ok"
        if (subsystems.get("broker") != "connected"
                or subsystems.get("datafeed") in ("degraded", "mock")):
            status = "degraded"
        return {
            "status": status,
            "transport": "http-bridge",
            "zmq_pub": getattr(self.server, "pub_port_ref", 5565),
            "zmq_cmd": self.cmd_port,
            "subsystems": subsystems,
            "uptime_seconds": int(time.monotonic() - _STARTED_MONO),
        }

    def log_message(self, fmt, *args):  # keep the console quiet
        logger.debug("HTTP bridge: %s - %s", self.address_string(), fmt % args)

    # -- routes ----------------------------------------------------------

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/events"):
            self._stream_events()
        elif self.path == "/health" or self.path.startswith("/health?"):
            self._send_json(self._health())
        else:
            self._send_json({"status": "error", "message": "Not found"}, 404)

    def do_POST(self):  # noqa: N802
        if not self.path.startswith("/cmd"):
            self._send_json({"status": "error", "message": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (ValueError, json.JSONDecodeError):
            self._send_json({"status": "error", "message": "Invalid JSON body"}, 400)
            return

        timeout_ms = int(body.pop("timeout", 60000))
        if "cmd" not in body:
            self._send_json({"status": "error", "message": "Missing cmd field"}, 400)
            return
        self._send_json(_send_command(self.cmd_port, body, timeout_ms))

    # -- SSE -------------------------------------------------------------

    def _stream_events(self) -> None:
        client_id, q = self.hub.register()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            while True:
                try:
                    self.wfile.write(q.get(timeout=20).encode("utf-8"))
                    self.wfile.flush()
                except queue.Empty:
                    # Keep-alive comment to ride out silent periods
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            self.hub.unregister(client_id)


def start_http_bridge(pub_port: int = 5565, cmd_port: int = 5566,
                      http_port: int = 8765) -> threading.Thread:
    """Start the HTTP/SSE bridge in a daemon thread (idempotent)."""
    if getattr(start_http_bridge, "_started", False):
        return start_http_bridge._thread  # type: ignore[attr-defined]

    hub = _EventsHub(pub_port)
    thread = threading.Thread(target=hub.run, name="http-bridge-events", daemon=True)
    thread.start()

    class BridgeServer(ThreadingHTTPServer):
        daemon_threads = True
        hub_ref = hub
        pub_port_ref = pub_port
        cmd_port_ref = cmd_port

    server = BridgeServer(("127.0.0.1", http_port), _BridgeHandler)
    server_thread = threading.Thread(
        target=server.serve_forever, name="http-bridge-http", daemon=True
    )
    server_thread.start()
    logger.info("HTTP bridge listening on http://127.0.0.1:%s (cmd :%s, pub :%s)",
                http_port, cmd_port, pub_port)

    start_http_bridge._started = True  # type: ignore[attr-defined]
    start_http_bridge._thread = server_thread  # type: ignore[attr-defined]
    return server_thread
