import type { Annotation, User } from '@vitrum/model';

export interface BadgeInfo {
  rootAnnotation: Annotation;
  element: Element;
  author: User;
  count: number;
}

interface Props {
  badges: BadgeInfo[];
  onOpen: (annotationId: string) => void;
}

/**
 * Small anchored markers on element annotations. Positions are read fresh from
 * getBoundingClientRect on every render; the parent re-renders on scroll/resize.
 */
export function ElementBadges({ badges, onOpen }: Props) {
  return (
    <>
      {badges.map((badge) => {
        const rect = badge.element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;
        if (rect.bottom < -40 || rect.top > window.innerHeight + 40) return null;
        return (
          <button
            key={badge.rootAnnotation.id}
            className="vt-badge"
            style={{
              left: Math.min(rect.right - 10, window.innerWidth - 34),
              top: Math.max(rect.top - 10, 4),
              background: badge.author.color,
            }}
            title={`Annotated by ${badge.author.name}`}
            onClick={() => onOpen(badge.rootAnnotation.id)}
          >
            💬{badge.count > 1 ? <span className="vt-badge-count">{badge.count}</span> : null}
          </button>
        );
      })}
    </>
  );
}
