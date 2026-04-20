# Flyttelog for prosjektstruktur

Dato: 2026-04-20
Prosjekt: Fed_Macro_Terminal
Maal: Tilpasse prosjektet til felles struktur for delbare applikasjoner.

## Gjennomforte endringer

1. Mappen assests ble ryddet inn i assets (stavingskorrigering).
2. fed_macro_terminal/index.html ble flyttet til public/index.html.
3. fed_macro_terminal/fed_index.html ble flyttet til public/fed_index.html.
4. root readme.txt ble flyttet til docs/readme-legacy.txt.
5. public/favicon.ico ble opprettet (placeholder).
6. Standard mapper ble verifisert/opprettet:
   - src/components
   - src/pages
   - src/services
   - src/models
   - src/utils
   - src/hooks
   - public
   - assets
   - tests
   - docs
   - config
   - datacenters

## Hva ble ikke endret

- fed_macro_terminal/README.md ble beholdt urort.
- fed_macro_terminal/image.png ble beholdt urort.
- Eksisterende lokale git-endringer ble ikke revertet.

## Resultat

Prosjektet er na strukturert for felles bruk med Common-moensteret,
med statiske inngangsfiler samlet under public og dokumentasjon i docs.
