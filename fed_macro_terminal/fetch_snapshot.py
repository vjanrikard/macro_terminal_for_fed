"""
Fetches FRED series observations and writes data/fred_snapshot.json.
Run by GitHub Actions on deploy and on a daily schedule.
Uses FRED API when key is available, otherwise falls back to public CSV endpoint.
"""
import urllib.request
import urllib.error
import json
import os
import time
import datetime
import csv
import io

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
FRED_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv?id="

SERIES = [
    ("FEDFUNDS",       24),
    ("CPIAUCSL",       84),
    ("CPILFESL",       84),
    ("PCEPI",          84),
    ("PCEPILFE",       84),
    ("UNRATE",         60),
    ("PAYEMS",         60),
    ("GDPC1",          28),
    ("INDPRO",         60),
    ("DGS2",          120),
    ("DGS10",         120),
    ("DGS30",          60),
    ("T10Y2Y",        120),
    ("WALCL",         120),
    ("M2SL",           72),
    ("BAMLH0A0HYM2",  120),
    ("CIVPART",        60),
    ("JTSJOL",         60),
    ("DGS1MO",         60),
    ("DGS3MO",         60),
    ("DGS6MO",         60),
    ("DGS1",           60),
    ("DGS5",           60),
    ("DGS7",           60),
    ("DGS20",          60),
    ("NFCI",           60),
]


def fetch_series(api_key, series_id, limit):
    if not api_key:
        return fetch_series_csv(series_id, limit)

    url = (
        f"{FRED_BASE}"
        f"?series_id={series_id}"
        f"&api_key={api_key}"
        f"&file_type=json"
        f"&limit={limit}"
        f"&sort_order=desc"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "macro-terminal/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
    observations = [
        o for o in data.get("observations", [])
        if o.get("value", ".") != "."
    ]
    observations.reverse()
    return observations


def fetch_series_csv(series_id, limit):
    url = f"{FRED_CSV_BASE}{series_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "macro-terminal/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        csv_text = resp.read().decode("utf-8")

    reader = csv.DictReader(io.StringIO(csv_text))
    observations = []
    for row in reader:
        date = row.get("DATE")
        raw_value = row.get(series_id)
        if not date or raw_value in (None, "", "."):
            continue
        try:
            value = float(raw_value)
        except ValueError:
            continue
        observations.append({"date": date, "value": value})

    if limit and len(observations) > limit:
        observations = observations[-limit:]
    return observations


def main():
    api_key = os.environ.get("FRED_API_KEY", "").strip()
    if not api_key:
        print("WARN: FRED_API_KEY not set. Falling back to public CSV source.")

    result = {}
    for series_id, limit in SERIES:
        try:
            obs = fetch_series(api_key, series_id, limit)
            result[series_id] = obs
            print(f"  OK  {series_id}: {len(obs)} observations")
        except Exception as exc:
            print(f"  WARN {series_id}: {exc}")
        time.sleep(0.25)

    os.makedirs("data", exist_ok=True)
    snapshot = {
        "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "series": result,
    }
    out_path = os.path.join("data", "fred_snapshot.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh)

    loaded = sum(1 for v in result.values() if v)
    print(f"\nSnapshot written to {out_path} — {loaded}/{len(SERIES)} series loaded.")


if __name__ == "__main__":
    main()
