import { useEffect, useState } from 'react';
import { Diamond, FileText, Quote, Settings, Trash2, X } from 'lucide-react';
import type { List, ListItem } from '@vitrum/model';
import { send, type LibraryState } from '@/lib/messages';
import { timeAgo } from '@/lib/util';

export function LibraryApp() {
  const [library, setLibrary] = useState<LibraryState | null>(null);

  const reload = () => void send('library:get', {}).then(setLibrary);
  useEffect(reload, []);

  async function removeItem(item: ListItem) {
    await send('list:remove-item', { id: item.id });
    reload();
  }

  async function deleteList(list: List) {
    await send('list:delete', { id: list.id });
    reload();
  }

  if (!library) return null;

  const byList = new Map<string, ListItem[]>();
  for (const item of library.items) {
    const bucket = byList.get(item.listId) ?? [];
    bucket.push(item);
    byList.set(item.listId, bucket);
  }

  return (
    <div className="wrap">
      <header className="head">
        <h1>
          <Diamond size={20} className="glyph" /> Library
        </h1>
        <button className="icon-link" title="Settings" onClick={() => void send('open-options', {})}>
          <Settings size={16} />
        </button>
      </header>

      {library.items.length === 0 ? (
        <div className="empty">
          <p>Nothing saved yet.</p>
          <p className="hint">
            On any page, select text or press <kbd>Alt+E</kbd> and choose <b>Save</b> — pages and clips land here.
          </p>
        </div>
      ) : (
        library.lists.map((list) => {
          const items = byList.get(list.id) ?? [];
          if (items.length === 0) return null;
          return (
            <section className="list" key={list.id}>
              <div className="list-head">
                <h2>{list.name}</h2>
                <span className="count">{items.length}</span>
                <button className="icon-link danger" title="Delete list" onClick={() => void deleteList(list)}>
                  <Trash2 size={14} />
                </button>
              </div>
              {items.map((item) => (
                <div className="item" key={item.id}>
                  <span className="item-kind">
                    {item.annotationId ? <Quote size={13} /> : <FileText size={13} />}
                  </span>
                  <a className="item-title" href={item.pageUrl} target="_blank" rel="noreferrer">
                    {item.pageTitle || item.pageUrl}
                  </a>
                  <span className="item-meta">
                    {hostOf(item.pageUrl)} · {timeAgo(item.createdAt)}
                  </span>
                  <button className="icon-link" title="Remove from list" onClick={() => void removeItem(item)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </section>
          );
        })
      )}
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
