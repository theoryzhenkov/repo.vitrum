import { useState } from 'react';
import { Bookmark, Highlighter, MessageCircle } from 'lucide-react';
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

/** Icon-only pill toolbar over a fresh selection / picked element. */
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

  const width = saveOpen ? 200 : 118;
  const left = clamp(pending.rect.x + pending.rect.width / 2 - width / 2, 8, window.innerWidth - width - 8);
  const top = clamp(pending.rect.y + pending.rect.height + 8, 8, window.innerHeight - 52);

  return (
    <div className="vt-popover" style={{ left, top }} data-vitrum-ui="1">
      <div className="vt-popover-row">
        <button className="vt-pop-btn" onClick={onHighlight} title="Highlight">
          <Highlighter size={15} color="#e6a700" />
        </button>
        <button className="vt-pop-btn" onClick={onComment} title="Comment or ask an agent">
          <MessageCircle size={15} />
        </button>
        <button className="vt-pop-btn" onClick={() => setSaveOpen((v) => !v)} title="Save to a list">
          <Bookmark size={15} />
        </button>
      </div>
      {saveOpen && (
        <SaveMenu lists={lists} onSave={onSave} onCreateAndSave={onCreateAndSave} onClose={onDismiss} />
      )}
    </div>
  );
}
