import { Diamond } from 'lucide-react';
import type { Annotation, User } from '@vitrum/model';
import type { PageState } from '@/lib/messages';
import { timeAgo } from '@/lib/util';
import { Avatar } from './Avatar';

interface Props {
  state: PageState;
  /** Roots that re-anchored; the rest are orphans (page changed). */
  anchoredIds: Set<string>;
  onOpen: (annotationId: string) => void;
}

/**
 * Compact dropdown under the presence chip: every thread on this page,
 * including orphans that no longer have a pill to click.
 */
export function PageIndex({ state, anchoredIds, onOpen }: Props) {
  const users = new Map(state.users.map((u) => [u.id, u] as const));
  const roots = state.annotations
    .filter((a) => a.parentId === null)
    .sort((a, b) => b.createdAt - a.createdAt);
  const childrenOf = new Map<string, string[]>();
  for (const a of state.annotations) {
    if (!a.parentId) continue;
    const kids = childrenOf.get(a.parentId) ?? [];
    kids.push(a.id);
    childrenOf.set(a.parentId, kids);
  }
  const replyCount = (rootId: string) => {
    let count = 0;
    const stack = [...(childrenOf.get(rootId) ?? [])];
    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      count++;
      stack.push(...(childrenOf.get(nodeId) ?? []));
    }
    return count;
  };

  return (
    <div className="vt-index" data-vitrum-ui="1">
      <div className="vt-index-head">
        <Diamond size={12} className="vt-wordmark-glyph" /> On this page
      </div>
      {roots.map((root) => (
        <Row
          key={root.id}
          root={root}
          author={users.get(root.authorId)}
          replies={replyCount(root.id)}
          anchored={anchoredIds.has(root.id)}
          onOpen={() => onOpen(root.id)}
        />
      ))}
    </div>
  );
}

function Row({
  root,
  author,
  replies,
  anchored,
  onOpen,
}: {
  root: Annotation;
  author: User | undefined;
  replies: number;
  anchored: boolean;
  onOpen: () => void;
}) {
  return (
    <button className="vt-row" onClick={onOpen}>
      {author && <Avatar user={author} size={22} />}
      <span className="vt-row-main">
        {root.quote && <span className="vt-row-quote">{root.quote}</span>}
        {root.body && <span className="vt-row-body">{root.body}</span>}
        <span className="vt-row-meta">
          {author?.name ?? 'Unknown'} · {timeAgo(root.createdAt)}
          {replies > 0 && ` · ${replies} ${replies === 1 ? 'reply' : 'replies'}`}
          {!anchored && <span className="vt-orphan-tag">page changed</span>}
        </span>
      </span>
    </button>
  );
}
