const SERVER_SERIES_URL = "/api/series";
const SNAPSHOT_URL = "data/fred_snapshot.json";

const SERIES = [
  {
    id: "PCEPI",
    name: "PCE Price Index",
    category: "inflation",
    unit: "index",
    notes: "Fed's preferred inflation gauge.",
  },
  {
    id: "PCEPILFE",
    name: "Core PCE Price Index",
    category: "inflation",
    unit: "index",
    notes: "Underlying inflation excluding food and energy.",
  },
  {
    id: "CPIAUCSL",
    name: "Consumer Price Index",
    category: "inflation",
    unit: "index",
    notes: "Broad inflation pressure felt by households.",
  },
  {
    id: "UNRATE",
    name: "Unemployment Rate",
    category: "labor",
    unit: "%",
    notes: "Labor slack and hiring conditions.",
  },
  {
    id: "PAYEMS",
    name: "Nonfarm Payrolls",
    category: "labor",
    unit: "thousands",
    notes: "Monthly employment momentum.",
  },
  {
    id: "GDPC1",
    name: "Real GDP",
    category: "growth",
    unit: "billions",
    notes: "Output growth and recession risk.",
  },
  {
    id: "INDPRO",
    name: "Industrial Production",
    category: "activity",
    unit: "index",
    notes: "Factory and utility output trend.",
  },
  {
    id: "RSAFS",
    name: "Retail Sales",
    category: "activity",
    unit: "millions",
    notes: "Consumer demand impulse.",
  },
  {
    id: "HOUST",
    name: "Housing Starts",
    category: "activity",
    unit: "thousands",
    notes: "Rate-sensitive housing activity.",
  },
  {
    id: "FEDFUNDS",
    name: "Fed Funds Effective Rate",
    category: "rates",
    unit: "%",
    notes: "Current policy stance anchor.",
  },
  {
    id: "DGS10",
    name: "10Y Treasury Yield",
    category: "rates",
    unit: "%",
    notes: "Long-end rate expectations.",
  },
  {
    id: "T10Y2Y",
    name: "10Y - 2Y Yield Spread",
    category: "rates",
    unit: "bps",
    notes: "Curve shape and recession signal.",
  },
];

let currentCategory = "overview";
let chartMap = new Map();
let latestDataset = [];
let snapshotCachePromise = null;
let snapshotGeneratedAt = null;
let usedSnapshotSource = false;

const el = {
  tabs: document.querySelectorAll(".tab"),
  cardsContainer: document.getElementById("cardsContainer"),
  insightList: document.getElementById("insightList"),
  systemStatus: document.getElementById("systemStatus"),
  lastUpdate: document.getElementById("lastUpdate"),
  inflationPulse: document.getElementById("inflationPulse"),
  laborPulse: document.getElementById("laborPulse"),
  ratesPulse: document.getElementById("ratesPulse"),
  recessionPulse: document.getElementById("recessionPulse"),
};

init();

async function init() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      currentCategory = tab.dataset.category;
      el.tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      renderCards(latestDataset);
    });
  });

  refreshAll();
}


async function refreshAll() {
  setStatus("Loading data...", "warn");
  usedSnapshotSource = false;

  try {
    const settled = await Promise.allSettled(SERIES.map((s) => fetchSeriesData(s)));
    const payload = settled
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .filter(Boolean);
    const errors = settled
      .filter((r) => r.status === "rejected")
      .map((r) => r.reason?.message || "Unknown error");

    latestDataset = payload;

    if (!latestDataset.length) {
      const primaryError = errors[0] || "Data service unavailable.";
      throw new Error(primaryError);
    }

    renderInsights(latestDataset);
    renderCards(latestDataset);
    updatePulseChips(latestDataset);
    el.lastUpdate.textContent = usedSnapshotSource && snapshotGeneratedAt
      ? `${new Date(snapshotGeneratedAt).toLocaleString()} (snapshot)`
      : new Date().toLocaleString();

    if (usedSnapshotSource) {
      setStatus("Snapshot mode", "warn");
      return;
    }

    if (errors.length) {
      setStatus("Partial data", "warn");
      return;
    }

    setStatus("FED ANALYSIS", "ok");
  } catch (error) {
    setStatus("Fetch error", "hot");
    renderConnectionError(error.message);
  }
}

