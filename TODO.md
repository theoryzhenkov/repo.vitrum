# Vitrum — demo TODO

Goal: a polished, lean demo for the YC interview. Guiding principle: **invisible
until invited** — Vitrum renders nothing on a page until you select something,
press a shortcut, or the page already carries annotations.

## UX decisions (2026-07-05)

- **Capture first, elaborate later.** Selection (or Alt+E) shows a single
  `Save` button — one click creates the highlight, silently. Comments, replies,
  and list membership all happen afterward on the annotation's card. There are
  no decisions at capture time.
- **Pills live on a margin rail.** Participant pills sit in the whitespace
  right of the highlight's containing block, aligned to its first line,
  stacking downward on collision — never inline with text, so they can't
  overlap it on any layout. Hovering a pill flashes its passage. Element pills
  stay on corners. Own-only pills render dimmed (they're handles, not signals).
- **One card does everything.** Clicking a pill (or highlight) opens the
  anchored card: thread + streaming agents + composer + list chips (toggle to
  add/remove, `+` to create). Unfiled saves show under "Highlights" in the
  Library tab; lists are optional curation, not required folders. The card is
  pinned — only Esc/close/opening another dismisses it.
- **No sidebar.** Page-level actions (save page, element picker, seed demo,
  Library, Settings) live in the toolbar popup; the on-page thread index —
  including orphans — is a dropdown under the presence chip. Alt+S saves the
  current selection; Alt+E picks an element. Highlights tint on hover.
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
- [x] Remove sidebar → toolbar popup + presence-chip index dropdown
- [x] Fix popup race: Settings/Library never opened (window.close() killed the message)
- [x] Nested threads: reply to any comment, agents attach under the message that asked
- [x] Thread card: draggable by header (unpins), resizable via native grip
- [x] LessWrong-style reacts (▲▼ ✓✗ 💡 Δ): hover palette, chips only where reactions exist
- [x] Strip reasoning blocks (<think>…</think>) from streamed agent replies
- [x] Multi-agent threads: agents can @summon each other (depth-capped cascade)
- [x] Proactive @librarian on save (opt-in in Settings; gated on real related material)
- [x] Pin the thread card (Esc/close to dismiss, page clicks don't kill it)
- [x] Save feedback: highlight pulse + pill scale-in; Alt+S quick save
- [x] Rail jitter: MutationObserver re-anchor + ResizeObserver reflow tracking
- [x] Hover affordance: highlights tint + pointer cursor under the cursor

## Demo prep

- [ ] Extension icon (toolbar + chrome://extensions)
- [ ] Rehearse the script: seed demo page → select a claim → `@skeptic check this claim` → inline streaming reply
- [ ] Pre-save ~6 believable items into lists so @librarian has material to connect
- [ ] Test on the actual demo pages (an essay, a docs page, a news article) + one hostile page (Gmail/Medium) to know the failure modes
- [ ] Offline fallback: Ollama configured, plus local copies of demo pages in case of dead wifi
- [ ] Options page: verify key + "Test connection" flow the morning of

## Later / stretch

- [ ] Highlight deep-links: library/citation clicks open the page AND flash the passage
- [ ] Staged live activity: seed-demo holds back one friend reply, lands it ~10s after page load
- [ ] Import from Curius/Pocket (the poaching story)
- [ ] Editable agent personas in settings
- [ ] Firefox/Safari builds (WXT keeps the door open)
