import type { Annotation, List, ListItem, LlmSettings, Target, User } from '@vitrum/model';
import { browser } from 'wxt/browser';

export interface PageState {
  annotations: Annotation[];
  users: User[];
  lists: List[];
  itemsForPage: ListItem[];
}

export interface LibraryState {
  lists: List[];
  items: ListItem[];
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
  'list:create': { req: { name: string }; res: List };
  'list:save': {
    req: { listId: string; pageUrl: string; pageTitle: string; annotationId: string | null };
    res: ListItem;
  };
  'list:remove-item': { req: { id: string }; res: void };
  'library:get': { req: Record<string, never>; res: LibraryState };
  'seed:demo': { req: { pageUrl: string; pageTitle: string; seeds: SeedCandidate[] }; res: void };
  'settings:get': { req: Record<string, never>; res: LlmSettings };
  'settings:set': { req: { settings: LlmSettings }; res: void };
  'llm:test': { req: Record<string, never>; res: { ok: boolean; detail: string } };
  'open-options': { req: Record<string, never>; res: void };
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
  /** Root annotation the reply should attach to. */
  parentId: string;
  pageUrl: string;
  pageTitle: string;
  quote: string | null;
  instruction: string;
  excerpt: string;
  thread: { author: string; body: string }[];
}

export type AgentEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; annotation: Annotation }
  | { type: 'error'; message: string };

// ------------------------------------------------- background → tab pushes

export type TabCommand = { type: 'toggle-sidebar' } | { type: 'element-picker' };
