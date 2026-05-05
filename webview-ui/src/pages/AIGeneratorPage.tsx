import { useState, useRef } from 'react';
import { useFlow } from '../context/FlowContext';
import { useNavigate } from 'react-router-dom';
import {
  generateWithAI, parseAISteps, AIProvider, AIConfig, PROVIDER_MODELS
} from '../services/aiService';
import {
  Sparkles, Send, Copy, Check, Zap, RefreshCw, ChevronDown,
  Settings, ArrowRight, Code2, Layers, AlertTriangle, Info
} from 'lucide-react';

interface LogEntry { time: string; message: string; type: 'info'|'success'|'error'|'ai'; }

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openrouter: '🔀 OpenRouter',
  openai:     '🤖 OpenAI',
  deepseek:   '🌊 DeepSeek',
  anthropic:  '🧠 Claude (Anthropic)',
};

const EXAMPLE_PROMPTS = [
  'Login to the website with email "test@example.com" and password "pass123", then verify the dashboard loads',
  'Search for "laptop" on an e-commerce site, filter by price under $1000, and assert at least 5 results appear',
  'Fill out a registration form with boundary values for email, password and phone fields',
  'Navigate to the checkout page, add a coupon code "SAVE10", and verify the discount is applied',
  'Test the popup/modal: click the "Subscribe" button, fill the newsletter form, and assert confirmation message',
];

