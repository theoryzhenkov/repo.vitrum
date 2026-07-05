import { useEffect, useState } from 'react';
import type { Rect } from '../types';
import { rectOf } from '../types';

interface Props {
  onPick: (el: Element) => void;
  onCancel: () => void;
}

/** Devtools-style element inspector: hover to outline, click to pick, Esc to cancel. */
export function ElementPicker({ onPick, onCancel }: Props) {
  const [hover, setHover] = useState<{ el: Element; rect: Rect } | null>(null);

  useEffect(() => {
    function pageElementAt(x: number, y: number): Element | null {
      for (const el of document.elementsFromPoint(x, y)) {
        const tag = el.tagName.toLowerCase();
        if (tag.startsWith('vitrum') || el.closest('[data-vitrum-ui]')) continue;
        if (el === document.documentElement || el === document.body) return null;
        return el;
      }
      return null;
    }

    function onMove(e: MouseEvent) {
      const el = pageElementAt(e.clientX, e.clientY);
      setHover(el ? { el, rect: rectOf(el.getBoundingClientRect()) } : null);
    }
    function onClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const el = pageElementAt(e.clientX, e.clientY);
      if (el) onPick(el);
      else onCancel();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onPick, onCancel]);

  return (
    <>
      <div className="vt-picker-veil" data-vitrum-ui="1" />
      {hover && (
        <div
          className="vt-picker-outline"
          style={{
            left: hover.rect.x - 2,
            top: hover.rect.y - 2,
            width: hover.rect.width + 4,
            height: hover.rect.height + 4,
          }}
        >
          <span className="vt-picker-tag">{hover.el.tagName.toLowerCase()}</span>
        </div>
      )}
      <div className="vt-picker-hint">Click an element to annotate it — Esc to cancel</div>
    </>
  );
}
