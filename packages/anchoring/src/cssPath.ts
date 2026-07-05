/** Build a CSS path from `root` (exclusive) down to `el`, using an id shortcut when unique. */
export function cssPath(el: Element, root: Element): string {
  const doc = root.ownerDocument!;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    if (node.id) {
      const idSel = `#${escapeIdent(node.id)}`;
      if (doc.querySelectorAll(idSel).length === 1) {
        parts.unshift(idSel);
        return parts.join(' > ');
      }
    }
    const tag = node.tagName.toLowerCase();
    parts.unshift(`${tag}:nth-of-type(${nthOfType(node)})`);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

export function nthOfType(el: Element): number {
  let i = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) i++;
    sib = sib.previousElementSibling;
  }
  return i;
}

/** CSS.escape with a fallback for environments that lack it (older jsdom). */
function escapeIdent(ident: string): string {
  const cssAny = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (cssAny?.escape) return cssAny.escape(ident);
  return ident.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
