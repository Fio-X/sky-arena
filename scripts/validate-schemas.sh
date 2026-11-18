#!/usr/bin/env bash
# Validate data-reference JSON files against their JSON Schemas.
# Usage: scripts/validate-schemas.sh
set -euo pipefail

AJV="npx ajv validate --spec=draft2020 -r schemas/defs.json"
FAIL=0

validate() {
  local schema=$1 data=$2
  if $AJV -s "$schema" -d "$data" > /dev/null 2>&1; then
    printf "  ✅ %s\n" "$data"
  else
    printf "  ❌ %s\n" "$data"
    $AJV -s "$schema" -d "$data" 2>&1 | head -20
    FAIL=1
  fi
}

echo "Validating data files against schemas..."

validate schemas/cards.json      data-reference/cards.json
validate schemas/relics.json     data-reference/relics.json
validate schemas/potions.json    data-reference/potions.json
validate schemas/powers.json     data-reference/powers.json
validate schemas/characters.json data-reference/characters.json
validate schemas/monsters.json   data-reference/monsters-act1.json
validate schemas/monsters.json   data-reference/monsters-act2.json
validate schemas/monsters.json   data-reference/monsters-act34.json

if (( FAIL )); then
  printf "\n❌ Schema validation failed.\n"
  exit 1
else
  printf "\n✅ All data files pass schema validation.\n"
fi
