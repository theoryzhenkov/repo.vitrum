import { useState } from 'react';
import type { Annotation, User } from '@vitrum/model';
import type { Anchored } from '@vitrum/anchoring';
import { flashRange } from '../highlightPainter';
import { Avatar } from './Avatar';

export interface PillInfo {
  root: Annotation;
  anchored: Anchored;
  /** Everyone in the thread, root author first, deduped. */
  participants: User[];
}

interface Props {
  pills: PillInfo[];
  onOpen: (annotationId: string) => void;
}

const PILL_HEIGHT = 20;
const RAIL_GAP = 24; // min vertical spacing between stacked pills
const MARGIN_OFFSET = 8;

interface Placed {
  info: PillInfo;
  left: number;
  top: number;
}

/**
 * Participant pills on a margin rail: text pills sit in the whitespace right
 * of the highlight's containing block, aligned to its first line, stacked
 * downward when they'd collide. Element pills sit on the element's corner.
 * Never inline with text, so they can't overlap it on any layout.
 */
export function InlinePills({ pills, onOpen }: Props) {
  const textPills: Placed[] = [];
  const elementPills: Placed[] = [];

  for (const info of pills) {
    if (info.anchored.kind === 'text') {
      const rects = info.anchored.range.getClientRects();
      const first = rects.length > 0 ? rects[0]! : info.anchored.range.getBoundingClientRect();
      if (first.width === 0 && first.height === 0) continue;
      if (first.bottom < -60 || first.top > window.innerHeight + 60) continue;
      const block = blockAncestor(info.anchored.range.startContainer);
      const blockRight = block ? block.getBoundingClientRect().right : first.right;
      textPills.push({
        info,
        left: Math.min(blockRight + MARGIN_OFFSET, window.innerWidth - 56),
        top: first.top + first.height / 2 - PILL_HEIGHT / 2,
      });
    } else {
      const rect = info.anchored.element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.bottom < -60 || rect.top > window.innerHeight + 60) continue;
      elementPills.push({
        info,
        left: Math.min(rect.right - 14, window.innerWidth - 56),
        top: Math.max(rect.top - 9, 4),
      });
    }
  }

  // Collision pass: stack rail pills downward with a minimum gap.
  textPills.sort((a, b) => a.top - b.top);
  for (let i = 1; i < textPills.length; i++) {
    const prev = textPills[i - 1]!;
    if (textPills[i]!.top < prev.top + RAIL_GAP) textPills[i]!.top = prev.top + RAIL_GAP;
  }

  return (
    <>
      {[...textPills, ...elementPills].map((placed) => (
        <Pill key={placed.info.root.id} placed={placed} onOpen={onOpen} />
      ))}
    </>
  );
}

export function participantLabel(participants: User[]): string {
  return participants
    .map((u) => (u.kind === 'agent' ? `@${u.handle}` : u.name.split(/\s+/)[0]!))
    .join(', ');
}

function Pill({ placed, onOpen }: { placed: Placed; onOpen: (annotationId: string) => void }) {
  const [hover, setHover] = useState(false);
  const { info, left, top } = placed;
  const ownOnly = info.participants.length === 1 && info.participants[0]!.id === 'me';
  const expandMax = Math.max(60, window.innerWidth - left - 56);

  return (
    <button
      className={`vt-pill${hover ? ' vt-pill-open' : ''}${ownOnly ? ' vt-pill-own' : ''}`}
      style={{ left, top }}
      onMouseEnter={() => {
        setHover(true);
        // Show which passage this pill belongs to.
        if (info.anchored.kind === 'text') flashRange(info.anchored.range);
      }}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(info.root.id)}
      title="Open"
    >
      <span className="vt-pill-avatars">
        {info.participants.slice(0, 3).map((u) => (
          <Avatar key={u.id} user={u} size={14} />
        ))}
      </span>
      <span className="vt-pill-label" style={{ maxWidth: hover ? expandMax : 0 }}>
        {participantLabel(info.participants)}
      </span>
    </button>
  );
}

function blockAncestor(node: Node): Element | null {
  let el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && el !== document.body) {
    const display = getComputedStyle(el).display;
    if (/^(block|flex|grid|list-item|table|table-cell)$/.test(display)) return el;
    el = el.parentElement;
  }
  return document.body;
}
