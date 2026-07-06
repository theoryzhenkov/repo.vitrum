import { useMemo, useRef, useState } from 'react';
import { GripHorizontal, Plus, Reply, X } from 'lucide-react';
import type { Annotation, List, ListItem, Reaction, ReactionKind, User } from '@vitrum/model';
import { clamp, timeAgo } from '@/lib/util';
import type { Rect, StreamState } from '../types';
import { Avatar } from './Avatar';
import { MentionTextarea } from './MentionTextarea';
import { REACTIONS } from './reactions';

interface Props {
  root: Annotation;
  /** All annotations on the page; the card walks the root's subtree itself. */
  annotations: Annotation[];
  users: Map<string, User>;
  streams: StreamState[];
  reactions: Reaction[];
  /** Live rect of the anchored text/element this thread belongs to. */
  rect: Rect;
  lists: List[];
  /** List items on this page that reference the root annotation. */
  items: ListItem[];
  onReply: (parent: Annotation, body: string) => void;
  onDelete: (annotationId: string) => void;
  onToggleReaction: (annotationId: string, kind: ReactionKind) => void;
  onToggleList: (listId: string, existing: ListItem | null) => void;
  onCreateListAndSave: (name: string) => void;
  onClose: () => void;
}

const WIDTH = 324;
const MAX_HEIGHT_GUESS = 420; // for above/below placement only; real cap is CSS 80vh

/**
 * The one surface for an annotation: nested thread (reply to anything),
 * LW-style reacts, composer, list chips. Pinned to its anchor until dragged —
 * then it's free-floating; native CSS resize for dimensions.
 */
