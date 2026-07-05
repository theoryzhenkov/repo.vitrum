import type { Selector, Target } from '@vitrum/model';
import { buildTextMap, rangeToOffsets } from './textMap';
import { cssPath, nthOfType } from './cssPath';

const CONTEXT_LENGTH = 32;
const TEXT_DIGEST_LENGTH = 180;
const FINGERPRINT_ATTRS = ['id', 'src', 'href', 'alt', 'title', 'aria-label', 'class'] as const;

/** Describe a text Range as a multi-selector target. Returns null for empty/invalid ranges. */
export function describeTextRange(root: Element, range: Range): Target | null {
  const map = buildTextMap(root);
  const offsets = rangeToOffsets(map, range);
  if (!offsets) return null;
  const { start, end } = offsets;
  const exact = map.text.slice(start, end);
  if (!exact.trim()) return null;

  const selectors: Selector[] = [
    {
      type: 'TextQuote',
      exact,
      prefix: map.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      suffix: map.text.slice(end, end + CONTEXT_LENGTH),
    },
    { type: 'TextPosition', start, end },
  ];

  const anchorEl = closestElement(range.startContainer);
  if (anchorEl) {
    selectors.push({ type: 'Css', value: cssPath(anchorEl, root) });
  }
  return { type: 'text', selectors };
}

/** Describe an element as a multi-selector target. */
export function describeElement(root: Element, el: Element): Target {
  const attrs: Record<string, string> = {};
  for (const name of FINGERPRINT_ATTRS) {
    const value = el.getAttribute(name);
    if (value) attrs[name] = value;
  }
  return {
    type: 'element',
    selectors: [
      { type: 'Css', value: cssPath(el, root) },
      {
        type: 'ElementFingerprint',
        tag: el.tagName.toLowerCase(),
        attrs,
        textDigest: normalizeText(el.textContent ?? '').slice(0, TEXT_DIGEST_LENGTH),
        nthOfType: nthOfType(el),
      },
    ],
  };
}

export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function closestElement(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}
