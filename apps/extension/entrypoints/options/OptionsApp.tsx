import { useEffect, useState } from 'react';
import { Diamond } from 'lucide-react';
import type { LlmProvider, LlmSettings } from '@vitrum/model';
import { DEFAULT_LLM_SETTINGS } from '@vitrum/model';
import { send } from '@/lib/messages';

const PROVIDER_PRESETS: Record<LlmProvider, { baseUrl: string; models: string[]; keyHint: string }> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
    keyHint: 'sk-ant-…',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4.1', 'gpt-4.1-mini'],
    keyHint: 'sk-… (leave empty for local servers)',
  },
};

export function OptionsApp() {
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err' | 'busy'; text: string }>({
    kind: 'idle',
    text: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void send('settings:get', {}).then(setSettings);
  }, []);

  function update(patch: Partial<LlmSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  }

  function switchProvider(provider: LlmProvider) {
    const preset = PROVIDER_PRESETS[provider];
    update({ provider, baseUrl: preset.baseUrl, model: preset.models[0]! });
  }

  async function save() {
    await send('settings:set', { settings });
    setSaved(true);
  }

  async function test() {
    setStatus({ kind: 'busy', text: 'Testing…' });
    await send('settings:set', { settings });
    setSaved(true);
    const result = await send('llm:test', {});
    setStatus(
      result.ok
        ? { kind: 'ok', text: `Connected — model replied: “${result.detail.trim()}”` }
        : { kind: 'err', text: result.detail },
    );
  }

  const preset = PROVIDER_PRESETS[settings.provider];

  return (
    <div className="wrap">
      <header>
        <h1>
          <Diamond size={20} className="glyph" /> Vitrum
        </h1>
        <p className="sub">
          Agents run on your own key, straight from this browser to the API you choose. Nothing is stored
          anywhere except on this device.
        </p>
      </header>

      <section className="card">
        <h2>Model provider</h2>

        <label className="field">
          <span>Provider</span>
          <div className="seg">
            {(['anthropic', 'openai'] as const).map((p) => (
              <button
                key={p}
                className={settings.provider === p ? 'on' : ''}
                onClick={() => switchProvider(p)}
              >
                {p === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Base URL</span>
          <input
            value={settings.baseUrl}
            placeholder={preset.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
          />
          {settings.provider === 'openai' && (
            <em className="hint">
              Works with any OpenAI-compatible server — e.g. Ollama at <code>http://localhost:11434/v1</code> for a
              fully offline demo.
            </em>
          )}
        </label>

        <label className="field">
          <span>API key</span>
          <input
            type="password"
            value={settings.apiKey}
            placeholder={preset.keyHint}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Model</span>
          <input
            value={settings.model}
            list="models"
            onChange={(e) => update({ model: e.target.value })}
          />
          <datalist id="models">
            {preset.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <div className="actions">
          <button className="primary" onClick={() => void save()}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
          <button onClick={() => void test()} disabled={status.kind === 'busy'}>
            Test connection
          </button>
        </div>

        {status.kind !== 'idle' && <div className={`status ${status.kind}`}>{status.text}</div>}
      </section>

      <section className="card">
        <h2>Your agents</h2>
        <ul className="agents">
          <li>
            <b>@skeptic</b> — stress-tests claims and arguments on the page.
          </li>
          <li>
            <b>@librarian</b> — connects what you're reading to what you've saved.
          </li>
          <li>
            <b>@eli5</b> — explains the highlighted passage simply.
          </li>
        </ul>
        <p className="hint">
          Mention any of them in a comment — e.g. <code>@skeptic check this claim</code> — and they reply in the
          thread, anchored to the same spot on the page. Agents can pull each other in when it genuinely helps.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.autoLibrarian}
            onChange={(e) => update({ autoLibrarian: e.target.checked })}
          />
          <span>
            <b>@librarian reacts to your saves.</b> When you save a passage that genuinely connects to something
            already in your library, the librarian comments on it unprompted. (Remember to Save above.)
          </span>
        </label>
      </section>
    </div>
  );
}
