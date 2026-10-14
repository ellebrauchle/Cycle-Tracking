#!/usr/bin/env python3
"""Ingest the newest Clue export, normalize it, and prune older exports.

Clue's export arrives as a dated folder (ClueDataDownload-YYYY-MM-DD) in the
iCloud PetalPing folder. Each new export is a FULL history dump, so the newest
one always supersedes the rest -- there is no delta to reconcile.

Usage:
    ./ingest.py            # ingest newest export, keep old folders
    ./ingest.py --prune    # ingest, then delete superseded export folders
"""

import json
import re
import shutil
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ICLOUD = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/PetalPing"
PROJECT = Path(__file__).parent
DATA = PROJECT / "data"
ENV_FILE = PROJECT / ".env"

EXPORT_GLOB = "ClueDataDownload-*"
DATE_IN_NAME = re.compile(r"(\d{4}-\d{2}-\d{2})")


def find_exports():
    """All Clue export folders, newest first (by date in name, then mtime)."""
    folders = [p for p in ICLOUD.glob(EXPORT_GLOB) if p.is_dir()]

    def sort_key(p):
        m = DATE_IN_NAME.search(p.name)
        stamp = date.fromisoformat(m.group(1)) if m else date.min
        return (stamp, p.stat().st_mtime)

    return sorted(folders, key=sort_key, reverse=True)


def load_measurements(export_dir):
    src = export_dir / "measurements.json"
    if not src.exists():
        raise FileNotFoundError(f"no measurements.json in {export_dir.name}")
    return json.loads(src.read_text())


def group_episodes(period_days):
    """Collapse consecutive period days into episodes."""
    if not period_days:
        return []
    episodes, current = [], [period_days[0]]
    for day in period_days[1:]:
        if (day["date"] - current[-1]["date"]).days == 1:
            current.append(day)
        else:
            episodes.append(current)
            current = [day]
    episodes.append(current)
    return episodes


def normalize(records):
    """Turn raw Clue records into a clean store: episodes, cycles, symptoms."""
    periods, symptoms = [], []
    for r in records:
        entry = {"date": date.fromisoformat(r["date"]), "type": r["type"]}
        if r["type"] == "period":
            entry["flow"] = r.get("value", {}).get("option")
            periods.append(entry)
        else:
            # Symptoms are not yet confirmed to appear in Clue exports (see Q1
            # in the decisions doc). Capture whatever shows up so we notice.
            entry["value"] = r.get("value")
            symptoms.append(entry)

    periods.sort(key=lambda e: e["date"])
    episodes = group_episodes(periods)

    starts = [ep[0]["date"] for ep in episodes]
    cycle_lengths = [(starts[i + 1] - starts[i]).days for i in range(len(starts) - 1)]

    return {
        "episodes": [
            {
                "start": ep[0]["date"].isoformat(),
                "end": ep[-1]["date"].isoformat(),
                "length_days": len(ep),
                "flow_by_day": [d["flow"] for d in ep],
            }
            for ep in episodes
        ],
        "cycle_lengths": cycle_lengths,
        "symptoms": [
            {**s, "date": s["date"].isoformat()} for s in symptoms
        ],
    }


def predict(store):
    """Next period estimate. Deliberately a window, not a single date (D4)."""
    lengths = store["cycle_lengths"]
    if not lengths or not store["episodes"]:
        return None

    last_episode = store["episodes"][-1]
    last_start = date.fromisoformat(last_episode["start"])
    avg = sum(lengths) / len(lengths)

    return {
        "last_period_start": last_start.isoformat(),
        "last_period_length": last_episode["length_days"],
        "complete_cycles": len(lengths),
        "avg_cycle_length": round(avg, 1),
        "point_estimate": (last_start + timedelta(days=round(avg))).isoformat(),
        "window_start": (last_start + timedelta(days=min(lengths))).isoformat(),
        "window_end": (last_start + timedelta(days=max(lengths))).isoformat(),
        # With n=2 any confidence claim is false precision. Say so in the data.
        "confidence": "low" if len(lengths) < 4 else "moderate",
        "generated_at": date.today().isoformat(),
    }


def load_env():
    """Read .env without a dependency. Never printed or logged."""
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def upload(prediction):
    """Send ONLY the prediction to the server.

    The full history -- every logged day, every symptom -- stays on this machine.
    The server needs to know when to notify, not what the data says.
    """
    env = load_env()
    app_url = env.get("APP_URL")
    secret = env.get("UPLOAD_SECRET")

    if not app_url or not secret:
        print("\nSkipped upload: APP_URL or UPLOAD_SECRET missing from .env")
        return False

    req = urllib.request.Request(
        f"{app_url.rstrip('/')}/api/data",
        data=json.dumps(prediction).encode(),
        headers={"Content-Type": "application/json", "X-Upload-Secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status == 200:
                print(f"\nUploaded prediction to {app_url}")
                return True
            print(f"\nUpload returned HTTP {resp.status}")
    except urllib.error.HTTPError as err:
        print(f"\nUpload failed: HTTP {err.code} — {err.read().decode()[:200]}")
    except urllib.error.URLError as err:
        # Offline is normal and not an error worth failing the whole run over.
        print(f"\nUpload skipped (no connection): {err.reason}")
    return False


def main():
    prune = "--prune" in sys.argv

    if not ICLOUD.exists():
        sys.exit(f"iCloud folder not found: {ICLOUD}")

    exports = find_exports()
    if not exports:
        sys.exit(f"No {EXPORT_GLOB} folders in {ICLOUD}")

    newest, superseded = exports[0], exports[1:]
    print(f"Using export:  {newest.name}")

    records = load_measurements(newest)
    store = normalize(records)
    store["source_export"] = newest.name
    store["prediction"] = predict(store)

    DATA.mkdir(exist_ok=True)
    out = DATA / "cycles.json"
    out.write_text(json.dumps(store, indent=2))

    # --- summary ---
    print(f"Records read:  {len(records)}")
    print(f"Periods:       {len(store['episodes'])} episodes")
    print(f"Symptoms:      {len(store['symptoms'])}", end="")
    print("  <-- still none exported (Q1 unresolved)" if not store["symptoms"] else "")

    for ep in store["episodes"]:
        flow = " ".join(f or "?" for f in ep["flow_by_day"])
        print(f"   {ep['start']} -> {ep['end']}  ({ep['length_days']}d)  {flow}")

    p = store["prediction"]
    if p:
        print(f"\nCycle lengths: {store['cycle_lengths']} (avg {p['avg_cycle_length']})")
        print(f"Next period:   {p['window_start']} to {p['window_end']}"
              f"  (est. {p['point_estimate']}, confidence: {p['confidence']})")

    print(f"\nWrote {out.relative_to(PROJECT)}")

    if p:
        upload(p)

    # --- prune ---
    if superseded:
        if prune:
            for folder in superseded:
                shutil.rmtree(folder)
                print(f"Removed superseded export: {folder.name}")
        else:
            print(f"\n{len(superseded)} superseded export(s) left in place:")
            for folder in superseded:
                print(f"   {folder.name}")
            print("Re-run with --prune to delete them.")


if __name__ == "__main__":
    main()