export function ThreadPopover(props: Props) {
  const { root, users, rect, onClose } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Annotation | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  /** null → follow the anchor; set → user dragged it free. */
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const childrenOf = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const a of props.annotations) {
      if (!a.parentId) continue;
      const siblings = map.get(a.parentId) ?? [];
      siblings.push(a);
      map.set(a.parentId, siblings);
    }
    for (const siblings of map.values()) siblings.sort((a, b) => a.createdAt - b.createdAt);
    return map;
  }, [props.annotations]);

  const reactionsFor = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of props.reactions) {
      const bucket = map.get(r.annotationId) ?? [];
      bucket.push(r);
      map.set(r.annotationId, bucket);
    }
    return map;
  }, [props.reactions]);

  const style: React.CSSProperties = (() => {
    if (dragPos) return { left: dragPos.x, top: dragPos.y, width: WIDTH };
    const left = clamp(rect.x, 12, window.innerWidth - WIDTH - 12);
    const below = rect.y + rect.height + 10;
    return below + MAX_HEIGHT_GUESS < window.innerHeight - 12
      ? { left, top: below, width: WIDTH }
      : { left, bottom: clamp(window.innerHeight - rect.y + 10, 12, window.innerHeight - 80), width: WIDTH };
  })();

  function startDrag(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const card = cardRef.current;
    if (!card) return;
    e.preventDefault();
    const box = card.getBoundingClientRect();
    const offsetX = e.clientX - box.x;
    const offsetY = e.clientY - box.y;
    setDragPos({ x: box.x, y: box.y }); // unpin, freeze in place
    const move = (ev: PointerEvent) =>
      setDragPos({
        x: clamp(ev.clientX - offsetX, 4, window.innerWidth - 60),
        y: clamp(ev.clientY - offsetY, 4, window.innerHeight - 40),
      });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function focusComposer() {
    cardRef.current?.querySelector('textarea')?.focus();
  }

  function submit() {
    if (!draft.trim()) return;
    props.onReply(replyTo ?? root, draft);
    setDraft('');
    setReplyTo(null);
  }

  const hasConversation =
    Boolean(root.body) || (childrenOf.get(root.id)?.length ?? 0) > 0 || props.streams.length > 0;

  function MessageRow({ a }: { a: Annotation }) {
    const author = users.get(a.authorId);
    const isBareHighlight = !a.body && a.motivation === 'highlight';
    const reacts = reactionsFor.get(a.id) ?? [];
    return (
      <div className="vt-msg">
        {author && <Avatar user={author} size={20} />}
        <div className="vt-msg-main">
          <div className="vt-msg-head">
            <span className="vt-msg-name">{author?.name ?? 'Unknown'}</span>
            {author?.kind === 'agent' && <span className="vt-agent-tag">agent</span>}
            <span className="vt-msg-time">
              {isBareHighlight ? 'saved · ' : ''}
              {timeAgo(a.createdAt)}
            </span>
            {a.authorId === 'me' && (
              <button className="vt-msg-delete" onClick={() => props.onDelete(a.id)} title="Delete">
                <X size={12} />
              </button>
            )}
          </div>
          {a.body && <div className="vt-msg-body">{a.body}</div>}
          <div className="vt-msg-foot">
            {REACTIONS.map(({ kind, title, Icon }) => {
              const ofKind = reacts.filter((r) => r.kind === kind);
              if (ofKind.length === 0) return null;
              const mine = ofKind.some((r) => r.userId === 'me');
              const names = ofKind
                .map((r) => users.get(r.userId)?.name.split(/\s+/)[0] ?? '?')
                .join(', ');
              return (
                <button
                  key={kind}
                  className={`vt-react-chip${mine ? ' vt-on' : ''}`}
                  title={`${title}: ${names}`}
                  onClick={() => props.onToggleReaction(a.id, kind)}
                >
                  <Icon size={10} />
                  {ofKind.length}
                </button>
              );
            })}
            <span className="vt-msg-actions">
              <button
                title="Reply"
                onClick={() => {
                  setReplyTo(a.id === root.id ? null : a);
                  focusComposer();
                }}
              >
                <Reply size={12} />
              </button>
              {REACTIONS.map(({ kind, title, Icon }) => (
                <button key={kind} title={title} onClick={() => props.onToggleReaction(a.id, kind)}>
                  <Icon size={12} />
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function Thread({ a, depth }: { a: Annotation; depth: number }) {
    const kids = childrenOf.get(a.id) ?? [];
    const myStreams = props.streams.filter((s) => s.parentId === a.id);
    return (
      <div>
        <MessageRow a={a} />
        {(kids.length > 0 || myStreams.length > 0) && (
          <div className={depth < 4 ? 'vt-children' : undefined}>
            {kids.map((kid) => (
              <Thread key={kid.id} a={kid} depth={depth + 1} />
            ))}
            {myStreams.map((stream) => {
              const agent = users.get(stream.agentId);
              return (
                <div className="vt-msg" key={`${stream.parentId}-${stream.agentId}`}>
                  {agent && <Avatar user={agent} size={20} />}
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
        )}
      </div>
    );
  }

  return (
    <div ref={cardRef} className="vt-thread-pop" style={style} data-vitrum-ui="1">
      <div className="vt-thread-head" onPointerDown={startDrag} title="Drag to move">
        <GripHorizontal size={12} />
        <span className="vt-thread-title">{root.quote ?? 'Annotation'}</span>
        <button
          className="vt-thread-pop-close"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      <div className="vt-thread-pop-body">
        <Thread a={root} depth={0} />
      </div>

      <div className="vt-thread-pop-composer">
        {replyTo && (
          <div className="vt-replying">
            <Reply size={11} /> Replying to {users.get(replyTo.authorId)?.name ?? 'Unknown'}
            <button onClick={() => setReplyTo(null)} title="Reply to the highlight instead">
              <X size={11} />
            </button>
          </div>
        )}
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          users={[...users.values()]}
          placeholder={hasConversation ? 'Reply… @ to ask an agent' : 'Comment… @ to ask an agent'}
        />
        <div className="vt-chips">
          {props.lists.map((list) => {
            const existing = props.items.find((i) => i.listId === list.id) ?? null;
            return (
              <button
                key={list.id}
                className={`vt-chip${existing ? ' vt-chip-on' : ''}`}
                title={existing ? `Remove from “${list.name}”` : `Add to “${list.name}”`}
                onClick={() => props.onToggleList(list.id, existing)}
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
                  props.onCreateListAndSave(newListName.trim());
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
    </div>
  );
}
