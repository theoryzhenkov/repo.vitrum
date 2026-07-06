import type { Annotation, Reaction, ReactionKind } from '@vitrum/model';
import { browser } from 'wxt/browser';
import { buildAgentPrompt, librarianHasMaterial } from '@/lib/agents';
import { db, ensureBaseData } from '@/lib/db';
import { getSettings, setSettings, streamCompletion, testCompletion } from '@/lib/llm';
import {
  AGENT_PORT,
  type AgentEvent,
  type AgentInvoke,
  type MessageType,
  type Protocol,
  type TabCommand,
} from '@/lib/messages';
import { FRIENDS, SEED_COMMENTS, SEED_REPLIES } from '@/lib/personas';
import { id } from '@/lib/util';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void ensureBaseData();
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const { type, payload } = (message ?? {}) as { type?: MessageType; payload?: unknown };
    if (!type || !(type in handlers)) return undefined;
    handleAsync(type, payload)
      .then((data) => sendResponse({ data }))
      .catch((err: unknown) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
    return true; // keep the channel open for the async response
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== AGENT_PORT) return;
    port.onMessage.addListener((raw) => {
      const msg = raw as AgentInvoke;
      if (msg.type !== 'invoke') return;
      const session: AgentSession = {
        pending: 0,
        post: (event) => {
          try {
            port.postMessage(event);
          } catch {
            // port closed (tab navigated) — keep generating so results persist
          }
        },
      };
      void runAgentCascade(msg, session, 0, new Set());
    });
  });

  browser.commands.onCommand.addListener(async (command) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    if (command === 'element-picker' || command === 'save-selection') {
      void sendToTab(tab.id, { type: command });
    }
  });
});

async function sendToTab(tabId: number, command: TabCommand): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, command);
  } catch {
    // No content script on this page (chrome://, web store, PDFs) — nothing to do.
  }
}

async function handleAsync(type: MessageType, payload: unknown): Promise<unknown> {
  await ensureBaseData();
  return handlers[type](payload as never);
}

type Handlers = {
  [T in MessageType]: (payload: Protocol[T]['req']) => Promise<Protocol[T]['res']>;
};

