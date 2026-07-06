import { useEffect, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Library,
  Plus,
  Settings,
  Sprout,
  SquareDashedMousePointer,
} from 'lucide-react';
import type { List } from '@vitrum/model';
import { normalizeUrl } from '@vitrum/anchoring';
import { browser } from 'wxt/browser';
import { send, type TabCommand } from '@/lib/messages';

interface TabInfo {
  id: number | undefined;
  url: string;
  title: string;
}

export function Popup() {
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void (async () => {
      const [active] = await browser.tabs.query({ active: true, currentWindow: true });
      const library = await send('library:get', {});
      setLists(library.lists);
      if (active?.url && /^https?:/.test(active.url)) {
        const url = normalizeUrl(active.url);
        setTab({ id: active.id, url, title: active.title ?? '' });
        setSaved(library.items.some((i) => i.pageUrl === url && i.annotationId === null));
      }
    })();
  }, []);

  async function savePage(listId: string) {
    if (!tab) return;
    await send('list:save', { listId, pageUrl: tab.url, pageTitle: tab.title, annotationId: null });
    setSaved(true);
    setSaveOpen(false);
  }

  async function createAndSave() {
    if (!newName.trim()) return;
    const list = await send('list:create', { name: newName.trim() });
    await savePage(list.id);
  }

  // Await everything before window.close() — closing the popup kills its JS
  // context, and a fire-and-forget message can die before it's dispatched.
  async function toTab(cmd: TabCommand) {
    if (tab?.id !== undefined) {
      try {
        await browser.tabs.sendMessage(tab.id, cmd);
      } catch {
        /* no content script on this page */
      }
    }
    window.close();
  }

  async function openLibrary() {
    await browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
    window.close();
  }

  async function openSettings() {
    // Not openOptionsPage(): Chrome sporadically rejects it with "Could not
    // create an options page" — a plain tab to the bundled page always works.
    await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
    window.close();
  }

  const onPage = tab !== null;

  return (
    <div className="pop">
      <button className="row" disabled={!onPage} onClick={() => setSaveOpen((v) => !v)}>
        {saved ? <BookmarkCheck size={15} className="ok" /> : <Bookmark size={15} />}
        <span>{saved ? 'Page saved' : 'Save page'}</span>
        <span className="hint">to a list</span>
      </button>
      {saveOpen && onPage && (
        <div className="lists">
          {lists.map((list) => (
            <button key={list.id} className="row sub" onClick={() => void savePage(list.id)}>
              <span className="dot" />
              <span>{list.name}</span>
            </button>
          ))}
          {creating ? (
            <form
              className="row sub"
              onSubmit={(e) => {
                e.preventDefault();
                void createAndSave();
              }}
            >
              <input
                autoFocus
                placeholder="List name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </form>
          ) : (
            <button className="row sub muted" onClick={() => setCreating(true)}>
              <Plus size={13} />
              <span>New list…</span>
            </button>
          )}
        </div>
      )}

      <button className="row" disabled={!onPage} onClick={() => void toTab({ type: 'element-picker' })}>
        <SquareDashedMousePointer size={15} />
        <span>Annotate element</span>
        <span className="hint">Alt+E</span>
      </button>

      <div className="sep" />

      <button className="row" onClick={() => void openLibrary()}>
        <Library size={15} />
        <span>Library</span>
      </button>
      <button className="row" onClick={() => void openSettings()}>
        <Settings size={15} />
        <span>Settings</span>
      </button>

      <div className="sep" />

      <button className="row muted" disabled={!onPage} onClick={() => void toTab({ type: 'seed-demo' })}>
        <Sprout size={15} />
        <span>Seed demo activity</span>
      </button>
    </div>
  );
}
