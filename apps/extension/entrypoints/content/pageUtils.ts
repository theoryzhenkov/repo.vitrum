import { describeTextRange, rangeFromString } from '@vitrum/anchoring';
import type { SeedCandidate } from '@/lib/messages';

/** Best-effort readable text of the page, for agent context. */
export function pageExcerpt(maxLength = 7000): string {
  const root =
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.body;
  const text = (root as HTMLElement).innerText ?? root.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** A short human-readable label for an element target, shown where a quote would be. */
export function describeElementForDisplay(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const label =
    el.getAttribute('alt') ??
    el.getAttribute('aria-label') ??
    el.getAttribute('title') ??
    (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return label ? `<${tag}> ${label.slice(0, 80)}` : `<${tag}> element`;
}

/**
 * Pick a few real sentences from the page and describe them as anchorable
 * targets. Used to stage plausible "friend" activity for demos.
 */
export function collectSeedCandidates(max = 3): SeedCandidate[] {
  const container =
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.body;
  const blocks = Array.from(container.querySelectorAll('p, li, blockquote')).filter((el) => {
    const text = (el.textContent ?? '').trim();
    if (text.length < 80 || text.length > 600) return false;
    const rect = el.getBoundingClientRect();
    return rect.height > 0 && rect.width > 0;
  });
  if (blocks.length === 0) return [];

  const stride = Math.max(1, Math.floor(blocks.length / max));
  const candidates: SeedCandidate[] = [];
  for (let i = 0; i < blocks.length && candidates.length < max; i += stride) {
    const el = blocks[i]!;
    const sentence = pickSentence((el.textContent ?? '').replace(/\s+/g, ' ').trim());
    if (!sentence) continue;
    const range = rangeFromString(el, sentence);
    if (!range) continue;
    const target = describeTextRange(document.body, range);
    if (!target) continue;
    candidates.push({ target, quote: sentence });
  }
  return candidates;
}

function pickSentence(text: string): string | null {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const good = sentences
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 220)
    .sort((a, b) => b.length - a.length);
  return good[0] ?? null;
}
