import {
  ArrowBigDown,
  ArrowBigUp,
  Check,
  Lightbulb,
  Triangle,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactionKind } from '@vitrum/model';

/** LessWrong-flavored react palette. Order = display order. */
export const REACTIONS: { kind: ReactionKind; title: string; Icon: LucideIcon }[] = [
  { kind: 'up', title: 'Upvote', Icon: ArrowBigUp },
  { kind: 'down', title: 'Downvote', Icon: ArrowBigDown },
  { kind: 'agree', title: 'Agree', Icon: Check },
  { kind: 'disagree', title: 'Disagree', Icon: X },
  { kind: 'insightful', title: 'Insightful', Icon: Lightbulb },
  { kind: 'delta', title: 'Changed my mind', Icon: Triangle },
];