async function fetchSeriesData(series) {
  try {
    return await fetchSeriesFromApi(series);
  } catch (apiError) {
    try {
      const fromSnapshot = await fetchSeriesFromSnapshot(series);
      usedSnapshotSource = true;
      return fromSnapshot;
    } catch (_snapshotError) {
      throw apiError;
    }
  }
}

async function fetchSeriesFromApi(series) {
  const url = new URL(SERVER_SERIES_URL, window.location.origin);

  url.searchParams.set("series_id", series.id);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "240");

  const response = await fetch(url);
  if (!response.ok) {
    let errorText = "";
    try {
      const raw = await response.text();
      if (raw) {
        try {
          const errorJson = JSON.parse(raw);
          errorText = errorJson?.error_message || raw;
        } catch (_parseError) {
          errorText = raw;
        }
      }
    } catch (_error) {
      errorText = "";
    }

    const compactError = errorText ? errorText.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    throw new Error(compactError || `FED data request failed for ${series.id} (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data.observations) {
    throw new Error(`No observations found for ${series.id}`);
  }

  const points = data.observations
    .map((item) => ({ date: item.date, value: Number(item.value) }))
    .filter((item) => Number.isFinite(item.value))
    .reverse();

  if (points.length < 3) {
    return null;
  }

  const stats = computeStats(points);
  return {
    ...series,
    points,
    stats,
    narrative: buildNarrative(series, stats),
  };
}

async function fetchSeriesFromSnapshot(series) {
  const snapshot = await loadSnapshotData();
  const rawPoints = snapshot?.series?.[series.id];

  if (!Array.isArray(rawPoints) || rawPoints.length < 3) {
    throw new Error(`No snapshot data for ${series.id}`);
  }

  const points = rawPoints
    .map((item) => ({ date: item.date, value: Number(item.value) }))
    .filter((item) => Number.isFinite(item.value));

  if (points.length < 3) {
    throw new Error(`Snapshot data invalid for ${series.id}`);
  }

  const stats = computeStats(points);
  return {
    ...series,
    points,
    stats,
    narrative: buildNarrative(series, stats),
  };
}

function loadSnapshotData() {
  if (!snapshotCachePromise) {
    const snapshotUrl = new URL(SNAPSHOT_URL, window.location.href);
    snapshotCachePromise = fetch(snapshotUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Snapshot file not available (HTTP ${response.status})`);
        }

        const data = await response.json();
        snapshotGeneratedAt = data?.generatedAt || null;
        return data;
      });
  }

  return snapshotCachePromise;
}

function renderConnectionError(message) {
  clearCharts();
  el.cardsContainer.classList.remove("analysis-grid");
  el.cardsContainer.innerHTML = `
    <article class="card">
      <h3 class="card-title">Data connection issue</h3>
      <p class="explain">${escapeHtml(message || "Unable to load macro data right now.")}</p>
      <p class="mono-line">Site users do not need their own API keys. Local mode requires server runtime with FED_API_KEY or FRED_API_KEY.</p>
      <p class="mono-line">GitHub Pages uses static snapshot data from data/fred_snapshot.json, refreshed by GitHub Actions.</p>
    </article>
  `;
  el.insightList.innerHTML = "<li>Waiting for data source recovery.</li>";
  el.lastUpdate.textContent = "-";
  el.inflationPulse.textContent = "n/a";
  el.laborPulse.textContent = "n/a";
  el.ratesPulse.textContent = "n/a";
  el.recessionPulse.textContent = "n/a";
}

