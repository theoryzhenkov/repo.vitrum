import { useState } from 'react';
import type { List } from '@vitrum/model';
import { clamp } from '@/lib/util';
import type { PendingTarget } from '../types';
import { SaveMenu } from './SaveMenu';

interface Props {
  pending: PendingTarget;
  lists: List[];
  onHighlight: () => void;
  onComment: () => void;
  onSave: (listId: string) => void;
  onCreateAndSave: (name: string) => void;
  onDismiss: () => void;
}

/** The floating toolbar that appears over a fresh selection or picked element. */
export function SelectionPopover({
  pending,
  lists,
  onHighlight,
  onComment,
  onSave,
  onCreateAndSave,
  onDismiss,
}: Props) {
  const [saveOpen, setSaveOpen] = useState(false);

  const width = 252;
  const left = clamp(pending.rect.x + pending.rect.width / 2 - width / 2, 8, window.innerWidth - width - 8);
  const top = clamp(pending.rect.y + pending.rect.height + 10, 8, window.innerHeight - 60);

  return (
    <div className="vt-popover" style={{ left, top }} data-vitrum-ui="1">
      <div className="vt-popover-row">
        <button className="vt-pop-btn" onClick={onHighlight} title="Highlight">
          <span className="vt-pop-swatch" /> Highlight
        </button>
        <button className="vt-pop-btn" onClick={onComment} title="Comment / ask an agent">
          💬 Comment
        </button>
        <button className="vt-pop-btn" onClick={() => setSaveOpen((v) => !v)} title="Save to a list">
          🔖 Save
        </button>
      </div>
      {saveOpen && (
        <SaveMenu
          lists={lists}
          onSave={onSave}
          onCreateAndSave={onCreateAndSave}
          onClose={onDismiss}
        />
      )}
    </div>
  );
}
