#!/usr/bin/env python3
"""Telegram alert when a Clear V1 gas wallet is 72h, 48h or 24h from empty.

Reads runwayHours from the Stablehype API, sends one message per threshold crossed, and
re-arms once a refill lifts a wallet back above it. A wallet with no spend in the last
7 days has no burn rate, so it cannot alert. If the data is stale it warns once rather
than staying silent, since a dead feed looks exactly like healthy wallets.

Env (from /home/figue/diem-relay/.env.alerts, never the clear-route-monitor .env, whose
chat is the depeg channel): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://stablecoin-api.romain-figuereo.workers.dev/api/clear-v1-gas"
STATE_FILE = Path(os.environ.get("GAS_ALERT_STATE", "/home/figue/scripts/clear-gas-alert/state.json"))
THRESHOLDS_HOURS = (24, 48, 72)
MAX_DATA_AGE_SECONDS = 3600
STALE_KEY = "stale"


def level_for(hours):
    return next((t for t in THRESHOLDS_HOURS if hours <= t), None)


def format_alert(wallet, level):
    return (
        f"⛽ Clear V1 gas: {wallet['label']} sous {level}h\n"
        f"Vide dans environ {wallet['runwayHours']:.0f}h, solde {wallet['balanceEth']:.4f} ETH\n"
        f"https://etherscan.io/address/{wallet['address']}"
    )


def evaluate(data, seen, now):
    """Return the messages to send and the new state: {address: lowest level alerted}."""
    seen = dict(seen)
    wallets = data.get("wallets") or []
    updated = data.get("updatedAt")
    blind = (
        not wallets
        or updated is None
        or now - updated > MAX_DATA_AGE_SECONDS
        or any(w.get("balanceEth") is None for w in wallets)
    )
    if blind:
        first = not seen.get(STALE_KEY)
        seen[STALE_KEY] = True
        return (["⚠️ Alerte gas Clear V1 aveugle: données Stablehype périmées ou incomplètes"] if first else []), seen

    seen.pop(STALE_KEY, None)
    messages = []
    for wallet in wallets:
        hours = wallet.get("runwayHours")
        if hours is None:
            continue
        address = wallet["address"]
        level = level_for(hours)
        previous = seen.get(address)
        if level is None:
            seen.pop(address, None)
            continue
        if previous is None or level < previous:
            messages.append(format_alert(wallet, level))
        seen[address] = level
    return messages, seen


def fetch():
    request = urllib.request.Request(API, headers={"User-Agent": "clear-gas-alert"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def send(text):
    body = urllib.parse.urlencode({
        "chat_id": os.environ["TELEGRAM_CHAT_ID"],
        "text": text,
        "disable_web_page_preview": "true",
    }).encode()
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_BOT_TOKEN']}/sendMessage"
    with urllib.request.urlopen(url, data=body, timeout=30) as response:
        if not json.load(response).get("ok"):
            raise RuntimeError("Telegram refused the message")


def main():
    if "--test" in sys.argv:
        send("⛽ Test: alerte gas Clear V1 installée, seuils 72h, 48h, 24h")
        return
    seen = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    messages, new_seen = evaluate(fetch(), seen, time.time())
    for message in messages:
        send(message)
    # Saved after sending: a failed send retries on the next run instead of being lost.
    STATE_FILE.write_text(json.dumps(new_seen))


if __name__ == "__main__":
    main()
