import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Diamond } from 'lucide-react';
import type { Annotation, User } from '@vitrum/model';
import {
  anchorTarget,
  describeElement,
  describeTextRange,
  normalizeUrl,
  type Anchored,
} from '@vitrum/anchoring';
import { browser } from 'wxt/browser';
import {
  AGENT_PORT,
  send,
  type AgentEvent,
  type AgentInvoke,
  type PageState,
  type TabCommand,
} from '@/lib/messages';
import { id } from '@/lib/util';
import { flashRange, paintHighlights } from './highlightPainter';
import { collectSeedCandidates, describeElementForDisplay, pageExcerpt } from './pageUtils';
import type { PendingTarget, Rect, StreamState } from './types';
import { rectOf } from './types';
import { Avatar } from './components/Avatar';
import { ElementPicker } from './components/ElementPicker';
import { InlinePills, participantLabel, type PillInfo } from './components/InlinePills';
import { SelectionPopover } from './components/SelectionPopover';
import { Sidebar } from './components/Sidebar';
import { ThreadPopover } from './components/ThreadPopover';

const EMPTY_STATE: PageState = { annotations: [], users: [], lists: [], itemsForPage: [] };

export function App() {
  const [pageUrl, setPageUrl] = useState(() => normalizeUrl(location.href));
  const [state, setState] = useState<PageState>(EMPTY_STATE);
  const [anchored, setAnchored] = useState<Map<string, Anchored>>(new Map());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [sel, setSel] = useState<PendingTarget | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [streams, setStreams] = useState<StreamState[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [flashRect, setFlashRect] = useState<Rect | null>(null);
  const [, setTick] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await send('page:get-state', { pageUrl }));
    } catch {
      // Background not ready yet (extension just reloaded); retry once.
      setTimeout(() => void send('page:get-state', { pageUrl }).then(setState).catch(() => {}), 600);
    }
  }, [pageUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---- SPA navigation: key everything off the normalized URL.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = normalizeUrl(location.href);
      if (now !== pageUrl) {
        setPageUrl(now);
        setAnchored(new Map());
        setActiveThread(null);
        setSel(null);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [pageUrl]);

  // ---- Commands pushed from the background (toolbar click, keyboard shortcuts).
  useEffect(() => {
    const listener = (message: unknown) => {
      const cmd = message as TabCommand;
      if (cmd?.type === 'toggle-sidebar') setSidebarOpen((v) => !v);
      if (cmd?.type === 'element-picker') setPicker(true);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  // ---- Re-anchor annotations whenever they change; retry for late-loading content.
  useEffect(() => {
    let cancelled = false;
    const attempt = () => {
      if (cancelled) return;
      const next = new Map<string, Anchored>();
      for (const a of stateRef.current.annotations) {
        if (!a.target) continue;
        const result = anchorTarget(document.body, a.target);
        if (result) next.set(a.id, result);
      }
      setAnchored(next);
    };
    attempt();
    const retries = [setTimeout(attempt, 1200), setTimeout(attempt, 3200)];
    return () => {
      cancelled = true;
      retries.forEach(clearTimeout);
    };
  }, [state.annotations]);

  // ---- Paint text highlights grouped by author kind.
  const usersById = useMemo(() => new Map(state.users.map((u) => [u.id, u] as const)), [state.users]);
  useEffect(() => {
    const groups: Record<'mine' | 'friend' | 'agent', Range[]> = { mine: [], friend: [], agent: [] };
    for (const a of state.annotations) {
      const result = anchored.get(a.id);
      if (!result || result.kind !== 'text') continue;
      const author = usersById.get(a.authorId);
      const group = a.authorId === 'me' ? 'mine' : author?.kind === 'agent' ? 'agent' : 'friend';
      groups[group].push(result.range);
    }
    paintHighlights(groups);
  }, [anchored, state.annotations, usersById]);

  // ---- Selection → popover.
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      if (picker) return;
      const path = e.composedPath();
      if (path.some(isOurNode)) return;
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const target = describeTextRange(document.body, range);
        if (!target) return;
        setActiveThread(null);
        setSel({
          kind: 'text',
          target,
          quote: range.toString().replace(/\s+/g, ' ').trim(),
          rect: rectOf(range.getBoundingClientRect()),
          range,
        });
      }, 0);
    }
    function onMouseDown(e: MouseEvent) {
      if (e.composedPath().some(isOurNode)) return;
      setSel(null);
      setActiveThread(null);
    }
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [picker]);

  // ---- Click on a painted highlight opens its thread inline.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (picker || e.composedPath().some(isOurNode)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return; // user is selecting, not clicking
      for (const a of stateRef.current.annotations) {
        const result = anchored.get(a.id);
        if (!result || result.kind !== 'text') continue;
        for (const rect of Array.from(result.range.getClientRects())) {
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            setSel(null);
            setActiveThread(a.parentId ?? a.id);
            return;
          }
        }
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [anchored, picker]);

  // ---- Escape unwinds UI layers; scroll/resize re-render anchored positions.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (picker) setPicker(false);
      else if (sel) setSel(null);
      else if (activeThread) setActiveThread(null);
      else if (sidebarOpen) setSidebarOpen(false);
    }
    let raf = 0;
    function onScrollOrResize() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      cancelAnimationFrame(raf);
    };
  }, [picker, sel, activeThread, sidebarOpen]);

  // ------------------------------------------------------------- actions

  const newAnnotation = useCallback(
    (partial: Pick<Annotation, 'target' | 'quote' | 'body' | 'motivation' | 'parentId'>): Annotation => ({
      id: id(),
      pageUrl,
      pageTitle: document.title,
      authorId: 'me',
      createdAt: Date.now(),
      ...partial,
    }),
    [pageUrl],
  );

  const invokeAgent = useCallback(
    (agent: User, root: Annotation, instruction: string, replies: Annotation[]) => {
      const port = browser.runtime.connect({ name: AGENT_PORT });
      setStreams((all) => [...all, { parentId: root.id, agentId: agent.id, text: '' }]);
      const finish = () =>
        setStreams((all) => all.filter((s) => !(s.parentId === root.id && s.agentId === agent.id)));

      port.onMessage.addListener((raw) => {
        const event = raw as AgentEvent;
        if (event.type === 'chunk') {
          setStreams((all) =>
            all.map((s) =>
              s.parentId === root.id && s.agentId === agent.id ? { ...s, text: s.text + event.text } : s,
            ),
          );
        } else if (event.type === 'done') {
          finish();
          void refresh();
          port.disconnect();
        } else if (event.type === 'error') {
          finish();
          notify(`@${agent.handle}: ${event.message}`);
          port.disconnect();
        }
      });

      const invoke: AgentInvoke = {
        type: 'invoke',
        agentId: agent.id,
        parentId: root.id,
        pageUrl,
        pageTitle: document.title,
        quote: root.quote,
        instruction,
        excerpt: pageExcerpt(),
        thread: [root, ...replies].map((a) => ({
          author: usersById.get(a.authorId)?.handle ?? 'unknown',
          body: a.body,
        })),
      };
      port.postMessage(invoke);
      setActiveThread(root.id);
    },
    [pageUrl, usersById, refresh, notify],
  );

  const mentionedAgents = useCallback(
    (body: string): User[] => {
      const handles = new Set(Array.from(body.matchAll(/@([a-zA-Z0-9_]+)/g), (m) => m[1]!.toLowerCase()));
      return state.users.filter((u) => u.kind === 'agent' && handles.has(u.handle.toLowerCase()));
    },
    [state.users],
  );

  const submitReply = useCallback(
    async (root: Annotation, body: string) => {
      const reply = newAnnotation({
        target: null,
        quote: null,
        body: body.trim(),
        motivation: 'comment',
        parentId: root.id,
      });
      await send('annotation:create', { annotation: reply });
      await refresh();
      const replies = stateRef.current.annotations.filter((a) => a.parentId === root.id);
      for (const agent of mentionedAgents(body)) invokeAgent(agent, root, body.trim(), replies);
    },
    [newAnnotation, refresh, mentionedAgents, invokeAgent],
  );

  const addHighlight = useCallback(
    async (pending: PendingTarget) => {
      const annotation = newAnnotation({
        target: pending.target,
        quote: pending.quote,
        body: '',
        motivation: 'highlight',
        parentId: null,
      });
      await send('annotation:create', { annotation });
      setSel(null);
      window.getSelection()?.removeAllRanges();
      await refresh();
    },
    [newAnnotation, refresh],
  );

  const savePageToList = useCallback(
    async (listId: string) => {
      await send('list:save', { listId, pageUrl, pageTitle: document.title, annotationId: null });
      await refresh();
      notify('Page saved');
    },
    [pageUrl, refresh, notify],
  );

  const createListAndSavePage = useCallback(
    async (name: string) => {
      const list = await send('list:create', { name });
      await savePageToList(list.id);
    },
    [savePageToList],
  );

  const toggleAnnotationList = useCallback(
    async (annotationId: string, listId: string, existing: { id: string } | null) => {
      if (existing) await send('list:remove-item', { id: existing.id });
      else await send('list:save', { listId, pageUrl, pageTitle: document.title, annotationId });
      await refresh();
    },
    [pageUrl, refresh],
  );

  const createListAndSaveAnnotation = useCallback(
    async (annotationId: string, name: string) => {
      const list = await send('list:create', { name });
      await toggleAnnotationList(annotationId, list.id, null);
    },
    [toggleAnnotationList],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      await send('annotation:delete', { id: annotationId });
      if (annotationId === activeThread) setActiveThread(null);
      await refresh();
    },
    [refresh, activeThread],
  );

  /** Open a thread inline; from the sidebar this also scrolls the page to it. */
  const openThread = useCallback(
    (annotationId: string, scroll: boolean) => {
      setSidebarOpen(false);
      setActiveThread(annotationId);
      const result = anchored.get(annotationId);
      if (!result || !scroll) return;
      if (result.kind === 'text') {
        result.range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashRange(result.range);
      } else {
        result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          setFlashRect(rectOf(result.element.getBoundingClientRect()));
          setTimeout(() => setFlashRect(null), 1400);
        }, 450);
      }
    },
    [anchored],
  );

  const onElementPicked = useCallback((el: Element) => {
    setPicker(false);
    setActiveThread(null);
    setSel({
      kind: 'element',
      target: describeElement(document.body, el),
      quote: describeElementForDisplay(el),
      rect: rectOf(el.getBoundingClientRect()),
      element: el,
    });
  }, []);

  const seedDemo = useCallback(async () => {
    const seeds = collectSeedCandidates(3);
    if (seeds.length === 0) {
      notify('Could not find seedable paragraphs on this page');
      return;
    }
    await send('seed:demo', { pageUrl, pageTitle: document.title, seeds });
    await refresh();
    notify('Demo activity staged on this page');
  }, [pageUrl, refresh, notify]);

  // -------------------------------------------------------------- render

  const roots = state.annotations.filter((a) => a.parentId === null);

  const pills: PillInfo[] = roots.flatMap((root) => {
    const result = anchored.get(root.id);
    if (!result) return [];
    const authorIds = [
      root.authorId,
      ...state.annotations.filter((a) => a.parentId === root.id).map((a) => a.authorId),
    ];
    const participants: User[] = [];
    for (const authorId of authorIds) {
      const user = usersById.get(authorId);
      if (user && !participants.some((p) => p.id === user.id)) participants.push(user);
    }
    if (participants.length === 0) return [];
    // Own-only pills render dimmed (see .vt-pill-own) — they're the handle
    // for commenting/filing, so they must exist, but shouldn't shout.
    return [{ root, anchored: result, participants }];
  });

  const pageParticipants: User[] = [];
  for (const a of state.annotations) {
    const user = usersById.get(a.authorId);
    if (user && !pageParticipants.some((p) => p.id === user.id)) pageParticipants.push(user);
  }

  const activeRoot = activeThread ? roots.find((a) => a.id === activeThread) ?? null : null;
  const activeRect: Rect = (() => {
    if (!activeRoot) return { x: 0, y: 0, width: 0, height: 0 };
    const result = anchored.get(activeRoot.id);
    if (result?.kind === 'text') return rectOf(result.range.getBoundingClientRect());
    if (result?.kind === 'element') return rectOf(result.element.getBoundingClientRect());
    return { x: window.innerWidth / 2 - 158, y: 64, width: 316, height: 0 }; // orphan: top-center
  })();

  return (
    <>
      {sel && <SelectionPopover pending={sel} onSave={() => void addHighlight(sel)} />}
      {picker && <ElementPicker onPick={onElementPicked} onCancel={() => setPicker(false)} />}

      <InlinePills pills={pills} onOpen={(annotationId) => openThread(annotationId, false)} />

      {activeRoot && (
        <ThreadPopover
          root={activeRoot}
          replies={state.annotations
            .filter((a) => a.parentId === activeRoot.id)
            .sort((a, b) => a.createdAt - b.createdAt)}
          users={usersById}
          streams={streams.filter((s) => s.parentId === activeRoot.id)}
          rect={activeRect}
          lists={state.lists}
          items={state.itemsForPage.filter((i) => i.annotationId === activeRoot.id)}
          onReply={(body) => void submitReply(activeRoot, body)}
          onDelete={(annotationId) => void deleteAnnotation(annotationId)}
          onToggleList={(listId, existing) => void toggleAnnotationList(activeRoot.id, listId, existing)}
          onCreateListAndSave={(name) => void createListAndSaveAnnotation(activeRoot.id, name)}
          onClose={() => setActiveThread(null)}
        />
      )}

      {flashRect && (
        <div
          className="vt-flash-box"
          style={{ left: flashRect.x - 4, top: flashRect.y - 4, width: flashRect.width + 8, height: flashRect.height + 8 }}
        />
      )}

      {!sidebarOpen && pageParticipants.length > 0 && (
        <button className="vt-presence" onClick={() => setSidebarOpen(true)} title="See annotations (Alt+V)">
          <Diamond size={11} />
          <span className="vt-pill-avatars">
            {pageParticipants.slice(0, 4).map((u) => (
              <Avatar key={u.id} user={u} size={16} />
            ))}
          </span>
          <span className="vt-presence-label">{participantLabel(pageParticipants)}</span>
        </button>
      )}

      <Sidebar
        open={sidebarOpen}
        state={state}
        anchoredIds={new Set(anchored.keys())}
        onClose={() => setSidebarOpen(false)}
        onOpenThread={(annotationId) => openThread(annotationId, true)}
        onSavePage={(listId) => void savePageToList(listId)}
        onCreateListAndSavePage={(name) => void createListAndSavePage(name)}
        onPickElement={() => {
          setSidebarOpen(false);
          setPicker(true);
        }}
        onSeedDemo={() => void seedDemo()}
      />

      {toast && <div className="vt-toast">{toast}</div>}
    </>
  );
}

function isOurNode(node: EventTarget): boolean {
  return node instanceof Element && node.tagName?.toLowerCase().startsWith('vitrum');
}
