import { buildTextMap, offsetsToRange } from './textMap';

/** Find the first occurrence of `needle` in the subtree's text and return it as a Range. */
export function rangeFromString(root: Element, needle: string): Range | null {
  if (!needle) return null;
  const map = buildTextMap(root);
  const idx = map.text.indexOf(needle);
  if (idx === -1) return null;
  return offsetsToRange(map, idx, idx + needle.length);
}