function computeStats(points) {
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const delta = latest.value - previous.value;
  const deltaPct = previous.value !== 0 ? (delta / previous.value) * 100 : 0;

  const lookback = getYoYLookback(points);
  const yoyIndex = Math.max(0, points.length - (lookback + 1));
  const yoyBase = points[yoyIndex];
  const yoy = yoyBase?.value ? ((latest.value - yoyBase.value) / yoyBase.value) * 100 : null;

  const recent = points.slice(-6);
  const slope = linearSlope(recent.map((p) => p.value));

  return {
    latest,
    previous,
    delta,
    deltaPct,
    yoy,
    slope,
  };
}

function getYoYLookback(points) {
  if (points.length < 3) {
    return 12;
  }

  const last = points[points.length - 1];
  const prior = points[points.length - 2];
  const days = Math.max(1, Math.round((new Date(last.date) - new Date(prior.date)) / 86400000));

  if (days >= 70) return 4;
  if (days >= 20) return 12;
  if (days >= 5) return 52;
  return 252;
}

function linearSlope(values) {
  const n = values.length;
  if (n < 2) {
    return 0;
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumXX - sumX * sumX;
  return denominator === 0 ? 0 : numerator / denominator;
}

function buildNarrative(series, stats) {
  const direction = stats.delta > 0 ? "up" : stats.delta < 0 ? "down" : "flat";
  const changeText = `${direction} ${Math.abs(stats.delta).toFixed(2)} (${stats.deltaPct.toFixed(2)}%)`;
  const yoyText = Number.isFinite(stats.yoy) ? `${stats.yoy.toFixed(2)}% YoY` : "YoY n/a";

  const assessment = assessSeries(series.id, stats);

  return {
    changed: `Changed ${changeText} from prior release; latest print ${yoyText}.`,
    state: assessment.state,
    badge: assessment.badge,
    tone: assessment.tone,
  };
}

function assessSeries(id, stats) {
  const latest = stats.latest.value;
  const yoy = Number.isFinite(stats.yoy) ? stats.yoy : 0;

  switch (id) {
    case "PCEPI":
    case "PCEPILFE":
    case "CPIAUCSL":
      if (yoy <= 2.5) return { state: "Inflation near target-consistent zone.", badge: "Cooling", tone: "ok" };
      if (yoy <= 3.5) return { state: "Inflation elevated but moderating.", badge: "Sticky", tone: "warn" };
      return { state: "Inflation too high for comfort.", badge: "Hot", tone: "hot" };
    case "UNRATE":
      if (latest < 4.2) return { state: "Labor market still tight.", badge: "Tight", tone: "ok" };
      if (latest < 5) return { state: "Labor market cooling gradually.", badge: "Cooling", tone: "warn" };
      return { state: "Labor softening materially.", badge: "Weak", tone: "hot" };
    case "PAYEMS":
      if (stats.delta > 200) return { state: "Payroll momentum remains strong.", badge: "Strong", tone: "ok" };
      if (stats.delta > 75) return { state: "Payroll growth is slowing but positive.", badge: "Moderate", tone: "warn" };
      return { state: "Payroll trend is weak.", badge: "Weak", tone: "hot" };
    case "GDPC1":
      if (yoy > 2) return { state: "Growth trend remains above potential.", badge: "Firm", tone: "ok" };
      if (yoy > 0) return { state: "Growth is positive but soft.", badge: "Soft", tone: "warn" };
      return { state: "Output is contracting year over year.", badge: "Contraction", tone: "hot" };
    case "FEDFUNDS":
      if (latest >= 5) return { state: "Policy stance is restrictive.", badge: "Restrictive", tone: "warn" };
      if (latest >= 3) return { state: "Policy stance is moderately tight.", badge: "Moderate", tone: "cool" };
      return { state: "Policy stance is accommodative.", badge: "Easy", tone: "ok" };
    case "T10Y2Y":
      if (latest < 0) return { state: "Curve inversion still flags downside risk.", badge: "Inverted", tone: "warn" };
      return { state: "Curve normalization points to easing recession risk.", badge: "Normalizing", tone: "ok" };
    default:
      if (stats.slope > 0.1) return { state: "Trend is rising over recent prints.", badge: "Rising", tone: "cool" };
      if (stats.slope < -0.1) return { state: "Trend is easing over recent prints.", badge: "Falling", tone: "ok" };
      return { state: "Trend is broadly stable.", badge: "Stable", tone: "warn" };
  }
}

function renderCards(data) {
  if (currentCategory === "fed-analysis") {
    renderFedAnalysis(data);
    return;
  }

  el.cardsContainer.classList.remove("analysis-grid");

  const filtered = (currentCategory === "overview" ? data : data.filter((d) => d.category === currentCategory))
    .slice()
    .sort((a, b) => new Date(b.stats.latest.date) - new Date(a.stats.latest.date));

  clearCharts();

  if (!filtered.length) {
    el.cardsContainer.innerHTML = "<article class=\"card\"><p class=\"explain\">No series available for this tab.</p></article>";
    return;
  }

  const html = filtered
    .map(
      (series) => `
      <article class="card">
        <header class="card-head">
          <div>
            <h3 class="card-title">${escapeHtml(series.name)}</h3>
            <p class="mono-line">${series.id} | ${escapeHtml(series.notes)}</p>
          </div>
          <span class="badge ${series.narrative.tone}">${escapeHtml(series.narrative.badge)}</span>
        </header>
        <p class="mono-line">Latest: ${formatValue(series.stats.latest.value, series.unit)} (${series.stats.latest.date})</p>
        <p class="explain"><strong>What changed:</strong> ${escapeHtml(series.narrative.changed)}</p>
        <p class="explain"><strong>Current state:</strong> ${escapeHtml(series.narrative.state)}</p>
        <div class="chart-wrap"><canvas id="chart-${series.id}"></canvas></div>
      </article>
    `,
    )
    .join("");

  el.cardsContainer.innerHTML = html;

  filtered.forEach((series) => {
    const canvas = document.getElementById(`chart-${series.id}`);
    if (!canvas) return;

    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: series.points.map((p) => p.date),
        datasets: [
          {
            data: series.points.map((p) => p.value),
            borderColor: "#67d6ff",
            pointRadius: 0,
            borderWidth: 1.8,
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return `${formatValue(context.parsed.y, series.unit)} on ${context.label}`;
              },
            },
          },
        },
        scales: {
          x: {
            display: false,
            grid: { color: "rgba(103,214,255,0.09)" },
          },
          y: {
            ticks: { color: "#93bfce", maxTicksLimit: 4 },
            grid: { color: "rgba(103,214,255,0.09)" },
          },
        },
      },
    });

    chartMap.set(series.id, chart);
  });
}

