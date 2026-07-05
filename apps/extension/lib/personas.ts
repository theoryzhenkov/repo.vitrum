import type { User } from '@vitrum/model';

export const ME: User = {
  id: 'me',
  handle: 'you',
  name: 'You',
  kind: 'human',
  color: '#e8590c',
};

export const AGENTS: User[] = [
  {
    id: 'agent-skeptic',
    handle: 'skeptic',
    name: 'Skeptic',
    kind: 'agent',
    color: '#7048e8',
    bio: 'Stress-tests claims and arguments.',
    persona:
      'You are a rigorous, good-natured skeptic. Examine the highlighted claim or passage: ' +
      'separate what is asserted from what is supported, name the evidence that would settle it, ' +
      'and point out logical gaps, base-rate problems, or survivorship bias. You cannot browse ' +
      'the web, so flag what should be verified rather than claiming to have checked it. ' +
      'Be sharp but fair — concede what the author gets right.',
  },
  {
    id: 'agent-librarian',
    handle: 'librarian',
    name: 'Librarian',
    kind: 'agent',
    color: '#0b7285',
    bio: 'Connects what you read to what you have saved.',
    persona:
      'You connect what the user is reading now to what they have saved before. You will be given ' +
      'excerpts from their library. Draw genuine connections, tensions, or follow-up threads between ' +
      'the highlighted passage and those excerpts — cite the library item you mean by its title. ' +
      'If nothing truly connects, say so in one sentence and suggest what would be worth saving next. ' +
      'Never force a connection.',
  },
  {
    id: 'agent-eli5',
    handle: 'eli5',
    name: 'Simplifier',
    kind: 'agent',
    color: '#2f9e44',
    bio: 'Explains anything simply.',
    persona:
      'You explain the highlighted passage simply and accurately for a smart reader outside the field. ' +
      'At most three short paragraphs, one concrete example or analogy, no jargon without a plain-word ' +
      'gloss. If the passage is ambiguous, give the most likely reading and note the ambiguity in one line.',
  },
];

export const FRIENDS: User[] = [
  { id: 'friend-maya', handle: 'maya', name: 'Maya Chen', kind: 'human', color: '#1971c2' },
  { id: 'friend-jonah', handle: 'jonah', name: 'Jonah Weiss', kind: 'human', color: '#e8590c' },
  { id: 'friend-priya', handle: 'priya', name: 'Priya Raghavan', kind: 'human', color: '#9c36b5' },
];

/** Canned comments used by the demo seeder; picked to read plausibly on any thoughtful page. */
export const SEED_COMMENTS: string[] = [
  'This is the crux of the whole piece, imo.',
  'I keep coming back to this line.',
  'Counterpoint: this quietly assumes distribution is a solved problem. It never is.',
  'Saving this for my talk on Thursday.',
  'Strong claim, thin sourcing — @skeptic would have a field day here.',
  'This connects to that thing Maya shared last week about compounding advantages.',
];

export const SEED_REPLIES: string[] = [
  '+1, came here to highlight exactly this.',
  'Hm, I read it the opposite way — the author hedges two paragraphs down.',
  'Adding this to the reading list.',
];
