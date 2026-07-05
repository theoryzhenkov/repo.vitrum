import { useRef, useState } from 'react';
import type { User } from '@vitrum/model';
import { Avatar } from './Avatar';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  users: User[];
  placeholder?: string;
  autoFocus?: boolean;
}

/** Textarea with @mention autocomplete. Enter submits, Shift+Enter adds a newline. */
export function MentionTextarea({ value, onChange, onSubmit, users, placeholder, autoFocus }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ query: string; index: number } | null>(null);

  const matches = menu
    ? users
        .filter((u) => u.handle.toLowerCase().startsWith(menu.query.toLowerCase()))
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'agent' ? -1 : 1))
        .slice(0, 5)
    : [];

  function refreshMenu(next: string) {
    const ta = taRef.current;
    const caret = ta ? ta.selectionStart : next.length;
    const before = next.slice(0, caret);
    const m = /(^|\s)@([a-zA-Z0-9_]*)$/.exec(before);
    setMenu(m ? { query: m[2]!, index: 0 } : null);
  }

  function pick(user: User) {
    const ta = taRef.current;
    const caret = ta ? ta.selectionStart : value.length;
    const before = value.slice(0, caret).replace(/@([a-zA-Z0-9_]*)$/, `@${user.handle} `);
    onChange(before + value.slice(caret));
    setMenu(null);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(before.length, before.length);
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (menu && matches.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setMenu({ ...menu, index: (menu.index + delta + matches.length) % matches.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[menu.index]!);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenu(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  }

  return (
    <div className="vt-mention-wrap">
      <textarea
        ref={taRef}
        className="vt-textarea"
        rows={2}
        value={value}
        placeholder={placeholder ?? 'Add a comment… @ to mention an agent'}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          refreshMenu(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
      />
      {menu && matches.length > 0 && (
        <div className="vt-mention-menu" data-vitrum-ui="1">
          {matches.map((u, i) => (
            <button
              key={u.id}
              className={`vt-mention-item${i === menu.index ? ' vt-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
            >
              <Avatar user={u} size={20} />
              <span className="vt-mention-handle">@{u.handle}</span>
              <span className="vt-mention-name">{u.kind === 'agent' ? u.bio ?? 'agent' : u.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
