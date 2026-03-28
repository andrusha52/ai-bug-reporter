# AI Bug Reporter

Chrome extension: describe a bug, optionally attach console and network context from the **active tab**, and generate structured reports via **Gemini** or **OpenAI** (your API key).

## Privacy

**Chrome Web Store URL (must open in browser as HTML, not 404):**  
`https://andrusha52.github.io/ai-bug-reporter/privacy.html`

### Увімкнути GitHub Pages (інакше лінк не працює)

1. Репозиторій → **Settings** → **Pages**.
2. **Build and deployment** → **Source**: *Deploy from a branch*.
3. **Branch**: `main` → папка **`/ (root)`** → **Save**.
4. Зачекай 1–3 хв. Перевір лінк вище — має відкритись політика.

Файл для сайту лежить у **корені репо**: `privacy.html` (і порожній `.nojekyll`, щоб GitHub не ламав статику).

Резерв для перегляду в GitHub:  
`https://github.com/andrusha52/ai-bug-reporter/blob/main/privacy.html`

## Repository layout

- Extension root: `manifest.json`, `background.js`, `popup/`, `content_scripts/`, `utils/`, `settings/`
- `manifest.dev.json` — broader permissions for local development (not for Web Store builds)
- `assets/chrome-webstore-promo-1280x800.jpg` — store screenshot template
- `scripts/build-release.sh` — release packaging helper

## License

See repository license if present; otherwise add one before publishing.