const handlers: Handlers = {
  'page:get-state': async ({ pageUrl }) => {
    const [annotations, users, lists, itemsForPage] = await Promise.all([
      db.annotations.where('pageUrl').equals(pageUrl).sortBy('createdAt'),
      db.users.toArray(),
      db.lists.orderBy('createdAt').toArray(),
      db.listItems.where('pageUrl').equals(pageUrl).toArray(),
    ]);
    const reactions = await db.reactions
      .where('annotationId')
      .anyOf(annotations.map((a) => a.id))
      .toArray();
    return { annotations, users, lists, itemsForPage, reactions };
  },

  'annotation:create': async ({ annotation }) => {
    await db.annotations.add(annotation);
    return annotation;
  },

  'annotation:delete': async ({ id: annotationId }) => {
    await db.transaction('rw', db.annotations, db.listItems, db.reactions, async () => {
      // Collect the full reply subtree — threads nest arbitrarily deep.
      const doomed = [annotationId];
      let frontier = [annotationId];
      while (frontier.length > 0) {
        const children = await db.annotations.where('parentId').anyOf(frontier).primaryKeys();
        doomed.push(...children);
        frontier = children;
      }
      await db.annotations.bulkDelete(doomed);
      await db.reactions.where('annotationId').anyOf(doomed).delete();
      await db.listItems.where('annotationId').anyOf(doomed).delete();
    });
  },

  'reaction:toggle': async ({ annotationId, kind }) => {
    const EXCLUSIVE: Partial<Record<ReactionKind, ReactionKind>> = {
      up: 'down',
      down: 'up',
      agree: 'disagree',
      disagree: 'agree',
    };
    const mine = await db.reactions
      .where('[annotationId+userId]')
      .equals([annotationId, 'me'])
      .toArray();
    const same = mine.find((r) => r.kind === kind);
    if (same) {
      await db.reactions.delete(same.id);
      return;
    }
    const opposite = EXCLUSIVE[kind];
    const conflicting = opposite ? mine.find((r) => r.kind === opposite) : undefined;
    if (conflicting) await db.reactions.delete(conflicting.id);
    await db.reactions.add({ id: id(), annotationId, userId: 'me', kind, createdAt: Date.now() });
  },

  'list:create': async ({ name }) => {
    const list = { id: id(), name: name.trim() || 'Untitled list', createdAt: Date.now() };
    await db.lists.add(list);
    return list;
  },

  'list:save': async ({ listId, pageUrl, pageTitle, annotationId }) => {
    const item = { id: id(), listId, pageUrl, pageTitle, annotationId, createdAt: Date.now() };
    await db.listItems.add(item);
    return item;
  },

  'list:remove-item': async ({ id: itemId }) => {
    await db.listItems.delete(itemId);
  },

  'list:delete': async ({ id: listId }) => {
    await db.transaction('rw', db.lists, db.listItems, async () => {
      await db.lists.delete(listId);
      await db.listItems.where('listId').equals(listId).delete();
    });
  },

  'library:get': async () => {
    const [lists, items, mine] = await Promise.all([
      db.lists.orderBy('createdAt').toArray(),
      db.listItems.orderBy('createdAt').reverse().toArray(),
      db.annotations
        .where('authorId')
        .equals('me')
        .filter((a) => a.parentId === null && a.target !== null)
        .sortBy('createdAt'),
    ]);
    return { lists, items, highlights: mine.reverse() };
  },

  'seed:demo': async ({ pageUrl, pageTitle, seeds }) => {
    // Re-seeding a page replaces earlier seeded activity so rehearsals stay clean.
    const friendIds = FRIENDS.map((f) => f.id);
    const stale = await db.annotations
      .where('pageUrl')
      .equals(pageUrl)
      .filter((a) => friendIds.includes(a.authorId))
      .primaryKeys();
    await db.annotations.bulkDelete(stale);
    await db.reactions.where('annotationId').anyOf(stale).delete();

    const now = Date.now();
    const rows: Annotation[] = [];
    seeds.slice(0, 4).forEach((seed, i) => {
      const friend = FRIENDS[i % FRIENDS.length]!;
      const rootId = id();
      rows.push({
        id: rootId,
        pageUrl,
        pageTitle,
        authorId: friend.id,
        parentId: null,
        target: seed.target,
        quote: seed.quote,
        body: SEED_COMMENTS[(i * 2 + seed.quote.length) % SEED_COMMENTS.length]!,
        motivation: 'comment',
        createdAt: now - (i + 2) * 3_600_000 - (seed.quote.length % 45) * 60_000,
      });
      if (i === 0) {
        const other = FRIENDS[(i + 1) % FRIENDS.length]!;
        rows.push({
          id: id(),
          pageUrl,
          pageTitle,
          authorId: other.id,
          parentId: rootId,
          target: null,
          quote: null,
          body: SEED_REPLIES[seed.quote.length % SEED_REPLIES.length]!,
          motivation: 'comment',
          createdAt: now - (i + 1) * 3_500_000,
        });
      }
    });
    await db.annotations.bulkAdd(rows);

    // A little reaction activity makes seeded threads feel lived-in.
    const kinds: ReactionKind[] = ['up', 'agree', 'insightful'];
    const reactionRows: Reaction[] = [];
    rows
      .filter((r) => r.parentId === null)
      .forEach((root, i) => {
        const others = FRIENDS.filter((f) => f.id !== root.authorId);
        const n = (root.quote?.length ?? 0) % 3; // 0–2, stable per quote
        for (let k = 0; k < n; k++) {
          reactionRows.push({
            id: id(),
            annotationId: root.id,
            userId: others[k % others.length]!.id,
            kind: kinds[(i + k) % kinds.length]!,
            createdAt: root.createdAt + 600_000,
          });
        }
      });
    await db.reactions.bulkAdd(reactionRows);
  },

  'settings:get': () => getSettings(),

  'settings:set': async ({ settings }) => {
    await setSettings(settings);
  },

  'llm:test': async () => {
    try {
      const detail = await testCompletion();
      return { ok: true, detail };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  'open-options': async () => {
    // Same workaround as the popup: openOptionsPage() sporadically rejects.
    await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
  },

  'open-library': async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
  },
};

interface AgentSession {
  pending: number;
  post: (event: AgentEvent) => void;
}

/** Agents may @mention each other; chains cap at this depth past the user's ask. */
const MAX_AGENT_DEPTH = 2;

async function runAgentCascade(
  invoke: AgentInvoke,
  session: AgentSession,
  depth: number,
  visited: Set<string>,
): Promise<void> {
  session.pending++; // incremented synchronously, before any await — keeps the all-done accounting sound
  let announced = false;
  try {
    await ensureBaseData();

    // Unprompted invocations only run when enabled AND the library genuinely connects.
    if (invoke.auto) {
      const settings = await getSettings();
      if (!settings.autoLibrarian) return;
      if (!(await librarianHasMaterial(invoke.quote ?? ''))) return;
    }

    session.post({ type: 'start', agentId: invoke.agentId, parentId: invoke.parentId });
    announced = true;

    const { agent, system, user } = await buildAgentPrompt(invoke);
    const body = (
      await streamCompletion({ system, user }, (text) =>
        session.post({ type: 'chunk', agentId: agent.id, parentId: invoke.parentId, text }),
      )
    ).trim();

    const annotation: Annotation = {
      id: id(),
      pageUrl: invoke.pageUrl,
      pageTitle: invoke.pageTitle,
      authorId: agent.id,
      parentId: invoke.parentId,
      target: null,
      quote: null,
      body,
      motivation: 'comment',
      createdAt: Date.now(),
    };
    await db.annotations.add(annotation);
    session.post({ type: 'done', agentId: agent.id, parentId: invoke.parentId, annotation });

    // The multi-agent moment: an agent @mentioning a peer summons them.
    if (depth < MAX_AGENT_DEPTH) {
      const nextVisited = new Set(visited);
      nextVisited.add(agent.id);
      const peers = (await db.users.where('kind').equals('agent').toArray()).filter(
        (u) => !nextVisited.has(u.id),
      );
      const handles = new Set(
        Array.from(body.matchAll(/@([a-zA-Z0-9_]+)/g), (m) => m[1]!.toLowerCase()),
      );
      const summoned = peers.filter((p) => handles.has(p.handle.toLowerCase())).slice(0, 2);
      if (summoned.length > 0) {
        const chain = await ancestorChain(annotation.id);
        const users = new Map((await db.users.toArray()).map((u) => [u.id, u] as const));
        const thread = chain
          .filter((a) => a.body)
          .map((a) => ({ author: users.get(a.authorId)?.handle ?? 'unknown', body: a.body }));
        for (const peer of summoned) {
          void runAgentCascade(
            {
              type: 'invoke',
              agentId: peer.id,
              parentId: annotation.id,
              pageUrl: invoke.pageUrl,
              pageTitle: invoke.pageTitle,
              quote: invoke.quote,
              instruction: `@${agent.handle} mentioned you in this thread — respond to what they raised.`,
              excerpt: invoke.excerpt,
              thread,
            },
            session,
            depth + 1,
            nextVisited,
          );
        }
      }
    }
  } catch (err) {
    if (announced) {
      session.post({
        type: 'error',
        agentId: invoke.agentId,
        parentId: invoke.parentId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    session.pending--;
    if (session.pending === 0) session.post({ type: 'all-done' });
  }
}

async function ancestorChain(annotationId: string): Promise<Annotation[]> {
  const chain: Annotation[] = [];
  let cursor = await db.annotations.get(annotationId);
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? await db.annotations.get(cursor.parentId) : undefined;
  }
  return chain;
}
