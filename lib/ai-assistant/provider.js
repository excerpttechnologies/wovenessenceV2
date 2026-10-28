/* AI provider abstraction.

   The assistant must not depend on one vendor, and no credential may ever
   reach the browser. Everything below reads configuration from the server
   environment only:

     AI_PROVIDER   openai | anthropic | gemini   (default: openai when a key is set)
     AI_API_KEY    the provider key             (never returned to a client)
     AI_MODEL      model id                     (provider default if unset)
     AI_BASE_URL   optional, for an OpenAI-compatible gateway (OpenRouter,
                   Groq, Together, Azure deployment URL, a local model server)
     AI_TIMEOUT_MS request timeout, default 25000

   With no key, isConfigured() is false and the orchestrator answers from its
   deterministic layer. That is a supported mode, not an error: every figure
   still comes from the tools, only the prose is written by templates.

   Requests time out, retry once on a transient failure, and never log the
   key or the full provider response.
   ========================================================================== */

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-1.5-flash',
};

const DEFAULT_BASE = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

function env() {
  const provider = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  const apiKey = String(process.env.AI_API_KEY || '').trim();
  const resolved = provider || (apiKey ? 'openai' : '');
  const known = ['openai', 'anthropic', 'gemini'].includes(resolved);
  const model = String(process.env.AI_MODEL || '').trim() || DEFAULT_MODELS[resolved] || '';
  const baseUrl = String(process.env.AI_BASE_URL || '').trim() || DEFAULT_BASE[resolved] || '';
  const timeoutMs = Math.max(3000, Math.min(60000, Number(process.env.AI_TIMEOUT_MS) || 25000));
  return { provider: resolved, known, apiKey, model, baseUrl, timeoutMs };
}

export function isConfigured() {
  const config = env();
  return Boolean(config.apiKey && config.known && config.model && config.baseUrl);
}

/* Safe to return to the browser: whether AI is on, which model writes the
   explanation, and why not when it is off. Never the key. */
export function describeProvider() {
  const config = env();
  if (config.apiKey && !config.known) {
    return {
      configured: false,
      provider: null,
      model: null,
      reason: 'AI_PROVIDER must be one of openai, anthropic or gemini.',
    };
  }
  if (!config.apiKey) {
    return {
      configured: false,
      provider: null,
      model: null,
      reason: 'No AI_API_KEY is set. Answers are being produced by the deterministic business-intelligence layer from the same ERP data.',
    };
  }
  return {
    configured: true,
    provider: config.provider,
    model: config.model,
    reason: '',
  };
}

function cleanError(status, body, provider) {
  const detail = body && typeof body === 'object'
    ? (body?.error?.message || body?.message || '')
    : String(body || '');
  return new Error(`${provider} request failed (${status})${detail ? ': ' + String(detail).slice(0, 300) : ''}`);
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* provider returned non-JSON */ }
    return { response, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/* One call, with a single retry on a network error or a 429/5xx. */
async function request(provider, url, options, timeoutMs) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { response, json, text } = await fetchJson(url, options, timeoutMs);
      if (response.ok) return json;
      const retryable = response.status === 429 || response.status >= 500;
      lastError = cleanError(response.status, json, provider);
      if (!retryable) throw lastError;
    } catch (err) {
      lastError = err;
      if (err?.name === 'AbortError') {
        lastError = new Error(`${provider} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
      }
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw lastError || new Error(`${provider} request failed.`);
}

function normaliseTools(tools) {
  return (tools || []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} },
  }));
}

/* ---------------------------------------------------------------- openai -- */

async function callOpenAiCompatible({ system, messages, tools, config }) {
  const body = {
    model: config.model,
    temperature: 0.1,
    max_tokens: 1200,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ],
  };
  if (tools?.length) {
    body.tools = normaliseTools(tools).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = 'auto';
  }

  const json = await request('OpenAI-compatible', `${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  }, config.timeoutMs);

  const message = json?.choices?.[0]?.message || {};
  const toolCalls = (message.tool_calls || []).map((call) => {
    let args = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
    return { id: call.id || '', name: call.function?.name || '', args };
  });

  return {
    text: typeof message.content === 'string' ? message.content.trim() : '',
    toolCalls,
    usage: json?.usage || null,
    model: json?.model || config.model,
  };
}

/* ------------------------------------------------------------- anthropic -- */

async function callAnthropic({ system, messages, tools, config }) {
  const body = {
    model: config.model,
    max_tokens: 1200,
    temperature: 0.1,
    system: system || undefined,
    messages: messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || ''),
    })),
  };
  if (tools?.length) {
    body.tools = normaliseTools(tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  const json = await request('Anthropic', `${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  }, config.timeoutMs);

  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
  const toolCalls = blocks
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({ id: block.id || '', name: block.name || '', args: block.input || {} }));

  return {
    text,
    toolCalls,
    usage: json?.usage || null,
    model: json?.model || config.model,
  };
}

/* ---------------------------------------------------------------- gemini -- */

async function callGemini({ system, messages, tools, config }) {
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content || '') }],
    })),
    generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
  };
  if (tools?.length) {
    body.tools = [{
      functionDeclarations: normaliseTools(tools).map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    }];
  }

  const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const json = await request('Gemini', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, config.timeoutMs);

  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n').trim();
  const toolCalls = parts
    .filter((part) => part.functionCall)
    .map((part, index) => ({
      id: `gemini-${index}`,
      name: part.functionCall.name || '',
      args: part.functionCall.args || {},
    }));

  return {
    text,
    toolCalls,
    usage: json?.usageMetadata || null,
    model: config.model,
  };
}

/* The one entry point the orchestrator uses. Returns null when no provider is
   configured, so the caller can answer deterministically without branching on
   provider details. */
export async function callModel({ system, messages, tools = [] }) {
  if (!isConfigured()) return null;
  const config = env();
  const args = { system, messages, tools, config };

  if (config.provider === 'anthropic') return callAnthropic(args);
  if (config.provider === 'gemini') return callGemini(args);
  return callOpenAiCompatible(args);
}