function renderFedAnalysis(data) {
  clearCharts();
  el.cardsContainer.classList.add("analysis-grid");

  const corePce = data.find((d) => d.id === "PCEPILFE");
  const unemployment = data.find((d) => d.id === "UNRATE");
  const payrolls = data.find((d) => d.id === "PAYEMS");
  const fedFunds = data.find((d) => d.id === "FEDFUNDS");
  const spread = data.find((d) => d.id === "T10Y2Y");
  const gdp = data.find((d) => d.id === "GDPC1");
  const retail = data.find((d) => d.id === "RSAFS");

  const corePceYoy = safePercent(corePce?.stats.yoy);
  const unemploymentRate = safePercent(unemployment?.stats.latest.value);
  const fedFundsRate = safePercent(fedFunds?.stats.latest.value);
  const payrollDelta = payrolls?.stats.delta ?? null;
  const spreadPct = spread?.stats.latest.value ?? null;
  const realRate = Number.isFinite(fedFunds?.stats.latest.value) && Number.isFinite(corePce?.stats.yoy)
    ? fedFunds.stats.latest.value - corePce.stats.yoy
    : null;
  const taylorRate = Number.isFinite(corePce?.stats.yoy) && Number.isFinite(unemployment?.stats.latest.value)
    ? 2 + corePce.stats.yoy + 0.5 * (corePce.stats.yoy - 2) + 0.5 * (4 - unemployment.stats.latest.value)
    : null;
  const stanceGap = Number.isFinite(taylorRate) && Number.isFinite(fedFunds?.stats.latest.value)
    ? fedFunds.stats.latest.value - taylorRate
    : null;

  const inflationClause = !corePce
    ? "Core PCE data unavailable."
    : corePce.stats.yoy <= 2.3
      ? `Core PCE at ${corePceYoy} is effectively on top of the 2% objective. Price stability looks broadly restored.`
      : corePce.stats.yoy <= 3
        ? `Core PCE at ${corePceYoy} is moving toward 2%, but inflation is still somewhat above target.`
        : `Core PCE at ${corePceYoy} remains well above the 2% objective. Price stability is not yet secured.`;

  const laborClause = !unemployment
    ? "Labor market data unavailable."
    : unemployment.stats.latest.value < 4.2
      ? `U-3 unemployment at ${unemploymentRate} signals a still-tight labor market. There is limited labor-side urgency for rapid easing.`
      : unemployment.stats.latest.value < 4.8
        ? `U-3 unemployment at ${unemploymentRate} suggests the labor market is cooling, but not breaking.`
        : `U-3 unemployment at ${unemploymentRate} points to more visible labor market softening and rising downside risk to employment.`;

  const payrollClause = Number.isFinite(payrollDelta)
    ? `Latest payroll change was ${formatSigned(payrollDelta, 0)} thousand, which keeps hiring momentum ${payrollDelta > 150 ? "firm" : payrollDelta > 50 ? "positive but slower" : "fragile"}.`
    : "Latest payroll change unavailable.";

  const policyText = !fedFunds
    ? "Fed funds data unavailable."
    : `Effective FFR: ${fedFundsRate}. Real rate (FFR minus Core PCE YoY): ${formatSigned(realRate, 2)} pp.`;

  const taylorText = Number.isFinite(taylorRate) && Number.isFinite(stanceGap)
    ? `A simplified Taylor Rule implies roughly ${formatPercent(taylorRate)}. Current policy is ${Math.abs(stanceGap).toFixed(2)} pp ${stanceGap >= 0 ? "above" : "below"} that level.`
    : "Taylor Rule estimate unavailable with current data.";

  const inflationRisk = !corePce
    ? "Inflation risk unobservable."
    : corePce.stats.yoy > 3
      ? "Upside inflation risk remains elevated; disinflation progress is incomplete."
      : corePce.stats.yoy > 2.3
        ? "Upside inflation risk is moderate; progress is visible but not finished."
        : "Upside inflation risk is lower; inflation is close to target-consistent territory.";

  const growthRisk = !gdp || !spread
    ? "Growth risk unobservable."
    : spread.stats.latest.value < 0
      ? `Downside growth risk is elevated. The 2s10s spread is ${formatSpread(spreadPct)}, still consistent with recession watch.`
      : gdp.stats.yoy < 1.5
        ? `Downside growth risk is moderate. GDP is soft at ${safePercent(gdp.stats.yoy)} YoY even though the curve is less alarming.`
        : `Downside growth risk is contained for now. GDP and curve signals do not indicate an imminent contraction.`;

  const demandRisk = !retail
    ? "Demand signal unavailable."
    : retail.stats.yoy > 4
      ? `Consumer demand remains resilient with retail sales running ${safePercent(retail.stats.yoy)} YoY.`
      : `Consumer demand is softer, with retail sales at ${safePercent(retail.stats.yoy)} YoY.`;

  const panels = [
    {
      tone: corePce?.narrative.tone || "cool",
      kicker: "// SYNTHETIC FED ANALYSIS - AI-POWERED FOMC ASSESSMENT",
      body: `<strong>Dual Mandate Status:</strong> ${escapeHtml(inflationClause)} ${escapeHtml(laborClause)} ${escapeHtml(payrollClause)}`,
    },
    {
      tone: fedFunds?.narrative.tone || "warn",
      kicker: "// POLICY RATE OUTLOOK - TAYLOR RULE ANALYSIS",
      body: `<strong>${escapeHtml(policyText)}</strong> ${escapeHtml(taylorText)}`,
    },
    {
      tone: spread?.stats.latest.value < 0 ? "hot" : "warn",
      kicker: "// RISK BALANCE",
      body: `<strong>Upside Inflation Risks:</strong> ${escapeHtml(inflationRisk)} <strong>Downside Growth Risks:</strong> ${escapeHtml(growthRisk)} <strong>Demand Backdrop:</strong> ${escapeHtml(demandRisk)}`,
    },
    {
      tone: spread?.stats.latest.value < 0 ? "warn" : "ok",
      kicker: "// RECESSION SIGNAL",
      body: `<strong>2Y-10Y Spread:</strong> ${escapeHtml(formatSpread(spreadPct))}. ${escapeHtml(spread?.narrative.state || "Yield curve signal unavailable.")}`,
    },
  ];

  el.cardsContainer.innerHTML = `
    <section class="section-banner">// FED ANALYSIS - POLICY SYNTHESIS</section>
    ${panels
      .map(
        (panel) => `
          <article class="analysis-panel ${panel.tone}">
            <p class="analysis-kicker">${panel.kicker}</p>
            <p class="analysis-copy">${panel.body}</p>
          </article>
        `,
      )
      .join("")}
  `;
}

