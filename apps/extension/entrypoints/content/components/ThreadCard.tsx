import { useState } from 'react';
import type { Annotation, User } from '@vitrum/model';
import { timeAgo } from '@/lib/util';
import type { StreamState } from '../types';
import { Avatar } from './Avatar';
import { MentionTextarea } from './MentionTextarea';

interface Props {
  root: Annotation;
  replies: Annotation[];
  users: Map<string, User>;
  streams: StreamState[];
  active: boolean;
  anchored: boolean;
  onJump: () => void;
  onReply: (body: string) => void;
  onDelete: (annotationId: string) => void;
}

export function ThreadCard({
  root,
  replies,
  users,
  streams,
  active,
  anchored,
  onJump,
  onReply,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState('');
  const [replying, setReplying] = useState(false);
  const author = users.get(root.authorId);
  const userList = [...users.values()];

  function submit() {
    if (!draft.trim()) return;
    onReply(draft);
    setDraft('');
    setReplying(false);
  }

  return (
    <div className={`vt-thread${active ? ' vt-thread-active' : ''}`} id={`vt-thread-${root.id}`}>
      {root.quote && (
        <button
          className={`vt-quote${anchored ? '' : ' vt-quote-orphan'}`}
          onClick={onJump}
          title={anchored ? 'Jump to this on the page' : 'The page changed — original location not found'}
        >
          {root.quote}
          {!anchored && <span className="vt-orphan-tag">page changed</span>}
        </button>
      )}
      <Message annotation={root} author={author} onDelete={onDelete} />
      {replies.map((reply) => (
        <div className="vt-reply" key={reply.id}>
          <Message annotation={reply} author={users.get(reply.authorId)} onDelete={onDelete} />
        </div>
      ))}
      {streams.map((stream) => {
        const agent = users.get(stream.agentId);
        return (
          <div className="vt-reply" key={`${stream.parentId}-${stream.agentId}`}>
            <div className="vt-msg">
              {agent && <Avatar user={agent} />}
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
          </div>
        );
      })}
      {replying ? (
        <div className="vt-reply-box">
          <MentionTextarea value={draft} onChange={setDraft} onSubmit={submit} users={userList} autoFocus />
          <div className="vt-composer-actions">
            <button className="vt-btn vt-btn-ghost" onClick={() => setReplying(false)}>
              Cancel
            </button>
            <button className="vt-btn vt-btn-primary" disabled={!draft.trim()} onClick={submit}>
              Reply
            </button>
          </div>
        </div>
      ) : (
        <button className="vt-reply-trigger" onClick={() => setReplying(true)}>
          Reply… <span className="vt-reply-hint">@ to ask an agent</span>
        </button>
      )}
    </div>
  );
}

function Message({
  annotation,
  author,
  onDelete,
}: {
  annotation: Annotation;
  author: User | undefined;
  onDelete: (id: string) => void;
}) {
  if (!annotation.body && annotation.motivation === 'highlight') {
    return (
      <div className="vt-msg vt-msg-highlight">
        {author && <Avatar user={author} />}
        <div className="vt-msg-main">
          <div className="vt-msg-head">
            <span className="vt-msg-name">{author?.name ?? 'Unknown'}</span>
            <span className="vt-msg-time">highlighted · {timeAgo(annotation.createdAt)}</span>
            {annotation.authorId === 'me' && (
              <button className="vt-msg-delete" onClick={() => onDelete(annotation.id)} title="Delete">
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="vt-msg">
      {author && <Avatar user={author} />}
      <div className="vt-msg-main">
        <div className="vt-msg-head">
          <span className="vt-msg-name">{author?.name ?? 'Unknown'}</span>
          {author?.kind === 'agent' && <span className="vt-agent-tag">agent</span>}
          <span className="vt-msg-time">{timeAgo(annotation.createdAt)}</span>
          {annotation.authorId === 'me' && (
            <button className="vt-msg-delete" onClick={() => onDelete(annotation.id)} title="Delete">
              ×
            </button>
          )}
        </div>
        <div className="vt-msg-body">{annotation.body}</div>
      </div>
    </div>
  );
}
