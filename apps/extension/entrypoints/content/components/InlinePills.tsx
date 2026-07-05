import { useState } from 'react';
import type { Annotation, User } from '@vitrum/model';
import type { Anchored } from '@vitrum/anchoring';
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

/**
 * Small participant pills riding along each anchored annotation: collapsed to
 * an avatar stack, expanding inline to names on hover. Positions read fresh
 * from live rects each render; the parent re-renders on scroll/resize.
 */
export function InlinePills({ pills, onOpen }: Props) {
  return (
    <>
      {pills.map((pill) => (
        <Pill key={pill.root.id} info={pill} onOpen={onOpen} />
      ))}
    </>
  );
}

export function participantLabel(participants: User[]): string {
  return participants
    .map((u) => (u.kind === 'agent' ? `@${u.handle}` : u.name.split(/\s+/)[0]!))
    .join(', ');
}

function Pill({ info, onOpen }: { info: PillInfo; onOpen: (annotationId: string) => void }) {
  const [hover, setHover] = useState(false);
  const rect = rectFor(info.anchored);
  if (!rect) return null;
  if (rect.bottom < -40 || rect.top > window.innerHeight + 40) return null;

  const pos =
    info.anchored.kind === 'text'
      ? {
          // ride the end of the highlight's last line
          left: Math.min(rect.right + 5, window.innerWidth - 46),
          top: rect.top + rect.height / 2 - 10,
        }
      : {
          // top-right corner of the element
          left: Math.min(rect.right - 14, window.innerWidth - 46),
          top: Math.max(rect.top - 9, 4),
        };

  return (
    <button
      className={`vt-pill${hover ? ' vt-pill-open' : ''}`}
      style={pos}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(info.root.id)}
      title="Open thread"
    >
      <span className="vt-pill-avatars">
        {info.participants.slice(0, 3).map((u) => (
          <Avatar key={u.id} user={u} size={14} />
        ))}
      </span>
      <span className="vt-pill-label">{participantLabel(info.participants)}</span>
    </button>
  );
}

function rectFor(anchored: Anchored): DOMRect | null {
  if (anchored.kind === 'text') {
    const rects = anchored.range.getClientRects();
    return rects.length > 0 ? rects[rects.length - 1]! : anchored.range.getBoundingClientRect();
  }
  const rect = anchored.element.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}
