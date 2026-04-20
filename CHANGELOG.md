# CHANGELOG — Fed Macro Terminal

## [2026-04-20] — Prosjektrestrukturering

### Endringer
- Flyttet `fed_macro_terminal/index.html` → `public/index.html`
- Flyttet `fed_macro_terminal/fed_index.html` → `public/fed_index.html`
- Opprettet `public/favicon.ico` (placeholder)
- Opprettet `docs/MIGRATION_FLYTT_2026-04-20.md` med flyttelogg
- Opprettet `docs/readme-legacy.txt` fra tidligere root-readme
- Oppdatert `fed_macro_terminal/README.md`
- Lagt til `fed_macro_terminal/image.png`

### Mappestruktur etablert
```
public/          — statiske inngangsfiler (index.html, fed_index.html, favicon.ico)
docs/            — dokumentasjon og migrasjonslogger
src/             — kildekode (components, pages, services, models, utils, hooks)
assets/          — bilder og statiske ressurser
data/            — FRED snapshot-data (auto-oppdatert av GitHub Actions)
scripts/         — build-scripts (build-snapshot.js)
tests/           — testfiler
config/          — konfigurasjon
datacenters/     — datasenter-konfig
```

### GitHub Actions
- `update-snapshot.yml` — kjører hvert time, henter 26 FRED-serier, committer `data/fred_snapshot.json`
- `deploy.yml` — deployer til GitHub Pages ved push til main

### Problemer oppdaget
- Siten ikke oppdatert siden 09:23:53 — mulig feil i GitHub Actions (sjekk Actions-logg på GitHub)
- API-nøkkel (`FRED_API_KEY`) bekreftet lagret i GitHub Secrets
