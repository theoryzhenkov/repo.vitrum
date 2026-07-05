import { Bookmark } from 'lucide-react';
import { clamp } from '@/lib/util';
import type { PendingTarget } from '../types';

interface Props {
  pending: PendingTarget;
  onSave: () => void;
}

/** Single-action capture button over a fresh selection / picked element.
    Everything else (comments, lists) happens later, on the pill's card. */
export function SelectionPopover({ pending, onSave }: Props) {
  const width = 88;
  const left = clamp(pending.rect.x + pending.rect.width / 2 - width / 2, 8, window.innerWidth - width - 8);
  const top = clamp(pending.rect.y + pending.rect.height + 8, 8, window.innerHeight - 48);

  return (
    <div className="vt-popover" style={{ left, top }} data-vitrum-ui="1">
      <button className="vt-save-btn" onClick={onSave} title="Save (highlight) — comment or file it from its pill">
        <Bookmark size={14} /> Save
      </button>
    </div>
  );
}
