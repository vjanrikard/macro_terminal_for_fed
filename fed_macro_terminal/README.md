# FED MACRO TERMINAL

Interaktivt makroøkonomisk dashboard med data fra FRED (Federal Reserve Economic Data).

Live demo: https://vjanrikard.github.io/macro_terminal_for_fed/

## Arkitektur

FRED API støtter ikke CORS fra nettlesere — kall direkte fra frontend vil alltid bli blokkert. Løsningen er en **snapshot-strategi**:

```
GitHub Actions (daglig kl. 06:00 UTC)
  → fetch_snapshot.py henter alle serier server-side
  → lagrer data/fred_snapshot.json
  → deployer til gh-pages
Browser
  → laster data/fred_snapshot.json (same-origin, ingen CORS-begrensning) ✓
```

## Oppsett

### 1. Få FRED API-nøkkel (gratis)
Registrer deg på https://fred.stlouisfed.org/docs/api/api_key.html

### 2. Legg til API-nøkkel som GitHub Secret
- Gå til repo → Settings → Secrets and variables → Actions
- Klikk "New repository secret"
- Name: `FRED_API_KEY`
- Value: din API-nøkkel

### 3. GitHub Pages oppsett
- Gå til repo → Settings → Pages
- Source: Deploy from branch → `gh-pages` → / (root)

### 4. Push til main
GitHub Actions bygger automatisk, henter FRED-snapshot og deployer til GitHub Pages.

## Lokalt
```bash
cp .env.example .env
# Legg inn din nøkkel i .env
npm install
npm start
# Åpne http://localhost:3000
```

Hvis du vil lagre `.env` utenfor repoet (anbefalt), sett sti via miljøvariabel før start:

```powershell
$env:FED_ENV_FILE = "C:\path\til\din\.env"
npm start
```

Eksempel innhold i ekstern `.env`:

```env
FRED_API_KEY=din_ekte_fred_api_nokkel
```

`server.js` proxyer FRED API server-side, slik at lokal utvikling fungerer uten snapshotfil.

## Datafiler

| Fil | Beskrivelse |
|---|---|
| `index.template.html` | Kildekode — API-nøkkel er erstatningsvariabel `__FRED_API_KEY__` |
| `index.html` | Bygget av GitHub Actions — ikke rediger direkte |
| `fetch_snapshot.py` | Henter alle FRED-serier og skriver `data/fred_snapshot.json` |
| `data/fred_snapshot.json` | Generert under deploy — ikke i kildekode |

## Datakilder

Alle data fra FRED API — Federal Reserve Bank of St. Louis. Snapshot oppdateres daglig.

| Indikator | Serie-ID | Frekvens |
|---|---|---|
| Fed Funds Rate | FEDFUNDS | Månedlig |
| CPI / Core CPI | CPIAUCSL / CPILFESL | Månedlig |
| PCE / Core PCE | PCEPI / PCEPILFE | Månedlig |
| Nonfarm Payrolls | PAYEMS | Månedlig |
| Arbeidsledighet | UNRATE | Månedlig |
| Real GDP | GDPC1 | Kvartalsvis |
| Industriproduksjon | INDPRO | Månedlig |
| Treasury Yields (1M–30Y) | DGS1MO–DGS30 | Daglig |
| 2Y-10Y Yield Spread | T10Y2Y | Daglig |
| HY Credit Spreads | BAMLH0A0HYM2 | Daglig |
| Fed Balance Sheet | WALCL | Ukentlig |
| M2 Money Supply | M2SL | Ukentlig |
| JOLTS Job Openings | JTSJOL | Månedlig |
| Arbeidsmarkedsdeltakelse | CIVPART | Månedlig |
| National Financial Conditions | NFCI | Ukentlig |
