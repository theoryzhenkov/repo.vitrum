/**
 * A TextMap is a flattened view of the visible-ish text of a DOM subtree:
 * one big string plus the mapping back to the text nodes that produced it.
 * All text-target offsets (TextPositionSelector) are relative to this map.
 *
 * Skipped: script/style/etc., and anything belonging to Vitrum's own UI
 * (custom elements prefixed VITRUM- or marked data-vitrum-ui), so our overlay
 * never pollutes the coordinate space it measures.
 */

export interface TextMapEntry {
  node: Text;
  start: number;
  end: number;
}

export interface TextMap {
  root: Element;
  text: string;
  entries: TextMapEntry[];
  byNode: Map<Text, TextMapEntry>;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT']);

export function buildTextMap(root: Element): TextMap {
  const doc = root.ownerDocument;
  if (!doc) throw new Error('root is not attached to a document');

  const skipCache = new Map<Element, boolean>();
  const isSkipped = (el: Element): boolean => {
    const cached = skipCache.get(el);
    if (cached !== undefined) return cached;
    let result: boolean;
    const tag = el.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag) || tag.startsWith('VITRUM') || el.getAttribute('data-vitrum-ui') !== null) {
      result = true;
    } else {
      result = el.parentElement ? isSkipped(el.parentElement) : false;
    }
    skipCache.set(el, result);
    return result;
  };

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries: TextMapEntry[] = [];
  const byNode = new Map<Text, TextMapEntry>();
  let text = '';

  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (parent && isSkipped(parent)) continue;
    const value = node.data;
    if (!value) continue;
    const entry: TextMapEntry = { node, start: text.length, end: text.length + value.length };
    entries.push(entry);
    byNode.set(node, entry);
    text += value;
  }

  return { root, text, entries, byNode };
}

/** Map a DOM boundary point (container, offset) to a global text offset. */
export function pointToOffset(map: TextMap, container: Node, offset: number): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const entry = map.byNode.get(container as Text);
    if (entry) return entry.start + Math.min(offset, entry.node.data.length);
    return firstOffsetAtOrAfter(map, container);
  }
  const childNodes = container.childNodes;
  if (offset < childNodes.length) {
    return firstOffsetAtOrAfter(map, childNodes[offset]!);
  }
  return offsetAfterSubtree(map, container);
}

/** Offset of the first mapped text at, inside, or after `node` in document order. */
function firstOffsetAtOrAfter(map: TextMap, node: Node): number | null {
  for (const e of map.entries) {
    if (e.node === node) return e.start;
    const cmp = node.compareDocumentPosition(e.node);
    if (cmp & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) {
      return e.start;
    }
  }
  return map.text.length;
}

/** Offset just past everything inside `node`. */
function offsetAfterSubtree(map: TextMap, node: Node): number {
  for (const e of map.entries) {
    const cmp = node.compareDocumentPosition(e.node);
    if (cmp & Node.DOCUMENT_POSITION_FOLLOWING && !(cmp & Node.DOCUMENT_POSITION_CONTAINED_BY)) {
      return e.start;
    }
  }
  return map.text.length;
}

export function rangeToOffsets(map: TextMap, range: Range): { start: number; end: number } | null {
  const start = pointToOffset(map, range.startContainer, range.startOffset);
  const end = pointToOffset(map, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

export function offsetsToRange(map: TextMap, start: number, end: number): Range | null {
  if (start < 0 || end > map.text.length || end <= start) return null;
  const doc = map.root.ownerDocument!;
  const s = locate(map, start, false);
  const e = locate(map, end, true);
  if (!s || !e) return null;
  const range = doc.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  return range;
}

function locate(
  map: TextMap,
  offset: number,
  preferEnd: boolean,
): { node: Text; offset: number } | null {
  for (const entry of map.entries) {
    if (offset < entry.start) break;
    if (offset < entry.end || (preferEnd && offset === entry.end)) {
      return { node: entry.node, offset: offset - entry.start };
    }
  }
  const last = map.entries[map.entries.length - 1];
  if (last && offset === last.end) {
    return { node: last.node, offset: last.node.data.length };
  }
  return null;
}
