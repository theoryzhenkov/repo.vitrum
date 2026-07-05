import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Composer } from './components/Composer';
import { ElementBadges, type BadgeInfo } from './components/ElementBadges';
import { ElementPicker } from './components/ElementPicker';
import { SelectionPopover } from './components/SelectionPopover';
import { Sidebar } from './components/Sidebar';

const EMPTY_STATE: PageState = { annotations: [], users: [], lists: [], itemsForPage: [] };

export function App() {
  const [pageUrl, setPageUrl] = useState(() => normalizeUrl(location.href));
  const [state, setState] = useState<PageState>(EMPTY_STATE);
  const [anchored, setAnchored] = useState<Map<string, Anchored>>(new Map());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [sel, setSel] = useState<PendingTarget | null>(null);
  const [composing, setComposing] = useState(false);
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
        setComposing(false);
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
      setComposing(false);
    }
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [picker]);

  // ---- Click on a painted highlight opens its thread.
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
            setSidebarOpen(true);
            setActiveThread(a.parentId ?? a.id);
            return;
          }
        }
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [anchored, picker]);

  // ---- Escape unwinds UI layers; scroll/resize re-render badges.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (picker) setPicker(false);
      else if (composing) setComposing(false);
      else if (sel) setSel(null);
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
  }, [picker, composing, sel, sidebarOpen]);

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
      setSidebarOpen(true);
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

  const submitComment = useCallback(
    async (body: string, pending: PendingTarget) => {
      const root = newAnnotation({
        target: pending.target,
        quote: pending.quote,
        body: body.trim(),
        motivation: 'comment',
        parentId: null,
      });
      await send('annotation:create', { annotation: root });
      setComposing(false);
      setSel(null);
      window.getSelection()?.removeAllRanges();
      await refresh();
      for (const agent of mentionedAgents(body)) invokeAgent(agent, root, body.trim(), []);
      setSidebarOpen(true);
      setActiveThread(root.id);
    },
    [newAnnotation, refresh, mentionedAgents, invokeAgent],
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

  const saveTarget = useCallback(
    async (listId: string, pending: PendingTarget | null) => {
      let annotationId: string | null = null;
      if (pending) {
        const annotation = newAnnotation({
          target: pending.target,
          quote: pending.quote,
          body: '',
          motivation: 'highlight',
          parentId: null,
        });
        await send('annotation:create', { annotation });
        annotationId = annotation.id;
      }
      await send('list:save', { listId, pageUrl, pageTitle: document.title, annotationId });
      setSel(null);
      await refresh();
      notify(pending ? 'Clip saved' : 'Page saved');
    },
    [newAnnotation, pageUrl, refresh, notify],
  );

  const createListAndSave = useCallback(
    async (name: string, pending: PendingTarget | null) => {
      const list = await send('list:create', { name });
      await saveTarget(list.id, pending);
    },
    [saveTarget],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      await send('annotation:delete', { id: annotationId });
      await refresh();
    },
    [refresh],
  );

  const jumpTo = useCallback(
    (annotationId: string) => {
      const result = anchored.get(annotationId);
      if (!result) {
        notify('The page changed — original location not found');
        return;
      }
      setActiveThread(annotationId);
      if (result.kind === 'text') {
        const el = result.range.startContainer.parentElement;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashRange(result.range);
      } else {
        result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          setFlashRect(rectOf(result.element.getBoundingClientRect()));
          setTimeout(() => setFlashRect(null), 1400);
        }, 450);
      }
    },
    [anchored, notify],
  );

  const onElementPicked = useCallback((el: Element) => {
    setPicker(false);
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
  const badges: BadgeInfo[] = roots.flatMap((root) => {
    const result = anchored.get(root.id);
    if (!result || result.kind !== 'element') return [];
    const author = usersById.get(root.authorId);
    if (!author) return [];
    const count = 1 + state.annotations.filter((a) => a.parentId === root.id).length;
    return [{ rootAnnotation: root, element: result.element, author, count }];
  });

  return (
    <>
      {sel && !composing && (
        <SelectionPopover
          pending={sel}
          lists={state.lists}
          onHighlight={() => void addHighlight(sel)}
          onComment={() => setComposing(true)}
          onSave={(listId) => void saveTarget(listId, sel)}
          onCreateAndSave={(name) => void createListAndSave(name, sel)}
          onDismiss={() => setSel(null)}
        />
      )}
      {sel && composing && (
        <Composer
          pending={sel}
          users={state.users}
          onSubmit={(body) => void submitComment(body, sel)}
          onCancel={() => {
            setComposing(false);
            setSel(null);
          }}
        />
      )}
      {picker && <ElementPicker onPick={onElementPicked} onCancel={() => setPicker(false)} />}

      <ElementBadges
        badges={badges}
        onOpen={(annotationId) => {
          setSidebarOpen(true);
          setActiveThread(annotationId);
        }}
      />

      {flashRect && (
        <div
          className="vt-flash-box"
          style={{ left: flashRect.x - 4, top: flashRect.y - 4, width: flashRect.width + 8, height: flashRect.height + 8 }}
        />
      )}

      {!sidebarOpen && (
        <button className="vt-edge-tab" onClick={() => setSidebarOpen(true)} title="Open Vitrum (Alt+V)">
          ◈{roots.length > 0 && <span className="vt-edge-count">{roots.length}</span>}
        </button>
      )}

      <Sidebar
        open={sidebarOpen}
        pageTitle={document.title}
        pageUrl={pageUrl}
        state={state}
        anchoredIds={new Set(anchored.keys())}
        streams={streams}
        activeThread={activeThread}
        onClose={() => setSidebarOpen(false)}
        onJump={jumpTo}
        onReply={(root, body) => void submitReply(root, body)}
        onDelete={(annotationId) => void deleteAnnotation(annotationId)}
        onSavePage={(listId) => void saveTarget(listId, null)}
        onCreateListAndSavePage={(name) => void createListAndSave(name, null)}
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
