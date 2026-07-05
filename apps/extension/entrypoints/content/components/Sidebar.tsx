import { useEffect, useState } from 'react';
import type { Annotation, List, User } from '@vitrum/model';
import { send, type LibraryState, type PageState } from '@/lib/messages';
import type { StreamState } from '../types';
import { SaveMenu } from './SaveMenu';
import { ThreadCard } from './ThreadCard';

interface Props {
  open: boolean;
  pageTitle: string;
  pageUrl: string;
  state: PageState;
  anchoredIds: Set<string>;
  streams: StreamState[];
  activeThread: string | null;
  onClose: () => void;
  onJump: (annotationId: string) => void;
  onReply: (root: Annotation, body: string) => void;
  onDelete: (annotationId: string) => void;
  onSavePage: (listId: string) => void;
  onCreateListAndSavePage: (name: string) => void;
  onPickElement: () => void;
  onSeedDemo: () => void;
}

export function Sidebar(props: Props) {
  const [tab, setTab] = useState<'page' | 'library'>('page');
  const [saveOpen, setSaveOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryState | null>(null);

  const users = new Map(props.state.users.map((u) => [u.id, u] as const));
  const roots = props.state.annotations
    .filter((a) => a.parentId === null)
    .sort((a, b) => b.createdAt - a.createdAt);
  const repliesByRoot = new Map<string, Annotation[]>();
  for (const a of props.state.annotations) {
    if (!a.parentId) continue;
    const bucket = repliesByRoot.get(a.parentId) ?? [];
    bucket.push(a);
    repliesByRoot.set(a.parentId, bucket);
  }

  useEffect(() => {
    if (tab === 'library' && props.open) {
      send('library:get', {}).then(setLibrary).catch(() => setLibrary(null));
    }
  }, [tab, props.open]);

  useEffect(() => {
    if (props.activeThread) {
      setTab('page');
      // Wait for the tab content to render, then bring the card into view.
      requestAnimationFrame(() => {
        document
          .querySelector('vitrum-ui')
          ?.shadowRoot?.getElementById(`vt-thread-${props.activeThread}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }, [props.activeThread]);

  const pageSaved = props.state.itemsForPage.some((i) => i.annotationId === null);

  return (
    <aside className={`vt-sidebar${props.open ? ' vt-open' : ''}`} data-vitrum-ui="1">
      <header className="vt-side-header">
        <span className="vt-wordmark">
          <span className="vt-wordmark-glyph">◈</span> Vitrum
        </span>
        <button className="vt-icon-btn" onClick={props.onClose} title="Close (Alt+V)">
          ×
        </button>
      </header>

      <div className="vt-page-card">
        <div className="vt-page-title" title={props.pageTitle}>
          {props.pageTitle || 'Untitled page'}
        </div>
        <div className="vt-page-host">{hostOf(props.pageUrl)}</div>
        <div className="vt-page-actions">
          <div className="vt-save-anchor">
            <button
              className={`vt-btn ${pageSaved ? 'vt-btn-saved' : 'vt-btn-primary'}`}
              onClick={() => setSaveOpen((v) => !v)}
            >
              {pageSaved ? '✓ Saved' : '🔖 Save page'}
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
          <button className="vt-btn vt-btn-ghost" onClick={props.onPickElement} title="Alt+E">
            ⌖ Element
          </button>
        </div>
      </div>

      <nav className="vt-tabs">
        <button className={`vt-tab${tab === 'page' ? ' vt-active' : ''}`} onClick={() => setTab('page')}>
          This page {roots.length > 0 && <span className="vt-tab-count">{roots.length}</span>}
        </button>
        <button className={`vt-tab${tab === 'library' ? ' vt-active' : ''}`} onClick={() => setTab('library')}>
          Library
        </button>
      </nav>

      <div className="vt-side-body">
        {tab === 'page' ? (
          roots.length === 0 ? (
            <div className="vt-empty">
              <p>Nothing here yet.</p>
              <p className="vt-empty-hint">
                Select any text to highlight or comment, or press <kbd>Alt+E</kbd> to annotate an element.
                Mention <b>@skeptic</b>, <b>@librarian</b>, or <b>@eli5</b> to bring an agent into the margin.
              </p>
            </div>
          ) : (
            roots.map((root) => (
              <ThreadCard
                key={root.id}
                root={root}
                replies={(repliesByRoot.get(root.id) ?? []).sort((a, b) => a.createdAt - b.createdAt)}
                users={users}
                streams={props.streams.filter((s) => s.parentId === root.id)}
                active={props.activeThread === root.id}
                anchored={props.anchoredIds.has(root.id)}
                onJump={() => props.onJump(root.id)}
                onReply={(body) => props.onReply(root, body)}
                onDelete={props.onDelete}
              />
            ))
          )
        ) : (
          <LibraryView library={library} />
        )}
      </div>

      <footer className="vt-side-footer">
        <button className="vt-footer-link" onClick={props.onSeedDemo} title="Stage friend activity on this page">
          Seed demo
        </button>
        <button className="vt-footer-link" onClick={() => void send('open-options', {})}>
          Settings
        </button>
      </footer>
    </aside>
  );
}

function LibraryView({ library }: { library: LibraryState | null }) {
  if (!library) return <div className="vt-empty">Loading…</div>;
  if (library.items.length === 0) {
    return (
      <div className="vt-empty">
        <p>Your library is empty.</p>
        <p className="vt-empty-hint">Save pages or clips into lists and they will show up here.</p>
      </div>
    );
  }
  const byList = new Map<string, typeof library.items>();
  for (const item of library.items) {
    const bucket = byList.get(item.listId) ?? [];
    bucket.push(item);
    byList.set(item.listId, bucket);
  }
  return (
    <div>
      {library.lists.map((list: List) => {
        const items = byList.get(list.id) ?? [];
        if (items.length === 0) return null;
        return (
          <div className="vt-lib-list" key={list.id}>
            <div className="vt-lib-name">
              {list.name} <span className="vt-tab-count">{items.length}</span>
            </div>
            {items.map((item) => (
              <button className="vt-lib-item" key={item.id} onClick={() => window.open(item.pageUrl, '_blank')}>
                <span className="vt-lib-kind">{item.annotationId ? '❝' : '📄'}</span>
                <span className="vt-lib-title">{item.pageTitle || item.pageUrl}</span>
                <span className="vt-lib-host">{hostOf(item.pageUrl)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
