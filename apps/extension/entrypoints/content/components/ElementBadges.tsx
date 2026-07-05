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
 * Minimal dot markers on annotated elements. Positions read fresh from
 * getBoundingClientRect each render; the parent re-renders on scroll/resize.
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
            className="vt-dot"
            style={{
              left: Math.min(rect.right - 7, window.innerWidth - 22),
              top: Math.max(rect.top - 7, 4),
              background: badge.author.color,
            }}
            title={`${badge.author.name}${badge.count > 1 ? ` +${badge.count - 1}` : ''} — open thread`}
            onClick={() => onOpen(badge.rootAnnotation.id)}
          />
        );
      })}
    </>
  );
}