function renderInsights(data) {
  el.cardsContainer.classList.remove("analysis-grid");

  const pce = data.find((d) => d.id === "PCEPI");
  const unrate = data.find((d) => d.id === "UNRATE");
  const funds = data.find((d) => d.id === "FEDFUNDS");
  const spread = data.find((d) => d.id === "T10Y2Y");

  const bullets = [
    pce ? `Inflation monitor: ${pce.narrative.state} PCE latest is ${formatValue(pce.stats.latest.value, pce.unit)}.` : "Inflation monitor unavailable.",
    unrate ? `Employment monitor: ${unrate.narrative.state} Unemployment rate at ${formatValue(unrate.stats.latest.value, unrate.unit)}.` : "Employment monitor unavailable.",
    funds && spread
      ? `Policy setup: ${funds.narrative.state} Yield curve signal is ${spread.stats.latest.value < 0 ? "inverted" : "normalizing"}.`
      : "Policy setup unavailable.",
  ];

  el.insightList.innerHTML = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function updatePulseChips(data) {
  const pce = data.find((d) => d.id === "PCEPI");
  const unrate = data.find((d) => d.id === "UNRATE");
  const funds = data.find((d) => d.id === "FEDFUNDS");
  const spread = data.find((d) => d.id === "T10Y2Y");

  el.inflationPulse.textContent = pce ? pce.narrative.badge : "n/a";
  el.laborPulse.textContent = unrate ? unrate.narrative.badge : "n/a";
  el.ratesPulse.textContent = funds ? funds.narrative.badge : "n/a";
  if (!spread) {
    el.recessionPulse.textContent = "n/a";
  } else if (spread.stats.latest.value < 0) {
    el.recessionPulse.textContent = "Elevated";
  } else if (spread.stats.latest.value < 0.5) {
    el.recessionPulse.textContent = "Watch";
  } else {
    el.recessionPulse.textContent = "Low";
  }
}

function setStatus(text, tone) {
  el.systemStatus.textContent = text;
  el.systemStatus.style.color = {
    ok: "#70e28f",
    warn: "#ffd166",
    hot: "#ff7a59",
    cool: "#67d6ff",
  }[tone] || "#d9f4ff";
}

function clearCharts() {
  chartMap.forEach((chart) => chart.destroy());
  chartMap.clear();
}

function formatValue(value, unit) {
  if (!Number.isFinite(value)) return "n/a";

  if (unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "bps") return `${(value * 100).toFixed(0)} bps`;
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toFixed(2);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "n/a";
}

function safePercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "n/a";
}

function formatSigned(value, decimals) {
  if (!Number.isFinite(value)) return "n/a";
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

function formatSpread(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(0)} bps`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
