import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { User } from '@vitrum/model';
import { clamp } from '@/lib/util';
import type { PendingTarget } from '../types';
import { MentionTextarea } from './MentionTextarea';

interface Props {
  pending: PendingTarget;
  users: User[];
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

/** Inline comment card anchored near the selection/element being annotated. */
export function Composer({ pending, users, onSubmit, onCancel }: Props) {
  const [body, setBody] = useState('');
  const agents = users.filter((u) => u.kind === 'agent');

  const width = 340;
  const left = clamp(pending.rect.x + pending.rect.width / 2 - width / 2, 8, window.innerWidth - width - 8);
  const rawTop = pending.rect.y + pending.rect.height + 12;
  const top = rawTop > window.innerHeight - 230 ? Math.max(8, pending.rect.y - 218) : rawTop;

  return (
    <div className="vt-composer" style={{ left, top, width }} data-vitrum-ui="1">
      <div className="vt-composer-quote">{pending.quote}</div>
      <MentionTextarea
        value={body}
        onChange={setBody}
        onSubmit={() => onSubmit(body)}
        users={users}
        autoFocus
      />
      <div className="vt-composer-agents">
        <span className="vt-composer-hint">Ask:</span>
        {agents.map((a) => (
          <button
            key={a.id}
            className="vt-agent-chip"
            onClick={() => setBody((b) => (b.includes(`@${a.handle}`) ? b : `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${a.handle} `))}
          >
            <Sparkles size={10} /> @{a.handle}
          </button>
        ))}
      </div>
      <div className="vt-composer-actions">
        <button className="vt-btn vt-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="vt-btn vt-btn-primary" disabled={!body.trim()} onClick={() => onSubmit(body)}>
          Comment
        </button>
      </div>
    </div>
  );
}
