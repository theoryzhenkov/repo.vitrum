import type { Annotation } from '@vitrum/model';
import { browser } from 'wxt/browser';
import { buildAgentPrompt } from '@/lib/agents';
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
      void runAgent(msg, port);
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
    return { annotations, users, lists, itemsForPage };
  },

  'annotation:create': async ({ annotation }) => {
    await db.annotations.add(annotation);
    return annotation;
  },

  'annotation:delete': async ({ id: annotationId }) => {
    await db.transaction('rw', db.annotations, db.listItems, async () => {
      await db.annotations.delete(annotationId);
      await db.annotations.where('parentId').equals(annotationId).delete();
      await db.listItems.where('annotationId').equals(annotationId).delete();
    });
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
    await browser.runtime.openOptionsPage();
  },

  'open-library': async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
  },
};

async function runAgent(invoke: AgentInvoke, port: { postMessage: (msg: AgentEvent) => void }): Promise<void> {
  try {
    await ensureBaseData();
    const { agent, system, user } = await buildAgentPrompt(invoke);
    const body = await streamCompletion({ system, user }, (text) => {
      try {
        port.postMessage({ type: 'chunk', text });
      } catch {
        // port closed mid-stream (tab navigated) — keep generating so we still persist
      }
    });
    const annotation: Annotation = {
      id: id(),
      pageUrl: invoke.pageUrl,
      pageTitle: invoke.pageTitle,
      authorId: agent.id,
      parentId: invoke.parentId,
      target: null,
      quote: null,
      body: body.trim(),
      motivation: 'comment',
      createdAt: Date.now(),
    };
    await db.annotations.add(annotation);
    try {
      port.postMessage({ type: 'done', annotation });
    } catch {
      /* port closed */
    }
  } catch (err) {
    try {
      port.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } catch {
      /* port closed */
    }
  }
}
