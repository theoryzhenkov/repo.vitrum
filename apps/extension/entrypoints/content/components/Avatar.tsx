import { Sparkles } from 'lucide-react';
import type { User } from '@vitrum/model';
import { initials } from '@/lib/util';

export function Avatar({ user, size = 26 }: { user: User; size?: number }) {
  return (
    <span
      className={`vt-avatar${user.kind === 'agent' ? ' vt-avatar-agent' : ''}`}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.42 }}
      title={`@${user.handle}`}
    >
      {user.kind === 'agent' ? (
        <Sparkles size={size * 0.55} />
      ) : (
        // Two-letter initials are unreadable below ~18px; drop to one.
        initials(user.name).slice(0, size < 18 ? 1 : 2)
      )}
    </span>
  );
}
