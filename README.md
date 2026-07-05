# Vitrum

Annotate anything on the web, save it into your lists, and bring your agents with you.
A social reading layer where some members of your network are AI.

Fully local: annotations, lists, and personas live in IndexedDB inside the extension.
Agents call an Anthropic/OpenAI-compatible API directly with your key — point the base
URL at Ollama for a completely offline demo. No servers.

## Layout

- `packages/model` — shared types (W3C-style multi-selector annotation targets)
- `packages/anchoring` — pure-TS anchoring engine: describe/re-anchor text ranges and
  elements with exact → context-disambiguated → fuzzy fallback. Unit-tested.
- `apps/extension` — WXT + React extension (Chrome MV3): shadow-DOM overlay, sidebar,
  element picker, CSS Custom Highlight painting, streaming agent threads.

## Develop

```sh
npm install
npm test              # anchoring engine tests
npm run dev           # WXT dev mode with HMR (launches Chrome)
npm run build         # production build → apps/extension/.output/chrome-mv3
```

Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked →
`apps/extension/.output/chrome-mv3`.

## Use

1. Open the settings page (extension icon → sidebar footer → Settings) and add your
   API key, or point at a local model.
2. On any page: select text → Highlight / Comment / Save. `Alt+E` picks a whole
   element (image, chart, code block). `Alt+V` toggles the sidebar.
3. Mention `@skeptic`, `@librarian`, or `@eli5` in any comment and the agent replies
   in the thread, anchored to the same spot.
4. Demo staging: sidebar footer → "Seed demo" fills the current page with plausible
   friend activity (re-running it replaces the previous seed).
