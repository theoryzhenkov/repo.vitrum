/**
 * Vitrum data model.
 *
 * The selector design follows the W3C Web Annotation model: every target
 * carries multiple selectors, ordered roughly from most precise to most
 * resilient, and anchoring tries them in turn.
 */

// ---------------------------------------------------------------- selectors

/** Exact quoted text plus surrounding context. The source of truth for text targets. */
export interface TextQuoteSelector {
  type: 'TextQuote';
  exact: string;
  prefix: string;
  suffix: string;
}

/** Character offsets into the page's filtered text content. Fast path only. */
export interface TextPositionSelector {
  type: 'TextPosition';
  start: number;
  end: number;
}

/** CSS path to an element. Fast path; brittle across page changes. */
export interface CssSelector {
  type: 'Css';
  value: string;
}

/** Structural fingerprint of an element, for re-finding it when the CSS path breaks. */
export interface ElementFingerprintSelector {
  type: 'ElementFingerprint';
  tag: string;
  attrs: Record<string, string>;
  /** Normalized text content, truncated. Empty for e.g. images. */
  textDigest: string;
  /** Index among same-tag siblings of its parent at describe time. */
  nthOfType: number;
}

export type Selector =
  | TextQuoteSelector
  | TextPositionSelector
  | CssSelector
  | ElementFingerprintSelector;

export interface Target {
  type: 'text' | 'element';
  selectors: Selector[];
}

// ------------------------------------------------------------------- users

export type UserKind = 'human' | 'agent';

export interface User {
  id: string;
  handle: string;
  name: string;
  kind: UserKind;
  /** Hex color used for the avatar + highlight tinting. */
  color: string;
  bio?: string;
  /** System-prompt persona; only for kind === 'agent'. */
  persona?: string;
}

// ------------------------------------------------------------- annotations

export type Motivation = 'highlight' | 'comment';

export interface Annotation {
  id: string;
  /** Normalized page URL. */
  pageUrl: string;
  pageTitle: string;
  authorId: string;
  /** Roots have parentId === null; replies point at ANY annotation (nested threads). */
  parentId: string | null;
  /** null → about the page as a whole. */
  target: Target | null;
  /** Display copy of the anchored text (or element description) at creation time. */
  quote: string | null;
  body: string;
  motivation: Motivation;
  createdAt: number;
}

// --------------------------------------------------------------- reactions

/** LessWrong-style inline reacts. up/down and agree/disagree are exclusive pairs. */
export type ReactionKind = 'up' | 'down' | 'agree' | 'disagree' | 'insightful' | 'delta';

export interface Reaction {
  id: string;
  annotationId: string;
  userId: string;
  kind: ReactionKind;
  createdAt: number;
}

// ------------------------------------------------------------------- lists

export interface List {
  id: string;
  name: string;
  createdAt: number;
}

export interface ListItem {
  id: string;
  listId: string;
  pageUrl: string;
  pageTitle: string;
  /** When set, the item is a specific clip (annotation) rather than the whole page. */
  annotationId: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------- settings

export type LlmProvider = 'anthropic' | 'openai';

export interface LlmSettings {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  apiKey: '',
  model: 'claude-sonnet-4-6',
};
