import type { Annotation, List, ListItem, LlmSettings, Reaction, ReactionKind, Target, User } from '@vitrum/model';
import { browser } from 'wxt/browser';

export interface PageState {
  annotations: Annotation[];
  users: User[];
  lists: List[];
  itemsForPage: ListItem[];
  reactions: Reaction[];
}

export interface LibraryState {
  lists: List[];
  items: ListItem[];
  /** Your root annotations (saves), newest first — the unfiled layer of the library. */
  highlights: Annotation[];
}

export interface SeedCandidate {
  target: Target;
  quote: string;
}

/** Request → response map for runtime messages handled by the background worker. */
export interface Protocol {
  'page:get-state': { req: { pageUrl: string }; res: PageState };
  'annotation:create': { req: { annotation: Annotation }; res: Annotation };
  'annotation:delete': { req: { id: string }; res: void };
  'reaction:toggle': { req: { annotationId: string; kind: ReactionKind }; res: void };
  'list:create': { req: { name: string }; res: List };
  'list:save': {
    req: { listId: string; pageUrl: string; pageTitle: string; annotationId: string | null };
    res: ListItem;
  };
  'list:remove-item': { req: { id: string }; res: void };
  'list:delete': { req: { id: string }; res: void };
  'library:get': { req: Record<string, never>; res: LibraryState };
  'seed:demo': { req: { pageUrl: string; pageTitle: string; seeds: SeedCandidate[] }; res: void };
  'settings:get': { req: Record<string, never>; res: LlmSettings };
  'settings:set': { req: { settings: LlmSettings }; res: void };
  'llm:test': { req: Record<string, never>; res: { ok: boolean; detail: string } };
  'open-options': { req: Record<string, never>; res: void };
  'open-library': { req: Record<string, never>; res: void };
}

export type MessageType = keyof Protocol;

export async function send<T extends MessageType>(
  type: T,
  payload: Protocol[T]['req'],
): Promise<Protocol[T]['res']> {
  const response = (await browser.runtime.sendMessage({ type, payload })) as
    | { data: Protocol[T]['res'] }
    | { error: string }
    | undefined;
  if (!response) throw new Error('No response from background');
  if ('error' in response) throw new Error(response.error);
  return response.data;
}

// -------------------------------------------------- agent streaming (port)

export const AGENT_PORT = 'vitrum-agent';

export interface AgentInvoke {
  type: 'invoke';
  agentId: string;
  /** Annotation the agent's reply attaches to (any node in the thread tree). */
  parentId: string;
  pageUrl: string;
  pageTitle: string;
  quote: string | null;
  instruction: string;
  excerpt: string;
  thread: { author: string; body: string }[];
  /** Unprompted invocation (e.g. librarian reacting to a save): the background
      gates it on settings + whether there's genuinely related material. */
  auto?: boolean;
}

/** One invoke can fan out into a capped cascade (agents mentioning agents),
    so every event names its (parentId, agentId) stream. */
export type AgentEvent =
  | { type: 'start'; agentId: string; parentId: string }
  | { type: 'chunk'; agentId: string; parentId: string; text: string }
  | { type: 'done'; agentId: string; parentId: string; annotation: Annotation }
  | { type: 'error'; agentId: string; parentId: string; message: string }
  | { type: 'all-done' };

// ----------------------------------------- background/popup → tab pushes

export type TabCommand =
  | { type: 'element-picker' }
  | { type: 'save-selection' }
  | { type: 'seed-demo' };
