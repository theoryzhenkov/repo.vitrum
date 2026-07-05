import { useState } from 'react';
import { X } from 'lucide-react';
import type { Annotation, User } from '@vitrum/model';
import { clamp, timeAgo } from '@/lib/util';
import type { Rect, StreamState } from '../types';
import { Avatar } from './Avatar';
import { MentionTextarea } from './MentionTextarea';

interface Props {
  root: Annotation;
  replies: Annotation[];
  users: Map<string, User>;
  streams: StreamState[];
  /** Live rect of the anchored text/element this thread belongs to. */
  rect: Rect;
  onReply: (body: string) => void;
  onDelete: (annotationId: string) => void;
  onClose: () => void;
}

const WIDTH = 316;
const MAX_HEIGHT = 380;

/** Compact thread card anchored at the annotation — the conversation lives at the text. */
export function ThreadPopover({ root, replies, users, streams, rect, onReply, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const userList = [...users.values()];

  const left = clamp(rect.x, 12, window.innerWidth - WIDTH - 12);
  const below = rect.y + rect.height + 10;
  const style: React.CSSProperties =
    below + MAX_HEIGHT < window.innerHeight - 12
      ? { left, top: below }
      : { left, bottom: clamp(window.innerHeight - rect.y + 10, 12, window.innerHeight - 80) };

  function submit() {
    if (!draft.trim()) return;
    onReply(draft);
    setDraft('');
  }

  return (
    <div className="vt-thread-pop" style={{ ...style, width: WIDTH }} data-vitrum-ui="1">
      <div className="vt-thread-pop-body">
        <Message annotation={root} author={users.get(root.authorId)} onDelete={onDelete} />
        {replies.map((reply) => (
          <Message key={reply.id} annotation={reply} author={users.get(reply.authorId)} onDelete={onDelete} indent />
        ))}
        {streams.map((stream) => {
          const agent = users.get(stream.agentId);
          return (
            <div className="vt-msg vt-msg-indent" key={`${stream.parentId}-${stream.agentId}`}>
              {agent && <Avatar user={agent} size={22} />}
              <div className="vt-msg-main">
                <div className="vt-msg-head">
                  <span className="vt-msg-name">{agent?.name ?? '…'}</span>
                  <span className="vt-msg-time">thinking…</span>
                </div>
                <div className="vt-msg-body">
                  {stream.text}
                  <span className="vt-cursor">▍</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="vt-thread-pop-composer">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          users={userList}
          placeholder="Reply… @ to ask an agent"
        />
      </div>
      <button className="vt-thread-pop-close" onClick={onClose} title="Close (Esc)">
        <X size={14} />
      </button>
    </div>
  );
}

function Message({
  annotation,
  author,
  onDelete,
  indent,
}: {
  annotation: Annotation;
  author: User | undefined;
  onDelete: (id: string) => void;
  indent?: boolean;
}) {
  const isBareHighlight = !annotation.body && annotation.motivation === 'highlight';
  return (
    <div className={`vt-msg${indent ? ' vt-msg-indent' : ''}`}>
      {author && <Avatar user={author} size={22} />}
      <div className="vt-msg-main">
        <div className="vt-msg-head">
          <span className="vt-msg-name">{author?.name ?? 'Unknown'}</span>
          {author?.kind === 'agent' && <span className="vt-agent-tag">agent</span>}
          <span className="vt-msg-time">
            {isBareHighlight ? 'highlighted · ' : ''}
            {timeAgo(annotation.createdAt)}
          </span>
          {annotation.authorId === 'me' && (
            <button className="vt-msg-delete" onClick={() => onDelete(annotation.id)} title="Delete">
              <X size={12} />
            </button>
          )}
        </div>
        {annotation.body && <div className="vt-msg-body">{annotation.body}</div>}
      </div>
    </div>
  );
}
