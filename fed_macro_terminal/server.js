const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const FED_BASE = "https://api.stlouisfed.org/fred/series/observations";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const envCandidates = [
  process.env.FED_ENV_FILE,
  process.env.FRED_ENV_FILE,
  path.join(ROOT, ".env"),
  path.join(ROOT, "..", ".env"),
  path.join(process.cwd(), ".env"),
].filter(Boolean);

for (const envPath of envCandidates) {
  loadDotEnv(envPath);
}

const rawApiKey = process.env.FED_API_KEY || process.env.FRED_API_KEY || "";
const apiKey = isUsableKey(rawApiKey) ? rawApiKey : "";

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/api/config") {
    return json(res, 200, { hasServerKey: Boolean(apiKey) });
  }

  if (requestUrl.pathname === "/api/series") {
    if (!apiKey) {
      return json(res, 500, {
        error_message: "Missing .env API key. Set FED_API_KEY or FRED_API_KEY.",
      });
    }

    const upstream = new URL(FED_BASE);
    upstream.searchParams.set("series_id", requestUrl.searchParams.get("series_id") || "");
    upstream.searchParams.set("api_key", apiKey);
    upstream.searchParams.set("file_type", requestUrl.searchParams.get("file_type") || "json");
    upstream.searchParams.set("sort_order", requestUrl.searchParams.get("sort_order") || "asc");
    upstream.searchParams.set("limit", requestUrl.searchParams.get("limit") || "600");

    try {
      const upstreamRes = await fetch(upstream);
      const text = await upstreamRes.text();
      res.writeHead(upstreamRes.status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(text);
      return;
    } catch (_error) {
      return json(res, 502, { error_message: "Upstream fetch failed." });
    }
  }

  return serveStatic(requestUrl.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Macro Terminal server running on http://localhost:${PORT}`);
  console.log(apiKey ? "Loaded API key from environment/.env" : "No API key found in environment/.env");
});

function serveStatic(pathname, res) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(target).replace(/^([.][.][\/\\])+/, "");
  const absolutePath = path.join(ROOT, safePath);

  if (!absolutePath.startsWith(ROOT)) {
    return json(res, 403, { error_message: "Forbidden" });
  }

  fs.readFile(absolutePath, (err, content) => {
    if (err) {
      return json(res, 404, { error_message: "Not found" });
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

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

function isUsableKey(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (v.toLowerCase().includes("replace_with_your_api_key")) return false;
  if (v.length < 16) return false;
  return true;
}
