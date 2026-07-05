/**
 * Paints text highlights with the CSS Custom Highlight API (Chrome 105+):
 * no page-DOM mutation, so anchoring offsets stay stable and page scripts
 * never see us. Styles for ::highlight() must live in a *document-level*
 * stylesheet — the one thing we inject outside our shadow root.
 */

const STYLE_ID = 'vitrum-highlight-style';

const HIGHLIGHT_CSS = `
::highlight(vitrum-mine) { background-color: rgba(255, 203, 55, 0.42); }
::highlight(vitrum-friend) { background-color: rgba(88, 160, 250, 0.32); }
::highlight(vitrum-agent) { background-color: rgba(167, 139, 250, 0.35); }
::highlight(vitrum-hover) { background-color: rgba(109, 92, 231, 0.3); }
::highlight(vitrum-flash) { background-color: rgba(255, 118, 82, 0.75); }
`;

type HighlightGroups = Record<'mine' | 'friend' | 'agent', Range[]>;

function highlightsApi(): Map<string, unknown> | null {
  const cssAny = (globalThis as any).CSS;
  if (!cssAny?.highlights || typeof (globalThis as any).Highlight !== 'function') return null;
  return cssAny.highlights as Map<string, unknown>;
}

export function supportsHighlights(): boolean {
  return highlightsApi() !== null;
}

export function ensureDocumentStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute('data-vitrum-ui', '1');
  style.textContent = HIGHLIGHT_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

export function paintHighlights(groups: HighlightGroups): void {
  const registry = highlightsApi();
  if (!registry) return;
  ensureDocumentStyles();
  const HighlightCtor = (globalThis as any).Highlight;
  for (const key of ['mine', 'friend', 'agent'] as const) {
    registry.set(`vitrum-${key}`, new HighlightCtor(...groups[key]));
  }
}

/** Interactivity affordance: tint the highlight under the cursor. */
export function setHoverRange(range: Range | null): void {
  const registry = highlightsApi();
  if (!registry) return;
  if (!range) {
    registry.delete('vitrum-hover');
    return;
  }
  const HighlightCtor = (globalThis as any).Highlight;
  const highlight = new HighlightCtor(range);
  highlight.priority = 5; // win over the base author tint
  registry.set('vitrum-hover', highlight);
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;

export function flashRange(range: Range): void {
  const registry = highlightsApi();
  if (!registry) return;
  const HighlightCtor = (globalThis as any).Highlight;
  registry.set('vitrum-flash', new HighlightCtor(range));
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => registry.delete('vitrum-flash'), 1400);
}
