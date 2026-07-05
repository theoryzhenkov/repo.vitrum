import type { Target } from '@vitrum/model';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A target the user just picked (selection or element), before it becomes an annotation. */
export interface PendingTarget {
  kind: 'text' | 'element';
  target: Target;
  quote: string;
  rect: Rect;
  range?: Range;
  element?: Element;
}

/** An in-flight agent reply being streamed into a thread. */
export interface StreamState {
  parentId: string;
  agentId: string;
  text: string;
}

export function rectOf(r: DOMRect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
