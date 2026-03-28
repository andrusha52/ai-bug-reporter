# AI Bug Reporter

A **Chrome extension** (Manifest V3) that helps you turn problems on the web into **clear, structured bug reports**. You describe what went wrong; the extension can attach **technical context** from the page you are on and uses **AI** to format everything into a useful report.

## What it does

- **Manual input** — Describe the issue or pick quick templates in the popup.
- **Context from the active tab** — Optionally captures **console messages** and **network diagnostics** (via Chrome’s debugger APIs) when you run analysis, so reproducible details are included.
- **AI-assisted writing** — Sends your text and collected context to **Google Gemini** or **OpenAI** (you provide your own API key in settings). Output modes support bug reports, Jira-style drafts, fixes, QA notes, and quick summaries.
- **Local history** — Keeps recent reports on your device for reuse and copy/paste.

The extension does **not** include a bundled backend: API keys and history stay in **Chrome storage**; prompts go only to the provider you choose.

## Requirements

- **Google Chrome** (or another Chromium browser that supports MV3 extensions).
- An **API key** for [Gemini](https://ai.google.dev/) or [OpenAI](https://platform.openai.com/), set in the extension’s settings.

## Development

| Path | Role |
|------|------|
| `manifest.json` | Store-facing manifest |
| `manifest.dev.json` | Optional dev manifest with broader permissions |
| `background.js` | Service worker: monitoring, capture, messaging |
| `popup/` | Main UI |
| `content_scripts/` | Injected scripts (e.g. console capture) |
| `settings/` | Full-page settings |
| `utils/` | AI clients, context collection, helpers |

Load unpacked: **Extensions → Developer mode → Load unpacked** → select this repository folder.

### Store package

```bash
./scripts/build-release.sh 1.0.0
```

Produces a ZIP suitable for the Chrome Web Store (extension files only).

## Privacy

[Privacy policy](https://andrusha52.github.io/ai-bug-reporter/privacy.html)

## License

Add a `LICENSE` file if you distribute this project; none is bundled by default.
