import type { User } from '@vitrum/model';
import { initials } from '@/lib/util';

export function Avatar({ user, size = 26 }: { user: User; size?: number }) {
  return (
    <span
      className={`vt-avatar${user.kind === 'agent' ? ' vt-avatar-agent' : ''}`}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.42 }}
      title={`@${user.handle}`}
    >
      {user.kind === 'agent' ? '✦' : initials(user.name)}
    </span>
  );
}
