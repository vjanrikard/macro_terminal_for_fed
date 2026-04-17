const fs = require("fs");
const path = require("path");

const FED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const LIMIT = "240";
const SERIES_IDS = [
  "PCEPI",
  "PCEPILFE",
  "CPIAUCSL",
  "UNRATE",
  "PAYEMS",
  "GDPC1",
  "INDPRO",
  "RSAFS",
  "HOUST",
  "FEDFUNDS",
  "DGS10",
  "T10Y2Y",
];

loadDotEnv(path.join(__dirname, "..", ".env"));

async function main() {
  const key = String(process.env.FED_API_KEY || process.env.FRED_API_KEY || "").trim();
  if (!key) {
    throw new Error("Missing API key. Set FED_API_KEY or FRED_API_KEY.");
  }

  const series = {};

  for (const id of SERIES_IDS) {
    const points = await fetchSeries(id, key);
    if (points.length < 3) {
      throw new Error(`Insufficient points for ${id}`);
    }
    series[id] = points;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "FRED",
    limit: Number(LIMIT),
    series,
  };

  const outputPath = path.join(__dirname, "..", "data", "fred_snapshot.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote snapshot to ${outputPath}`);
}

async function fetchSeries(seriesId, key) {
  const url = new URL(FED_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", LIMIT);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FRED request failed for ${seriesId}: HTTP ${response.status} ${body.slice(0, 140)}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.observations)) {
    throw new Error(`No observations returned for ${seriesId}`);
  }

  return data.observations
    .map((item) => ({ date: item.date, value: Number(item.value) }))
    .filter((item) => Number.isFinite(item.value))
    .reverse();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
