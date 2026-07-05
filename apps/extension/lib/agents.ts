import type { User } from '@vitrum/model';
import { db } from './db';
import type { AgentInvoke } from './messages';

const HOUSE_RULES = (agent: User) =>
  `\n\nYou are ${agent.name} (@${agent.handle}), an AI member of the user's reading network in Vitrum. ` +
  'You are commenting inline on a web page the user is reading. Rules: respond directly to what was asked; ' +
  'ground your reply in the provided excerpt and highlighted text; stay under 120 words unless the task ' +
  'genuinely needs more; write plain conversational prose — no headers, no bullet lists unless asked; ' +
  'it is fine to disagree with the page or the user; never invent sources or claim to have browsed anywhere.';

export async function buildAgentPrompt(
  invoke: AgentInvoke,
): Promise<{ agent: User; system: string; user: string }> {
  const agent = await db.users.get(invoke.agentId);
  if (!agent || agent.kind !== 'agent') throw new Error(`Unknown agent: ${invoke.agentId}`);

  const parts: string[] = [
    `Page: ${invoke.pageTitle} (${invoke.pageUrl})`,
    '',
    'Page excerpt:',
    '"""',
    invoke.excerpt,
    '"""',
  ];

  if (invoke.quote) {
    parts.push('', 'The user highlighted this passage:', '"""', invoke.quote, '"""');
  }

  if (agent.handle === 'librarian') {
    const library = await libraryContext(invoke.quote ?? '', invoke.instruction);
    parts.push('', library);
  }

  if (invoke.thread.length > 0) {
    parts.push('', 'Thread so far:');
    for (const msg of invoke.thread) {
      parts.push(`@${msg.author}: ${msg.body}`);
    }
  }

  parts.push('', `The user's request to you: ${invoke.instruction}`);

  return {
    agent,
    system: (agent.persona ?? '') + HOUSE_RULES(agent),
    user: parts.join('\n'),
  };
}

// ------------------------------------------- librarian: related saved items

const STOPWORDS = new Set(
  ('the and for that this with from have has was were are but not you your they their our its ' +
    'will would could should than then when where what which while about into over under more most ' +
    'some such only also very just been being does did').split(' '),
);

function tokens(s: string): Set<string> {
  const words = s.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.sqrt(a.size * b.size);
}

async function libraryContext(quote: string, instruction: string): Promise<string> {
  const queryTokens = tokens(`${quote} ${instruction}`);

  const mine = await db.annotations.where('authorId').equals('me').reverse().sortBy('createdAt');
  const items = await db.listItems.toArray();

  const candidates: { text: string; score: number }[] = [];
  for (const a of mine.slice(0, 300)) {
    const text = `«${(a.quote ?? a.body).slice(0, 200)}» — ${a.pageTitle} (${a.pageUrl})`;
    candidates.push({ text, score: overlap(queryTokens, tokens(`${a.quote ?? ''} ${a.body} ${a.pageTitle}`)) });
  }
  for (const item of items.slice(0, 300)) {
    if (item.annotationId) continue; // clips already covered via their annotation
    candidates.push({
      text: `Saved page: ${item.pageTitle} (${item.pageUrl})`,
      score: overlap(queryTokens, tokens(item.pageTitle)),
    });
  }

  const top = candidates
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (top.length === 0) {
    return "Excerpts from the user's library: (nothing obviously related was found — say so honestly).";
  }
  return "Excerpts from the user's library:\n" + top.map((c) => `- ${c.text}`).join('\n');
}
