#!/usr/bin/env bash
# Copy NeoStay Insights' plain data files from acuity-models into data-private/ (git-ignored).
# Build them there first: `make insights-data` in acuity-models.
set -euo pipefail
ACUITY="${ACUITY_MODELS:-$(cd "$(dirname "$0")/../.." && pwd)/acuity-models}"
SRC="$ACUITY/apps/insights/public/data"
DEST="$(cd "$(dirname "$0")/.." && pwd)/data-private"
if [ ! -f "$SRC/insights.json" ]; then
  echo "No data at $SRC. Run 'make insights-data' in acuity-models, or set ACUITY_MODELS to its path." >&2
  exit 1
fi
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"
echo "Copied data from $SRC into data-private/. Next: npm run encrypt"
