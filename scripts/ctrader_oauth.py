#!/usr/bin/env python3
"""cTrader Open API — OAuth grant helper.

The access token for the cTrader Open API can only be obtained through a
user-facing OAuth grant (login with cTrader ID in a browser).  This script
walks you through it and prints the token to paste into ``.env``.

Usage:
    python scripts/ctrader_oauth.py [--redirect-uri URL] [--code CODE]
                                    [--refresh-token TOKEN] [--write-env]

Examples:
    # Open the auth URL in a browser, then paste the redirect's "code="
    python scripts/ctrader_oauth.py --code 5e...abcdef

    # Let the script catch the redirect on http://127.0.0.1:8766/callback
    python scripts/ctrader_oauth.py --listen

    # Renew an expiring access token with a stored refresh token
    python scripts/ctrader_oauth.py --refresh-token RT_xxxx

Exit code 0 with tokens printed on success.
"""

import argparse
import json
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

AUTH_URL = "https://openapi.ctrader.com/apps/auth"
TOKEN_URL = "https://openapi.ctrader.com/apps/token"
DEFAULT_REDIRECT = "http://127.0.0.1:8766/callback"

REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / ".env"


def load_env() -> dict:
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def http_get(params: dict) -> dict:
    url = TOKEN_URL + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def exchange_code(client_id, client_secret, redirect_uri, code) -> dict:
    return http_get({
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
    })


def exchange_refresh(client_id, client_secret, refresh_token) -> dict:
    return http_get({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    })


def write_env(tokens: dict) -> None:
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    seen = set()
    out = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else None
        if key in ("CTRADER_ACCESS_TOKEN", "CTRADER_REFRESH_TOKEN"):
            seen.add(key)
            continue  # drop the old value
        out.append(line)
    if "CTRADER_ACCESS_TOKEN" not in seen:
        out.append("")
    out.append(f"CTRADER_ACCESS_TOKEN={tokens['access_token']}")
    if tokens.get("refresh_token"):
        if "CTRADER_REFRESH_TOKEN" not in seen:
            out.append("")
        out.append(f"CTRADER_REFRESH_TOKEN={tokens['refresh_token']}")
    out.append("")
    ENV_FILE.write_text("\n".join(out))
    print(f"\nWrote access token into {ENV_FILE}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-id", help="Open API client id (default: from .env)")
    parser.add_argument("--client-secret", help="Open API client secret (default: from .env)")
    parser.add_argument("--redirect-uri", default=DEFAULT_REDIRECT)
    parser.add_argument("--code", help="Authorization code from the redirect URL")
    parser.add_argument("--refresh-token", help="Refresh token to renew an access token")
    parser.add_argument("--listen", action="store_true",
                        help="Run a local HTTP server to capture the code automatically")
    parser.add_argument("--write-env", action="store_true",
                        help="Write the tokens into .env automatically")
    args = parser.parse_args()

    env = load_env()
    client_id = args.client_id or env.get("CTRADER_CLIENT_ID") or ""
    client_secret = args.client_secret or env.get("CTRADER_CLIENT_SECRET") or ""
    if not client_id or not client_secret:
        print("ERROR: client id/secret missing — set them in .env or pass --client-id/--client-secret")
        return 1

    if args.refresh_token:
        print("Refreshing access token...")
        tokens = exchange_refresh(client_id, client_secret, args.refresh_token)
        print(json.dumps(tokens, indent=2))
        if args.write_env:
            write_env(tokens)
        print("\nNext: paste CTRADER_ACCESS_TOKEN into .env (or use --write-env).")
        return 0

    code = args.code

    if args.listen and not code:
        captured = {}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                captured["code"] = query.get("code", [""])[0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                body = b"<html><body><h2>FX Analyzer</h2>"
                if captured["code"]:
                    body += b"<p>Authorization captured. You can close this tab.</p>"
                else:
                    body += b"<p>No code received. Close this tab and re-run.</p>"
                self.wfile.write(body + b"</body></html>")

            def log_message(self, fmt, *args):
                pass

        redirect = urllib.parse.urlparse(args.redirect_uri)
        if redirect.hostname not in ("127.0.0.1", "localhost"):
            print("ERROR: --listen requires a 127.0.0.1 or localhost redirect URI")
            return 1
        server = HTTPServer((redirect.hostname or "127.0.0.1", redirect.port or 8766), Handler)
        print(f"Listening on {args.redirect_uri} — open the URL below and grant access.")
        server.handle_request()
        server.handle_request()
        server.server_close()
        code = captured.get("code")

    if not code:
        auth_params = urllib.parse.urlencode({
            "client_id": client_id,
            "redirect_uri": args.redirect_uri,
            "scope": "trading",
        })
        print("=" * 72)
        print("1. Open this URL in a browser and log in with your cTrader ID:")
        print(f"\n   {AUTH_URL}?{auth_params}\n")
        print("2. After granting access, the browser redirects to:")
        print(f"   {args.redirect_uri}?code=XXXXXX")
        print("3. Run this script again with the code:")
        print(f"   python scripts/ctrader_oauth.py --code XXXXXX")
        print("=" * 72)
        return 1

    print("Exchanging the authorization code for tokens...")
    tokens = exchange_code(client_id, client_secret, args.redirect_uri, code)
    if "access_token" not in tokens:
        print(f"ERROR: token exchange failed: {tokens}")
        return 1
    print(json.dumps(tokens, indent=2))
    if args.write_env:
        write_env(tokens)
    else:
        print("\nNext: paste the values into .env (or re-run with --write-env):")
        print(f"   CTRADER_ACCESS_TOKEN={tokens['access_token']}")
        if tokens.get("refresh_token"):
            print(f"   CTRADER_REFRESH_TOKEN={tokens['refresh_token']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
