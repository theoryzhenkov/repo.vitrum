import { useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Diamond,
  Ellipsis,
  Library,
  Settings,
  Sprout,
  SquareDashedMousePointer,
  X,
} from 'lucide-react';
import type { Annotation, User } from '@vitrum/model';
import { send, type PageState } from '@/lib/messages';
import { timeAgo } from '@/lib/util';
import { Avatar } from './Avatar';
import { SaveMenu } from './SaveMenu';

interface Props {
  open: boolean;
  state: PageState;
  anchoredIds: Set<string>;
  onClose: () => void;
  onOpenThread: (annotationId: string) => void;
  onSavePage: (listId: string) => void;
  onCreateListAndSavePage: (name: string) => void;
  onPickElement: () => void;
  onSeedDemo: () => void;
}

/** Slim per-page index: header icons + a list of thread rows. Interaction happens inline on the page. */
export function Sidebar(props: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const users = new Map(props.state.users.map((u) => [u.id, u] as const));
  const roots = props.state.annotations
    .filter((a) => a.parentId === null)
    .sort((a, b) => b.createdAt - a.createdAt);
  const replyCount = (rootId: string) =>
    props.state.annotations.filter((a) => a.parentId === rootId).length;

  const pageSaved = props.state.itemsForPage.some((i) => i.annotationId === null);

  return (
    <aside className={`vt-sidebar${props.open ? ' vt-open' : ''}`} data-vitrum-ui="1">
      <header className="vt-side-header">
        <span className="vt-wordmark">
          <Diamond size={13} className="vt-wordmark-glyph" /> Vitrum
        </span>
        <div className="vt-header-actions">
          <div className="vt-save-anchor">
            <button
              className={`vt-icon-btn${pageSaved ? ' vt-icon-on' : ''}`}
              title={pageSaved ? 'Page saved' : 'Save page to a list'}
              onClick={() => {
                setSaveOpen((v) => !v);
                setMenuOpen(false);
              }}
            >
              {pageSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            </button>
            {saveOpen && (
              <SaveMenu
                lists={props.state.lists}
                onSave={props.onSavePage}
                onCreateAndSave={props.onCreateListAndSavePage}
                onClose={() => setSaveOpen(false)}
              />
            )}
          </div>
          <button className="vt-icon-btn" title="Annotate an element (Alt+E)" onClick={props.onPickElement}>
            <SquareDashedMousePointer size={15} />
          </button>
          <div className="vt-save-anchor">
            <button
              className="vt-icon-btn"
              title="More"
              onClick={() => {
                setMenuOpen((v) => !v);
                setSaveOpen(false);
              }}
            >
              <Ellipsis size={15} />
            </button>
            {menuOpen && (
              <div className="vt-menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void send('open-library', {});
                  }}
                >
                  <Library size={13} /> Library
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    props.onSeedDemo();
                  }}
                >
                  <Sprout size={13} /> Seed demo
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void send('open-options', {});
                  }}
                >
                  <Settings size={13} /> Settings
                </button>
              </div>
            )}
          </div>
          <button className="vt-icon-btn" onClick={props.onClose} title="Close (Alt+V)">
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="vt-side-body">
        {roots.length === 0 ? (
          <div className="vt-empty">
            <p>Nothing on this page yet.</p>
            <p className="vt-empty-hint">
              Select text to highlight or comment. Mention <b>@skeptic</b>, <b>@librarian</b>, or <b>@eli5</b> to
              bring an agent in.
            </p>
          </div>
        ) : (
          roots.map((root) => (
            <ThreadRow
              key={root.id}
              root={root}
              users={users}
              replies={replyCount(root.id)}
              anchored={props.anchoredIds.has(root.id)}
              onOpen={() => props.onOpenThread(root.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function ThreadRow({
  root,
  users,
  replies,
  anchored,
  onOpen,
}: {
  root: Annotation;
  users: Map<string, User>;
  replies: number;
  anchored: boolean;
  onOpen: () => void;
}) {
  const author = users.get(root.authorId);
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
