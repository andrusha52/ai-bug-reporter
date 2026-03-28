#!/bin/bash
set -euo pipefail

# Chrome Web Store / розповсюдження — тільки розширення, без .md
# Usage: ./scripts/build-release.sh [version]

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION=${1:-"1.0.0"}
OUTPUT="$ROOT/ai-bug-reporter-v${VERSION}.zip"

echo "🔨 Збірка v${VERSION} для Chrome Web Store..."

rm -f "$ROOT"/ai-bug-reporter-v*.zip
rm -rf "$ROOT/dist"

mkdir -p "$ROOT/dist"

rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='scripts/' \
  --exclude='dist/' \
  --exclude='*.zip' \
  --exclude='.DS_Store' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.gitignore' \
  --exclude='.cursorignore' \
  --exclude='.cursor/' \
  --exclude='*.md' \
  --exclude='**/*.md' \
  --exclude='*.log' \
  --exclude='terminals/' \
  --exclude='utils/logFormatter.js' \
  --exclude='utils/storageHelper.js' \
  --exclude='manifest.dev.json' \
  --exclude='docs/' \
  --exclude='assets/' \
  --exclude='offscreen/' \
  --exclude='icons/source-icon.png' \
  --exclude='privacy.html' \
  --exclude='.nojekyll' \
  ./ "$ROOT/dist/"

# Версія в manifest
if [[ "$OSTYPE" == darwin* ]]; then
  sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" "$ROOT/dist/manifest.json"
else
  sed -i "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" "$ROOT/dist/manifest.json"
fi

(
  cd "$ROOT/dist"
  zip -r "$OUTPUT" . -q
)

rm -rf "$ROOT/dist"

echo ""
echo "✅ Створено: $OUTPUT"
echo "📦 Розмір: $(du -h "$OUTPUT" | cut -f1)"
echo ""

# Перевірки (повний лістинг у змінну — інакше grep -q рве пайп і unzip дає SIGPIPE з pipefail)
ZIP_LIST=$(unzip -l "$OUTPUT" 2>/dev/null)

echo "━━━ Перевірка: чи є .md у ZIP ━━━"
if echo "$ZIP_LIST" | grep -E '\.md$|\.MD$'; then
  echo "❌ ПОМИЛКА: у ZIP знайдено .md файли!"
  exit 1
fi
echo "✓ .md файлів немає"

echo ""
echo "━━━ Вміст ZIP (список файлів) ━━━"
echo "$ZIP_LIST" | awk '/^[[:space:]]*[0-9]/ {print $4}' | grep -v '^$' | sort

echo ""
echo "━━━ Очікувана структура розширення ━━━"
for f in manifest.json background.js popup/popup.html content_scripts/console-interceptor.js utils/incidentDrafts.js; do
  if echo "$ZIP_LIST" | grep -Fq "$f"; then
    echo "✓ $f"
  else
    echo "⚠ відсутній: $f"
  fi
done

echo ""
echo "━━━ Що НЕ потрапило в ZIP (навмисно) ━━━"
echo "  • Усі *.md (документація)"
echo "  • manifest.dev.json, docs/, assets/, offscreen/, privacy.html, .nojekyll, icons/source-icon.png"
echo "  • scripts/, .git/, node_modules/, .env"
echo "  • utils/logFormatter.js, utils/storageHelper.js (не підключені до розширення)"
echo ""
echo "📤 Завантаж $OUTPUT у Chrome Web Store (Developer Dashboard)."