export default function AIGeneratorPage() {
  const { state, importSteps, updateFlow, showToast } = useFlow();
  const navigate = useNavigate();

  // AI Config state
  const [provider, setProvider]   = useState<AIProvider>('openrouter');
  const [apiKey, setApiKey]       = useState(localStorage.getItem('ai_api_key') ?? '');
  const [model, setModel]         = useState(PROVIDER_MODELS['openrouter'][0]);
  const [outputFmt, setOutputFmt] = useState<'playwright-ts'|'steps-list'>('steps-list');

  // Request state
  const [prompt, setPrompt]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState('');
  const [copied, setCopied]       = useState(false);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry = { time: new Date().toLocaleTimeString(), message, type };
    setLogs(prev => {
      const next = [...prev, entry];
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
      return next;
    });
  };

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    setModel(PROVIDER_MODELS[p][0]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) { showToast('Enter a description first', 'error'); return; }
    if (!apiKey.trim()) { showToast('Enter your API key in the form', 'error'); return; }

    setLoading(true);
    setResult('');
    setLogs([]);

    addLog(`Provider: ${PROVIDER_LABELS[provider]}`, 'ai');
    addLog(`Model: ${model}`, 'ai');
    addLog(`Output: ${outputFmt === 'playwright-ts' ? 'TypeScript code' : 'Step list → Canvas'}`, 'ai');
    addLog('Sending request to AI…', 'info');

    localStorage.setItem('ai_api_key', apiKey);

    const config: AIConfig = { provider, apiKey, model, temperature: 0.3, maxTokens: 4096 };

    const existingSteps = state.currentFlow.steps.length > 0
      ? state.currentFlow.steps.map(s => `${s.action}: ${s.label}`).join('\n')
      : undefined;

    const res = await generateWithAI(config, {
      description: prompt,
      baseUrl: state.currentFlow.baseUrl,
      existingSteps,
      outputFormat: outputFmt,
    });

    setLoading(false);

    if (res.error) {
      addLog(`❌ Error: ${res.error}`, 'error');
      showToast('AI generation failed', 'error');
      return;
    }

    addLog(`✓ Response received in ${(res.durationMs / 1000).toFixed(1)}s`, 'success');
    if (res.tokens) addLog(`Tokens used: ${res.tokens}`, 'info');
    setResult(res.code);

    if (outputFmt === 'steps-list') {
      const steps = parseAISteps(res.code);
      if (steps.length > 0) {
        addLog(`Parsed ${steps.length} step(s) from AI response`, 'success');
        steps.forEach((s, i) => addLog(`  [${i+1}] ${s.action}: ${s.label}`, 'ai'));
        importSteps(steps);
        addLog('✅ Steps added to canvas!', 'success');
        showToast(`${steps.length} steps added to canvas`, 'success');
      } else {
        addLog('⚠️ Could not parse steps from response. Check raw output.', 'error');
      }
    } else {
      addLog('✅ TypeScript code generated. Copy or navigate to Generator page.', 'success');
      showToast('Code generated!', 'success');
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const logColors: Record<LogEntry['type'], string> = {
    info: 'text-slate-400', success: 'text-success',
    error: 'text-danger',   ai: 'text-brand-300',
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="page-header flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center animate-pulse-glow">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">AI Script Generator</h1>
            <p className="text-xs text-slate-500">Natural language → Playwright tests via OpenRouter / DeepSeek / Claude / OpenAI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button className="btn-ghost text-xs" onClick={() => navigate('/generator')}>
              <Code2 className="w-3.5 h-3.5" /> View Code <ArrowRight className="w-3 h-3" />
            </button>
          )}
          <button className="btn-ghost text-xs" onClick={() => navigate('/builder')}>
            <Layers className="w-3.5 h-3.5" /> Builder
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex gap-0">
        {/* Left: Config + Input */}
        <div className="w-[360px] flex-shrink-0 flex flex-col border-r border-slate-800 overflow-y-auto p-4 space-y-4">

          {/* Provider + Model */}
          <div className="card p-4 space-y-3">
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" /> AI Provider
            </div>

            <div>
              <label className="label">Provider</label>
              <select className="select" value={provider}
                onChange={e => handleProviderChange(e.target.value as AIProvider)}>
                {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map(p => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Model</label>
              <select className="select" value={model} onChange={e => setModel(e.target.value)}>
                {PROVIDER_MODELS[provider].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">API Key</label>
              <input
                type="password"
                className="input-sm font-mono"
                placeholder={`${provider === 'openrouter' ? 'sk-or-...' : provider === 'deepseek' ? 'sk-...' : provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}`}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <p className="text-[10px] text-slate-600 mt-1">Stored locally in browser only. Never sent anywhere except the AI provider.</p>
            </div>
          </div>

          {/* Output format */}
          <div className="card p-4 space-y-3">
            <div className="text-xs font-semibold text-white">Output Format</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'steps-list', label: '🧩 Add to Canvas', desc: 'Steps imported directly' },
                { val: 'playwright-ts', label: '📄 TypeScript Code', desc: 'Full spec file' },
              ].map(opt => (
                <button key={opt.val}
                  onClick={() => setOutputFmt(opt.val as 'playwright-ts'|'steps-list')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    outputFmt === opt.val
                      ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                      : 'bg-surface-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <div className="text-xs font-medium">{opt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Example prompts */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Example prompts</div>
            {EXAMPLE_PROMPTS.map((p, i) => (
              <button key={i}
                className="w-full text-left text-xs text-slate-400 hover:text-brand-300 hover:bg-brand-950/40 px-3 py-2 rounded-lg border border-slate-800 hover:border-brand-500/40 transition-all"
                onClick={() => setPrompt(p)}>
                {p.length > 80 ? p.slice(0, 80) + '…' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Prompt + Output + Logs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Prompt input */}
          <div className="p-4 border-b border-slate-800 flex-shrink-0 space-y-3">
            <div>
              <label className="label">Describe your test scenario</label>
              <textarea
                className="textarea h-28 text-sm"
                placeholder="e.g. Login with valid credentials, verify dashboard loads, check profile menu shows user name, then logout…"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') handleGenerate(); }}
              />
              <p className="text-[10px] text-slate-600 mt-1">
                Ctrl+Enter to generate · Base URL: <span className="text-brand-400">{state.currentFlow.baseUrl || 'not set'}</span>
              </p>
            </div>
            <button
              className={`btn-primary w-full justify-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin-slow" /> Generating with AI…</>
                : <><Sparkles className="w-4 h-4" /> Generate Playwright Test</>
              }
            </button>
          </div>

          {/* Logs */}
          {logs.length > 0 && (
            <div ref={logRef} className="flex-shrink-0 max-h-32 overflow-y-auto bg-surface-950 border-b border-slate-800 p-3 space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className={`flex items-start gap-2 text-[11px] font-mono ${logColors[log.type]}`}>
                  <span className="text-slate-700 flex-shrink-0">{log.time}</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Result */}
          <div className="flex-1 overflow-auto">
            {!result && !loading ? (
              <div className="empty-state h-full">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-purple-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">AI Ready</p>
                  <p className="text-slate-500 text-sm mt-1">Describe your test and click Generate</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 px-6 text-center">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>"Add to Canvas" mode imports steps directly into the Builder. "TypeScript Code" gives you the full spec file.</span>
                </div>
              </div>
            ) : result ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 flex-shrink-0">
                  <span className="text-xs text-slate-400">
                    {outputFmt === 'steps-list' ? 'JSON Steps' : 'TypeScript'} · {result.split('\n').length} lines
                  </span>
                  <div className="flex items-center gap-2">
                    {outputFmt === 'steps-list' && (
                      <button className="btn-ghost text-xs" onClick={() => navigate('/builder')}>
                        <Layers className="w-3.5 h-3.5" /> View in Builder
                      </button>
                    )}
                    <button className="btn-ghost text-xs" onClick={handleCopy}>
                      {copied ? <><Check className="w-3.5 h-3.5 text-success" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto bg-surface-950 p-4 font-mono text-xs text-slate-300 whitespace-pre">
                  {result}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
