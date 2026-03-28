# AI Bug Reporter

Chrome extension: describe a bug, optionally attach console and network context from the **active tab**, and generate structured reports via **Gemini** or **OpenAI** (your API key).

## Privacy

- **Privacy policy (for Chrome Web Store):**  
  With [GitHub Pages](https://docs.github.com/en/pages) enabled for this repository (source: `/docs` on `main`), the URL is:

  `https://andrusha52.github.io/ai-bug-reporter/privacy.html`

  Until Pages is enabled, you can use the GitHub file link for review (store prefers a normal HTTPS page once Pages is on):

  `https://github.com/andrusha52/ai-bug-reporter/blob/main/docs/privacy.html`

## Repository layout

- Extension root: `manifest.json`, `background.js`, `popup/`, `content_scripts/`, `utils/`, `settings/`
- `manifest.dev.json` — broader permissions for local development (not for Web Store builds)
- `assets/chrome-webstore-promo-1280x800.jpg` — store screenshot template
- `scripts/build-release.sh` — release packaging helper

## License

See repository license if present; otherwise add one before publishing.
