import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Diamond } from 'lucide-react';
import type { Annotation, ReactionKind, User } from '@vitrum/model';
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
import { flashRange, paintHighlights, setHoverRange } from './highlightPainter';
import { collectSeedCandidates, describeElementForDisplay, pageExcerpt } from './pageUtils';
import type { PendingTarget, Rect, StreamState } from './types';
import { rectOf } from './types';
import { Avatar } from './components/Avatar';
import { ElementPicker } from './components/ElementPicker';
import { InlinePills, participantLabel, type PillInfo } from './components/InlinePills';
import { PageIndex } from './components/PageIndex';
import { SelectionPopover } from './components/SelectionPopover';
import { ThreadPopover } from './components/ThreadPopover';

const EMPTY_STATE: PageState = { annotations: [], users: [], lists: [], itemsForPage: [], reactions: [] };

export function App() {
  const [pageUrl, setPageUrl] = useState(() => normalizeUrl(location.href));
  const [state, setState] = useState<PageState>(EMPTY_STATE);
  const [anchored, setAnchored] = useState<Map<string, Anchored>>(new Map());
  const [picker, setPicker] = useState(false);
  const [sel, setSel] = useState<PendingTarget | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
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
        setIndexOpen(false);
        setSel(null);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [pageUrl]);

  // ---- Re-anchor when annotations change, and again (debounced) whenever the
  //      page DOM mutates — that's what keeps pill positions from going stale.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
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
    const observer = new MutationObserver(() => {
      if (stateRef.current.annotations.length === 0) return;
      clearTimeout(timer);
      timer = window.setTimeout(attempt, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [state.annotations]);

  // ---- Reposition overlays on scroll/resize and on layout reflow (images
  //      loading, lazy content) via a ResizeObserver on the body.
  useEffect(() => {
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    const resizeObserver = new ResizeObserver(bump);
    resizeObserver.observe(document.body);
    window.addEventListener('scroll', bump, { passive: true });
    window.addEventListener('resize', bump, { passive: true });
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', bump);
      window.removeEventListener('resize', bump);
      cancelAnimationFrame(raf);
    };
  }, []);

  // ---- Paint text highlights grouped by author kind.
  const usersById = useMemo(() => new Map(state.users.map((u) => [u.id, u] as const)), [state.users]);
  const annotationsById = useMemo(
    () => new Map(state.annotations.map((a) => [a.id, a] as const)),
    [state.annotations],
  );
  const childrenOf = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const a of state.annotations) {
      if (!a.parentId) continue;
      const siblings = map.get(a.parentId) ?? [];
      siblings.push(a);
      map.set(a.parentId, siblings);
    }
    return map;
  }, [state.annotations]);
  const subtreeOf = useCallback(
    (rootId: string): Annotation[] => {
      const out: Annotation[] = [];
      const stack = [...(childrenOf.get(rootId) ?? [])];
      while (stack.length > 0) {
        const a = stack.pop()!;
        out.push(a);
        const kids = childrenOf.get(a.id);
        if (kids) stack.push(...kids);
      }
      return out;
    },
    [childrenOf],
  );
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

  // ---- Selection → Save popover.
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      if (picker) return;
      if (e.composedPath().some(isOurNode)) return;
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
      // The thread card is pinned — only Esc/close/opening another dismisses it.
      setSel(null);
      setIndexOpen(false);
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
      const hit = hitTextAnnotation(stateRef.current.annotations, anchored, e.clientX, e.clientY);
      if (hit) setActiveThread(hit.parentId ?? hit.id);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [anchored, picker]);

  // ---- Hover affordance: tint the highlight under the cursor, show pointer.
  useEffect(() => {
    let raf = 0;
    let hovering = false;
    function onMove(e: MouseEvent) {
      if (picker) return;
      const overUs = e.composedPath().some(isOurNode);
      const { clientX, clientY } = e;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const hit = overUs ? null : hitTextAnnotation(stateRef.current.annotations, anchored, clientX, clientY);
        if (hit) {
          const result = anchored.get(hit.id);
          if (result?.kind === 'text') setHoverRange(result.range);
          if (!hovering) {
            document.documentElement.style.cursor = 'pointer';
            hovering = true;
          }
        } else if (hovering) {
          setHoverRange(null);
          document.documentElement.style.cursor = '';
          hovering = false;
        }
      });
    }
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      setHoverRange(null);
      document.documentElement.style.cursor = '';
    };
  }, [anchored, picker]);

  // ---- Escape unwinds UI layers.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (picker) setPicker(false);
      else if (sel) setSel(null);
      else if (activeThread) setActiveThread(null);
      else if (indexOpen) setIndexOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picker, sel, activeThread, indexOpen]);

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
    (
      agent: User,
      root: Annotation,
      attachToId: string,
      instruction: string,
      context: Annotation[],
      opts: { auto?: boolean } = {},
    ) => {
      // One port per invoke, but the background may cascade (agents summoning
      // agents), so every event carries its (parentId, agentId) stream key.
      const port = browser.runtime.connect({ name: AGENT_PORT });
      const drop = (parentId: string, agentId: string) =>
        setStreams((all) => all.filter((s) => !(s.parentId === parentId && s.agentId === agentId)));

      port.onMessage.addListener((raw) => {
        const event = raw as AgentEvent;
        if (event.type === 'start') {
          setStreams((all) => [...all, { parentId: event.parentId, agentId: event.agentId, text: '' }]);
        } else if (event.type === 'chunk') {
          setStreams((all) =>
            all.map((s) =>
              s.parentId === event.parentId && s.agentId === event.agentId
                ? { ...s, text: s.text + event.text }
                : s,
            ),
          );
        } else if (event.type === 'done') {
          drop(event.parentId, event.agentId);
          void refresh();
          if (opts.auto) notify('@librarian connected this to something you saved — see the pill');
        } else if (event.type === 'error') {
          drop(event.parentId, event.agentId);
          if (!opts.auto) notify(event.message);
        } else if (event.type === 'all-done') {
          port.disconnect();
        }
      });

      const invoke: AgentInvoke = {
        type: 'invoke',
        agentId: agent.id,
        parentId: attachToId,
        pageUrl,
        pageTitle: document.title,
        quote: root.quote,
        instruction,
        excerpt: pageExcerpt(),
        thread: context
          .filter((a) => a.body)
          .map((a) => ({
            author: usersById.get(a.authorId)?.handle ?? 'unknown',
            body: a.body,
          })),
        auto: opts.auto,
      };
      port.postMessage(invoke);
      // Unprompted agents stay quiet: no card, just the pill updating.
      if (!opts.auto) setActiveThread(root.id);
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
    async (root: Annotation, parent: Annotation, body: string) => {
      const reply = newAnnotation({
        target: null,
        quote: null,
        body: body.trim(),
        motivation: 'comment',
        parentId: parent.id,
      });
      await send('annotation:create', { annotation: reply });
      await refresh();
      // Context for agents: the ancestor chain down to this reply.
      const chain: Annotation[] = [reply];
      let cursor: Annotation | undefined = parent;
      while (cursor) {
        chain.unshift(cursor);
        cursor = cursor.parentId ? annotationsById.get(cursor.parentId) : undefined;
      }
      // Mentioned agents reply nested under the message that asked them.
      for (const agent of mentionedAgents(body)) invokeAgent(agent, root, reply.id, body.trim(), chain);
    },
    [newAnnotation, refresh, mentionedAgents, invokeAgent, annotationsById],
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
      // The confirmation moment: pulse what was just captured.
      if (pending.range) {
        flashRange(pending.range);
      } else if (pending.element) {
        setFlashRect(rectOf(pending.element.getBoundingClientRect()));
        setTimeout(() => setFlashRect(null), 1400);
      }
      await refresh();
      // Opt-in: librarian reacts to the save when the library connects.
      // The background double-gates on settings + actual related material.
      try {
        const settings = await send('settings:get', {});
        if (settings.autoLibrarian) {
          const librarian = stateRef.current.users.find((u) => u.kind === 'agent' && u.handle === 'librarian');
          if (librarian) {
            invokeAgent(
              librarian,
              annotation,
              annotation.id,
              'The user just saved this passage (this is an automatic invocation, they did not ask you). ' +
                'Share the single strongest genuine connection to their library in one or two sentences.',
              [annotation],
              { auto: true },
            );
          }
        }
      } catch {
        /* settings unavailable — skip the nicety */
      }
    },
    [newAnnotation, refresh, invokeAgent],
  );

  const saveSelectionNow = useCallback(async () => {
    if (sel) {
      await addHighlight(sel);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      notify('Select some text first (Alt+S saves the selection)');
      return;
    }
    const range = selection.getRangeAt(0);
    const target = describeTextRange(document.body, range);
    if (!target) return;
    await addHighlight({
      kind: 'text',
      target,
      quote: range.toString().replace(/\s+/g, ' ').trim(),
      rect: rectOf(range.getBoundingClientRect()),
      range,
    });
  }, [sel, addHighlight, notify]);

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

  const toggleReaction = useCallback(
    async (annotationId: string, kind: ReactionKind) => {
      await send('reaction:toggle', { annotationId, kind });
      await refresh();
    },
    [refresh],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      await send('annotation:delete', { id: annotationId });
      if (annotationId === activeThread) setActiveThread(null);
      await refresh();
    },
    [refresh, activeThread],
  );

  /** Open a thread inline; from the index this also scrolls the page to it. */
  const openThread = useCallback(
    (annotationId: string, scroll: boolean) => {
      setIndexOpen(false);
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

  // ---- Commands from the popup / keyboard shortcuts (stable listener, live handlers).
  const commandsRef = useRef({ picker: () => {}, seed: () => {}, save: () => {} });
  commandsRef.current = {
    picker: () => setPicker(true),
    seed: () => void seedDemo(),
    save: () => void saveSelectionNow(),
  };
  useEffect(() => {
    const listener = (message: unknown) => {
      const cmd = message as TabCommand;
      if (cmd?.type === 'element-picker') commandsRef.current.picker();
      if (cmd?.type === 'seed-demo') commandsRef.current.seed();
      if (cmd?.type === 'save-selection') commandsRef.current.save();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  // -------------------------------------------------------------- render

  const roots = state.annotations.filter((a) => a.parentId === null);

  const pills: PillInfo[] = roots.flatMap((root) => {
    const result = anchored.get(root.id);
    if (!result) return [];
    const authorIds = [root.authorId, ...subtreeOf(root.id).map((a) => a.authorId)];
    const participants: User[] = [];
    for (const authorId of authorIds) {
      const user = usersById.get(authorId);
      if (user && !participants.some((p) => p.id === user.id)) participants.push(user);
    }
    if (participants.length === 0) return [];
    // Own-only pills render dimmed (see .vt-pill-own) — they're the handle
    // for commenting/filing, so they must exist, but shouldn't shout.
    const reactions = state.reactions.filter((r) => r.annotationId === root.id);
    return [{ root, anchored: result, participants, reactions }];
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

      <InlinePills
        pills={pills}
        users={usersById}
        onOpen={(annotationId) => openThread(annotationId, false)}
        onToggleReaction={(annotationId, kind) => void toggleReaction(annotationId, kind)}
      />

      {activeRoot && (
        <ThreadPopover
          key={activeRoot.id}
          root={activeRoot}
          annotations={state.annotations}
          users={usersById}
          streams={streams}
          reactions={state.reactions}
          rect={activeRect}
          lists={state.lists}
          items={state.itemsForPage.filter((i) => i.annotationId === activeRoot.id)}
          onReply={(parent, body) => void submitReply(activeRoot, parent, body)}
          onDelete={(annotationId) => void deleteAnnotation(annotationId)}
          onToggleReaction={(annotationId, kind) => void toggleReaction(annotationId, kind)}
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

      {pageParticipants.length > 0 && (
        <button
          className="vt-presence"
          onClick={() => setIndexOpen((v) => !v)}
          title="Annotations on this page"
        >
          <Diamond size={11} />
          <span className="vt-pill-avatars">
            {pageParticipants.slice(0, 4).map((u) => (
              <Avatar key={u.id} user={u} size={16} />
            ))}
          </span>
          <span className="vt-presence-label">{participantLabel(pageParticipants)}</span>
        </button>
      )}
      {indexOpen && (
        <PageIndex
          state={state}
          anchoredIds={new Set(anchored.keys())}
          onOpen={(annotationId) => openThread(annotationId, true)}
        />
      )}

      {toast && <div className="vt-toast">{toast}</div>}
    </>
  );
}

function isOurNode(node: EventTarget): boolean {
  return node instanceof Element && node.tagName?.toLowerCase().startsWith('vitrum');
}

function hitTextAnnotation(
  annotations: Annotation[],
  anchored: Map<string, Anchored>,
  x: number,
  y: number,
): Annotation | null {
  for (const a of annotations) {
    const result = anchored.get(a.id);
    if (!result || result.kind !== 'text') continue;
    for (const rect of Array.from(result.range.getClientRects())) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return a;
    }
  }
  return null;
}
