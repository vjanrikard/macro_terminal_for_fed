#!/bin/bash
# Bygg index.html lokalt med API-nøkkel fra .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$FRED_API_KEY" ]; then
  echo "❌ FRED_API_KEY mangler i .env"
  echo "   Kopier .env.example til .env og legg inn din nøkkel"
  exit 1
fi

python3 -c "
key = '${FRED_API_KEY}'
content = open('index.template.html').read()
content = content.replace('__FRED_API_KEY__', key)
open('index.html', 'w').write(content)
print('✅ index.html bygget med API-nøkkel')
"
