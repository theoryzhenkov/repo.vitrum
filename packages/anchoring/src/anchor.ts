import DiffMatchPatch from 'diff-match-patch';
import type {
  CssSelector,
  ElementFingerprintSelector,
  Target,
  TextPositionSelector,
  TextQuoteSelector,
} from '@vitrum/model';
import { buildTextMap, offsetsToRange, type TextMap } from './textMap';
import { normalizeText } from './describe';

export type Anchored =
  | { kind: 'text'; range: Range }
  | { kind: 'element'; element: Element };

/**
 * Re-locate a target in the (possibly changed) page.
 * Cascade: exact position → exact quote search (context-disambiguated) → fuzzy match.
 * Returns null when the target is orphaned — callers should keep the annotation
 * visible in the sidebar rather than dropping it.
 */
export function anchorTarget(root: Element, target: Target): Anchored | null {
  if (target.type === 'text') {
    const range = anchorTextTarget(root, target);
    return range ? { kind: 'text', range } : null;
  }
  const element = anchorElementTarget(root, target);
  return element ? { kind: 'element', element } : null;
}

function selectorOf<T extends { type: string }>(target: Target, type: T['type']): T | undefined {
  return target.selectors.find((s) => s.type === type) as T | undefined;
}

// ------------------------------------------------------------------- text

function anchorTextTarget(root: Element, target: Target): Range | null {
  const quote = selectorOf<TextQuoteSelector>(target, 'TextQuote');
  const pos = selectorOf<TextPositionSelector>(target, 'TextPosition');
  const map = buildTextMap(root);

  if (!quote) {
    return pos ? offsetsToRange(map, pos.start, pos.end) : null;
  }

  // 1. Position fast path: still points at the identical text.
  if (pos && map.text.slice(pos.start, pos.end) === quote.exact) {
    return offsetsToRange(map, pos.start, pos.end);
  }

  // 2. Exact occurrences of the quote, disambiguated by surrounding context.
  const occurrences: number[] = [];
  let idx = map.text.indexOf(quote.exact);
  while (idx !== -1 && occurrences.length < 200) {
    occurrences.push(idx);
    idx = map.text.indexOf(quote.exact, idx + 1);
  }
  if (occurrences.length > 0) {
    const best = pickBestOccurrence(map.text, occurrences, quote, pos);
    return offsetsToRange(map, best, best + quote.exact.length);
  }

  // 3. Fuzzy: the text drifted. Bitap-search for the quote's head and tail.
  return fuzzyAnchor(map, quote, pos);
}

