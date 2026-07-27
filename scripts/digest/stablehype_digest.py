#!/usr/bin/env python3
"""Stablehype Daily Digest — AI-written stablecoin market recap posted to Telegram.

Runs daily on the NUC (systemd timer). Reads only the public Stablehype worker
API, asks the local LLM router (:4001) for a short narrative, and falls back to
a pure template when the router is down.

Env (sourced from clear-route-monitor's .env via the systemd unit):
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
Optional:
  STABLEHYPE_API   (default https://stablecoin-api.pharos-api.workers.dev)
  LLM_ROUTER_URL   (default http://localhost:4001/v1/chat/completions)
"""

import json
import os
import sys
import time
import urllib.request

API = os.environ.get("STABLEHYPE_API", "https://stablecoin-api.pharos-api.workers.dev")
ROUTER = os.environ.get("LLM_ROUTER_URL", "http://localhost:4001/v1/chat/completions")


def get(path: str, timeout: int = 20):
    req = urllib.request.Request(f"{API}{path}", headers={"User-Agent": "stablehype-digest/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def fmt_usd(v):
    if v is None:
        return "n/a"
    sign = "-" if v < 0 else ""
    a = abs(v)
    for unit, div in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if a >= div:
            return f"{sign}${a / div:.2f}{unit}"
    return f"{sign}${a:.0f}"


def collect():
    data = {}
    data["market_index"] = get("/api/market-index")
    data["flows"] = get("/api/flows")
    data["peg"] = get("/api/peg-summary")
    try:
        data["depegs"] = get("/api/depeg-events?active=true&limit=10")
    except Exception:
        data["depegs"] = None
    try:
        data["blacklist"] = get("/api/blacklist?limit=20")
    except Exception:
        data["blacklist"] = None
    return data


def build_facts(d):
    """Compact factual block handed to the LLM (and used by the fallback)."""
    idx = d["market_index"]["index"]
    hist = d["market_index"].get("history") or []
    prev = hist[-2]["score"] if len(hist) >= 2 else None
    flows = d["flows"]["summary"]
    peg = d["peg"].get("summary") or {}

    facts = {
        "smi_score": idx["score"],
        "smi_band": idx["bandLabel"],
        "smi_prev": prev,
        "active_depegs": idx["activeDepegCount"],
        "stressed_coins": idx["stressedCount"],
        "coins_tracked": idx["coinsConsidered"],
        "gauge": flows["gauge"],
        "gauge_band": flows["band"],
        "minted_24h": flows["mint24hUsd"],
        "burned_24h": flows["burn24hUsd"],
        "net_24h": flows["net24hUsd"],
        "top_mint": flows["topMint24h"][:3],
        "top_burn": flows["topBurn24h"][:3],
        "median_deviation_bps": peg.get("medianDeviationBps"),
        "worst_current": peg.get("worstCurrent"),
    }

    events = (d.get("depegs") or {}).get("events") if isinstance(d.get("depegs"), dict) else d.get("depegs")
    if isinstance(events, list):
        facts["active_depeg_events"] = [
            {"symbol": e.get("symbol"), "peakBps": e.get("peakDeviationBps"), "direction": e.get("direction")}
            for e in events[:8]
        ]

    bl = d.get("blacklist")
    bl_events = bl.get("events") if isinstance(bl, dict) else bl
    if isinstance(bl_events, list):
        cutoff = time.time() - 86400
        recent = [e for e in bl_events if (e.get("timestamp") or 0) >= cutoff]
        facts["freezes_24h"] = len(recent)
        facts["freeze_amount_24h"] = sum((e.get("amount") or 0) for e in recent)
    return facts


def llm_narrative(facts):
    prompt = (
        "You write the Stablehype Daily Digest, a terse stablecoin market recap. "
        "Using ONLY the facts below, write 4-7 short sentences in plain English. "
        "Rules: lead with overall market state (index + band); mention the bank-run gauge "
        "only if outside -10..+10; name specific coins for notable flows, depegs, or freezes; "
        "prefix genuinely concerning items with WATCH: / ALERT: on their own line at the end "
        "(omit if nothing qualifies); no hype, no advice, no emojis, never invent numbers.\n\n"
        f"FACTS:\n{json.dumps(facts, indent=1)}"
    )
    body = json.dumps({
        "model": "router",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500,
        "temperature": 0.4,
    }).encode()
    req = urllib.request.Request(
        ROUTER, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.loads(r.read().decode())
    return out["choices"][0]["message"]["content"].strip()


def fallback_narrative(facts):
    lines = [
        f"Market index at {facts['smi_score']} ({facts['smi_band']})"
        + (f", vs {facts['smi_prev']} yesterday." if facts.get("smi_prev") is not None else "."),
        f"{facts['active_depegs']} active depegs, {facts['stressed_coins']} coins under stress.",
        f"24h flows: {fmt_usd(facts['minted_24h'])} minted, {fmt_usd(facts['burned_24h'])} burned "
        f"(net {fmt_usd(facts['net_24h'])}).",
    ]
    if facts.get("gauge") is not None and abs(facts["gauge"]) > 10:
        lines.append(f"Bank-run gauge at {facts['gauge']:+d} ({facts['gauge_band']}).")
    return " ".join(lines)


def main():
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not bot_token or not chat_id:
        sys.exit("ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set")

    data = collect()
    facts = build_facts(data)

    try:
        narrative = llm_narrative(facts)
        source = "ai"
    except Exception as e:
        print(f"[digest] LLM router failed ({e}), using template fallback", file=sys.stderr)
        narrative = fallback_narrative(facts)
        source = "template"

    date = time.strftime("%d %b %Y")
    gauge = facts.get("gauge")
    gauge_str = f"{gauge:+d}" if gauge is not None else "n/a"
    msg = (
        f"<b>Stablehype Daily Digest — {date}</b>\n"
        f"SMI <b>{facts['smi_score']}</b> ({facts['smi_band']}) · Gauge {gauge_str}\n\n"
        f"{narrative}\n\n"
        f"<a href=\"https://stablehype.xyz/\">stablehype.xyz</a> · digest:{source}"
    )

    body = json.dumps({
        "chat_id": chat_id,
        "text": msg,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        resp = json.loads(r.read().decode())
    if not resp.get("ok"):
        sys.exit(f"ERROR: Telegram send failed: {resp}")
    print(f"[digest] sent ({source}), SMI {facts['smi_score']} {facts['smi_band']}")


if __name__ == "__main__":
    main()
