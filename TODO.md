# Vitrum — demo TODO

Goal: a polished, lean demo for the YC interview. Guiding principle: **invisible
until invited** — Vitrum renders nothing on a page until you select something,
press a shortcut, or the page already carries annotations.

## UX decisions (2026-07-05)

- **Comments are inline.** Clicking a highlight or element badge opens a compact
  thread card anchored at that spot — messages, reply box, @agent mentions, and
  streaming replies all happen there. The conversation lives at the text.
- **The sidebar is an index, not a home.** Alt+V shows a slim list of threads on
  the current page (quote · author · reply count); clicking one jumps to it and
  opens the inline card. Header carries four small icons: save page, annotate
  element, ⋯ menu (Library / Seed demo / Settings), close.
- **Library is a full extension tab** (like settings), not a sidebar tab.
- **Page footprint:** nothing by default. If the page has annotations, a small
  `◈ n` count chip appears top-right; highlights are the rest of the presence.
- **Highlighting is one click** from an icon-only selection toolbar
  (highlight / comment / save). A comment always carries its highlight.

## Now — lean pass

- [x] Remove always-on edge pill; add `◈ n` presence chip only when the page has annotations
- [x] Inline thread card (open on highlight/badge click; reply + agents + streaming)
- [x] Slim sidebar: header icons + ⋯ menu, compact thread rows, no tabs/page card/footer
- [x] Library as a full extension page (view lists, remove items, delete lists)
- [x] Icon-only selection toolbar
- [x] Element badges → small dots
- [x] Lucide icons throughout (no emojis / ad-hoc glyphs)

## Demo prep

- [ ] Extension icon (toolbar + chrome://extensions)
- [ ] Rehearse the script: seed demo page → select a claim → `@skeptic check this claim` → inline streaming reply
- [ ] Pre-save ~6 believable items into lists so @librarian has material to connect
- [ ] Test on the actual demo pages (an essay, a docs page, a news article) + one hostile page (Gmail/Medium) to know the failure modes
- [ ] Offline fallback: Ollama configured, plus local copies of demo pages in case of dead wifi
- [ ] Options page: verify key + "Test connection" flow the morning of

## Later / stretch

- [ ] "Related from your library" resurfacing on save (the retention story)
- [ ] Import from Curius/Pocket (the poaching story)
- [ ] Editable agent personas in settings
- [ ] Multi-agent threads (agents responding to each other)
- [ ] Firefox/Safari builds (WXT keeps the door open)
