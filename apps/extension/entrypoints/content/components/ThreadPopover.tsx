import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Annotation, List, ListItem, User } from '@vitrum/model';
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
  lists: List[];
  /** List items on this page that reference the root annotation. */
  items: ListItem[];
  onReply: (body: string) => void;
  onDelete: (annotationId: string) => void;
  onToggleList: (listId: string, existing: ListItem | null) => void;
  onCreateListAndSave: (name: string) => void;
  onClose: () => void;
}

const WIDTH = 316;
const MAX_HEIGHT = 420;

/**
 * The one surface for an annotation: quote context, thread (with streaming
 * agent replies), composer, and list membership as toggle chips.
 */
export function ThreadPopover({
  root,
  replies,
  users,
  streams,
  rect,
  lists,
  items,
  onReply,
  onDelete,
  onToggleList,
  onCreateListAndSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const userList = [...users.values()];

  const left = clamp(rect.x, 12, window.innerWidth - WIDTH - 12);
  const below = rect.y + rect.height + 10;
  const style: React.CSSProperties =
    below + MAX_HEIGHT < window.innerHeight - 12
      ? { left, top: below }
      : { left, bottom: clamp(window.innerHeight - rect.y + 10, 12, window.innerHeight - 80) };

  const hasConversation = Boolean(root.body) || replies.length > 0 || streams.length > 0;

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
          placeholder={hasConversation ? 'Reply… @ to ask an agent' : 'Comment… @ to ask an agent'}
        />
        <div className="vt-chips">
          {lists.map((list) => {
            const existing = items.find((i) => i.listId === list.id) ?? null;
            return (
              <button
                key={list.id}
                className={`vt-chip${existing ? ' vt-chip-on' : ''}`}
                title={existing ? `Remove from “${list.name}”` : `Add to “${list.name}”`}
                onClick={() => onToggleList(list.id, existing)}
              >
                {list.name}
              </button>
            );
          })}
          {creatingList ? (
            <form
              className="vt-chip-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (newListName.trim()) {
                  onCreateListAndSave(newListName.trim());
                  setNewListName('');
                  setCreatingList(false);
                }
              }}
            >
              <input
                className="vt-chip-input"
                autoFocus
                placeholder="New list"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onBlur={() => setCreatingList(false)}
              />
            </form>
          ) : (
            <button className="vt-chip vt-chip-new" title="New list" onClick={() => setCreatingList(true)}>
              <Plus size={11} />
            </button>
          )}
        </div>
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
            {isBareHighlight ? 'saved · ' : ''}
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
