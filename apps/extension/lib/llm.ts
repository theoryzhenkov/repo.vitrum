import type { LlmSettings } from '@vitrum/model';
import { DEFAULT_LLM_SETTINGS } from '@vitrum/model';
import { browser } from 'wxt/browser';

const SETTINGS_KEY = 'llmSettings';

export async function getSettings(): Promise<LlmSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_LLM_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<LlmSettings> | undefined) };
}

export async function setSettings(settings: LlmSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * Stream a completion from the configured provider, invoking onChunk per text delta.
 * Returns the full text. Works against Anthropic, OpenAI, and OpenAI-compatible
 * local servers (Ollama, LM Studio) — just point baseUrl at them.
 */
export async function streamCompletion(
  req: CompletionRequest,
  onChunk: (text: string) => void,
): Promise<string> {
  const settings = await getSettings();
  if (!settings.apiKey && settings.provider === 'anthropic' && isCloudUrl(settings.baseUrl)) {
    throw new Error('No API key configured. Open Vitrum settings to add one.');
  }

  const { url, headers, body } = buildRequest(settings, req, true);
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`LLM request failed (${res.status}): ${detail}`);
  }
  if (!res.body) throw new Error('LLM response had no body');

  let full = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const think = createThinkFilter();
  const emit = (raw: string) => {
    const clean = think.push(raw);
    if (clean) {
      full += clean;
      onChunk(clean);
    }
  };
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full + think.flush();
      let json: unknown;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = extractDelta(settings.provider, json);
      if (delta) emit(delta);
    }
  }
  return full + think.flush();
}

/**
 * Strips <think>…</think> spans from a streamed text, across chunk boundaries.
 * Reasoning models served over OpenAI-compatible APIs (Ollama's qwen3,
 * DeepSeek-R1 distills, …) interleave their chain of thought this way; a
 * margin comment must never leak it. Anthropic thinking arrives as separate
 * thinking_delta events, which extractDelta already ignores.
 */
function createThinkFilter(): { push: (chunk: string) => string; flush: () => string } {
  let inThink = false;
  let carry = '';
  const OPEN = '<think>';
  const CLOSE = '</think>';

  const partialSuffix = (text: string, tag: string): number => {
    for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
      if (text.endsWith(tag.slice(0, n))) return n;
    }
    return 0;
  };

  return {
    push(chunk: string): string {
      let text = carry + chunk;
      carry = '';
      let out = '';
      while (text.length > 0) {
        if (inThink) {
          const end = text.indexOf(CLOSE);
          if (end === -1) {
            const keep = partialSuffix(text, CLOSE);
            carry = keep > 0 ? text.slice(-keep) : '';
            text = '';
          } else {
            inThink = false;
            text = text.slice(end + CLOSE.length);
            // drop whitespace the model left after its reasoning block
            if (out === '') text = text.replace(/^\s+/, '');
          }
        } else {
          const start = text.indexOf(OPEN);
          if (start === -1) {
            const keep = partialSuffix(text, OPEN);
            out += keep > 0 ? text.slice(0, -keep) : text;
            carry = keep > 0 ? text.slice(-keep) : '';
            text = '';
          } else {
            out += text.slice(0, start);
            inThink = true;
            text = text.slice(start + OPEN.length);
          }
        }
      }
      return out;
    },
    flush(): string {
      const rest = inThink ? '' : carry;
      carry = '';
      return rest;
    },
  };
}

/** One-shot non-streaming completion; used by the settings "test connection" button. */
export async function testCompletion(): Promise<string> {
  const settings = await getSettings();
  const { url, headers, body } = buildRequest(
    settings,
    { system: 'You are a connectivity test.', user: 'Reply with the single word: ready', maxTokens: 10 },
    false,
  );
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`${res.status}: ${detail}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  if (settings.provider === 'anthropic') {
    const content = json.content as { type: string; text?: string }[] | undefined;
    return content?.find((b) => b.type === 'text')?.text ?? '(empty)';
  }
  const choices = json.choices as { message?: { content?: string } }[] | undefined;
  return choices?.[0]?.message?.content ?? '(empty)';
}

function isCloudUrl(baseUrl: string): boolean {
  return !/localhost|127\.0\.0\.1|\[::1\]/.test(baseUrl);
}

function buildRequest(
  settings: LlmSettings,
  req: CompletionRequest,
  stream: boolean,
): { url: string; headers: Record<string, string>; body: unknown } {
  const base = settings.baseUrl.replace(/\/+$/, '');
  if (settings.provider === 'anthropic') {
    return {
      url: `${base}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for direct-from-extension calls.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: settings.model,
        max_tokens: req.maxTokens ?? 700,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        stream,
      },
    };
  }
  return {
    url: `${base}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: {
      model: settings.model,
      max_tokens: req.maxTokens ?? 700,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      stream,
    },
  };
}

function extractDelta(provider: LlmSettings['provider'], json: unknown): string {
  const obj = json as Record<string, any>;
  if (provider === 'anthropic') {
    if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
      return obj.delta.text ?? '';
    }
    return '';
  }
  return obj.choices?.[0]?.delta?.content ?? '';
}