function pickBestOccurrence(
  text: string,
  occurrences: number[],
  quote: TextQuoteSelector,
  pos: TextPositionSelector | undefined,
): number {
  let best = occurrences[0]!;
  let bestScore = -Infinity;
  for (const o of occurrences) {
    const prefixHere = text.slice(Math.max(0, o - quote.prefix.length), o);
    const suffixHere = text.slice(o + quote.exact.length, o + quote.exact.length + quote.suffix.length);
    let score = commonSuffixLength(quote.prefix, prefixHere) + commonPrefixLength(quote.suffix, suffixHere);
    if (pos) score -= Math.abs(o - pos.start) / 10_000;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

// diff-match-patch's bitap implementation caps patterns at 32 chars, so for
// longer quotes we locate head and tail separately (the Hypothesis approach).
const BITAP_MAX = 31;
const MIN_FUZZY_SIMILARITY = 0.55;

function fuzzyAnchor(
  map: TextMap,
  quote: TextQuoteSelector,
  pos: TextPositionSelector | undefined,
): Range | null {
  const exact = quote.exact;
  if (!exact || exact.length > 5000) return null;

  const dmp = new DiffMatchPatch();
  dmp.Match_Threshold = 0.5;
  dmp.Match_Distance = 500_000;

  const hint = pos ? pos.start : 0;
  const headPattern = exact.slice(0, BITAP_MAX);
  const headLoc = dmp.match_main(map.text, headPattern, hint);
  if (headLoc === -1) return null;

  let start: number = headLoc;
  let end: number;
  if (exact.length <= BITAP_MAX) {
    end = headLoc + headPattern.length;
  } else {
    const tailPattern = exact.slice(-BITAP_MAX);
    const tailLoc = dmp.match_main(map.text, tailPattern, headLoc + exact.length - BITAP_MAX);
    if (tailLoc === -1 || tailLoc + tailPattern.length <= headLoc) return null;
    end = tailLoc + tailPattern.length;
  }

  if (end - start > exact.length * 2 + 64) return null;

  // Bitap locations are approximate; snap boundaries outward to word edges so
  // a drifted match doesn't cut a word in half.
  while (start > 0 && /\w/.test(map.text[start]!) && /\w/.test(map.text[start - 1]!)) start--;
  while (end < map.text.length && /\w/.test(map.text[end - 1]!) && /\w/.test(map.text[end]!)) end++;

  const found = map.text.slice(start, end);
  if (similarity(dmp, found, exact) < MIN_FUZZY_SIMILARITY) return null;
  return offsetsToRange(map, start, end);
}

function similarity(dmp: DiffMatchPatch, a: string, b: string): number {
  if (!a || !b) return 0;
  const diffs = dmp.diff_main(a, b);
  const lev = dmp.diff_levenshtein(diffs);
  return 1 - lev / Math.max(a.length, b.length);
}

// ---------------------------------------------------------------- element

const MIN_FINGERPRINT_SCORE = 2;

function anchorElementTarget(root: Element, target: Target): Element | null {
  const css = selectorOf<CssSelector>(target, 'Css');
  const fp = selectorOf<ElementFingerprintSelector>(target, 'ElementFingerprint');
  const doc = root.ownerDocument!;

  if (css?.value) {
    let el: Element | null = null;
    try {
      el = doc.querySelector(css.value);
    } catch {
      // invalid selector (page changed our assumptions) — fall through
    }
    // A CSS path resolving is not proof: pages reflow and an unrelated element
    // can land on the same path. Verify against the fingerprint when it has
    // anything to verify with.
    if (el) {
      if (!fp) return el;
      if (fp.tag === el.tagName.toLowerCase()) {
        if (!hasDistinguishingFeatures(fp)) return el;
        if (fingerprintScore(el, fp) >= MIN_FINGERPRINT_SCORE * 0.75) return el;
      }
    }
  }

  if (!fp) return null;
  let best: Element | null = null;
  let bestScore = -Infinity;
  for (const candidate of Array.from(doc.querySelectorAll(fp.tag))) {
    const score = fingerprintScore(candidate, fp);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= MIN_FINGERPRINT_SCORE ? best : null;
}

function hasDistinguishingFeatures(fp: ElementFingerprintSelector): boolean {
  return Boolean(
    fp.textDigest ||
      fp.attrs.id ||
      fp.attrs.src ||
      fp.attrs.href ||
      fp.attrs.alt ||
      fp.attrs['aria-label'] ||
      fp.attrs.class,
  );
}

function fingerprintScore(el: Element, fp: ElementFingerprintSelector): number {
  let score = 0;
  if (fp.attrs.id && el.id === fp.attrs.id) score += 3;
  if (fp.attrs.src && el.getAttribute('src') === fp.attrs.src) score += 2.5;
  if (fp.attrs.href && el.getAttribute('href') === fp.attrs.href) score += 2;
  if (fp.attrs.alt && el.getAttribute('alt') === fp.attrs.alt) score += 1.5;
  if (fp.attrs['aria-label'] && el.getAttribute('aria-label') === fp.attrs['aria-label']) score += 1.5;
  if (fp.attrs.class) {
    score += 1.5 * jaccard(classSet(fp.attrs.class), classSet(el.getAttribute('class') ?? ''));
  }
  if (fp.textDigest) {
    const digest = normalizeText(el.textContent ?? '').slice(0, 180);
    score += 3 * digestSimilarity(fp.textDigest, digest);
  }
  return score;
}

function classSet(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Cheap similarity for short digests: shared-prefix ratio. */
function digestSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i / Math.max(a.length, b.length);
}
