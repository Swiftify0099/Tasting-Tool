// AI Service — supports OpenRouter, DeepSeek, Claude, OpenAI
// Generates Playwright test code from natural language descriptions

export type AIProvider = 'openrouter' | 'openai' | 'deepseek' | 'anthropic';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIGenerateRequest {
  description: string;
  baseUrl?: string;
  existingSteps?: string;
  outputFormat: 'playwright-ts' | 'flow-json' | 'steps-list';
}

export interface AIGenerateResult {
  code: string;
  model: string;
  tokens?: number;
  durationMs: number;
  error?: string;
}

// ── Provider configs ───────────────────────────────────────
const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai:     'https://api.openai.com/v1/chat/completions',
  deepseek:   'https://api.deepseek.com/chat/completions',
  anthropic:  'https://api.anthropic.com/v1/messages',
};

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openrouter: [
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.5-sonnet:beta',
    'anthropic/claude-3-5-sonnet-20241022',
    'anthropic/claude-3-haiku',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'deepseek/deepseek-chat',
    'google/gemini-2.0-flash-001',
    'google/gemini-2.0-pro-exp-02-05:free',
    'meta-llama/llama-3.1-70b-instruct',
  ],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  deepseek:  ['deepseek-chat', 'deepseek-reasoner'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
};

// ── System prompt ──────────────────────────────────────────
function buildSystemPrompt(outputFormat: AIGenerateRequest['outputFormat']): string {
  if (outputFormat === 'playwright-ts') {
    return `You are an expert Playwright test automation engineer.
Generate production-ready TypeScript Playwright test code based on the user's description.
Rules:
- Use @playwright/test imports
- Use async/await
- Add meaningful comments for each step
- Use data-testid selectors when possible, fallback to role/label/css
- Include proper assertions (expect) after key actions
- Handle waits explicitly (waitForSelector, waitForLoadState)
- Return ONLY the TypeScript code block, no explanations
- Wrap code in \`\`\`typescript ... \`\`\` block`;
  }

  if (outputFormat === 'steps-list') {
    return `You are a Playwright test automation expert.
Convert the user description into a numbered list of test steps.
Each step must be in this exact JSON format (one per line inside a JSON array):
[
  { "action": "visit", "label": "...", "url": "...", "selector": "", "value": "" },
  { "action": "click", "label": "...", "selector": "#id", "value": "" },
  { "action": "fill", "label": "...", "selector": "#input", "value": "test@email.com" },
  { "action": "assert", "label": "...", "assertType": "text", "assertSelector": "h1", "assertExpected": "Welcome" }
]
Valid actions: visit, click, fill, select, upload, wait, assert, popup, hover, dblclick, rightclick, check, uncheck, focus, blur, press, type, clear, drag, scroll, screenshot, evaluate, frame, newpage, closepage, reload, goback, goforward, setviewport, cookie, localstorage, networkrequest, mockresponse
Return ONLY the JSON array, no extra text.`;
  }

  return `You are a Playwright test expert. Generate test flow JSON.`;
}

// ── Main generate function ─────────────────────────────────
export async function generateWithAI(
  config: AIConfig,
  request: AIGenerateRequest
): Promise<AIGenerateResult> {
  const start = Date.now();

  const userMessage = `${request.description}${
    request.baseUrl ? `\n\nBase URL: ${request.baseUrl}` : ''
  }${
    request.existingSteps ? `\n\nExisting steps context:\n${request.existingSteps}` : ''
  }`;

  try {
    let result: AIGenerateResult;

    if (config.provider === 'anthropic') {
      result = await callAnthropic(config, buildSystemPrompt(request.outputFormat), userMessage);
    } else {
      result = await callOpenAICompatible(config, buildSystemPrompt(request.outputFormat), userMessage);
    }

    result.durationMs = Date.now() - start;
    return result;
  } catch (err) {
    return {
      code: '',
      model: config.model,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── OpenAI-compatible (OpenRouter, OpenAI, DeepSeek) ──────
async function callOpenAICompatible(
  config: AIConfig,
  systemPrompt: string,
  userMessage: string
): Promise<AIGenerateResult> {
  const endpoint = config.baseUrl ?? PROVIDER_ENDPOINTS[config.provider];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  // OpenRouter extras
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://playwright-test-builder.dev';
    headers['X-Title'] = 'Playwright Test Builder';
  }

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
    temperature: config.temperature ?? 0.3,
    max_tokens:  config.maxTokens  ?? 4096,
  };

  const response = await fetch(endpoint, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${config.provider} API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[];
    usage?: { total_tokens?: number };
  };

  const raw = data.choices?.[0]?.message?.content ?? '';
  return {
    code:     extractCode(raw),
    model:    config.model,
    tokens:   data.usage?.total_tokens,
    durationMs: 0,
  };
}

// ── Anthropic Claude ───────────────────────────────────────
async function callAnthropic(
  config: AIConfig,
  systemPrompt: string,
  userMessage: string
): Promise<AIGenerateResult> {
  const response = await fetch(PROVIDER_ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':          config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      config.model,
      max_tokens: config.maxTokens ?? 4096,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    content: { text: string }[];
    usage?: { output_tokens?: number };
  };

  const raw = data.content?.[0]?.text ?? '';
  return {
    code:     extractCode(raw),
    model:    config.model,
    tokens:   data.usage?.output_tokens,
    durationMs: 0,
  };
}

// ── Helpers ────────────────────────────────────────────────
function extractCode(raw: string): string {
  // Extract from markdown code fence if present
  const tsMatch = raw.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
  if (tsMatch) return tsMatch[1].trim();

  // Try JSON array
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) return jsonMatch[0].trim();

  return raw.trim();
}

// ── Parse steps from AI JSON response ─────────────────────
export function parseAISteps(jsonText: string): Partial<import('../types').TestStep>[] {
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return parsed.map((s, i) => ({
        id: `ai_step_${Date.now()}_${i}`,
        action: s.action ?? 'click',
        label: s.label ?? s.action ?? `Step ${i + 1}`,
        selector: s.selector ?? '',
        value: s.value ?? '',
        url: s.url ?? '',
        assertType: s.assertType,
        assertSelector: s.assertSelector,
        assertExpected: s.assertExpected,
        enabled: true,
        comment: s.comment ?? 'AI generated',
      }));
    }
  } catch { /* fall through */ }
  return [];
}
