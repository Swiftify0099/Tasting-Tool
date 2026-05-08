import { useRef, useState, useCallback } from 'react';
import {
  Brain, Play, Square, Globe, Key, ChevronDown, RefreshCw,
  CheckCircle, XCircle, Clock, Zap, Eye, EyeOff, AlertTriangle,
  Cpu, FlaskConical, Maximize2, Minimize2,
} from 'lucide-react';

const MODELS = [
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (Latest)' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
];

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  valid:          { label: 'Valid',         color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  boundary_empty: { label: 'Empty Fields',  color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/30'   },
  boundary_min:   { label: 'Min Values',    color: 'text-sky-400',     bg: 'bg-sky-500/15 border-sky-500/30'       },
  boundary_max:   { label: 'Max Values',    color: 'text-violet-400',  bg: 'bg-violet-500/15 border-violet-500/30' },
  invalid:        { label: 'Invalid Data',  color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30'       },
};

interface LogEntry { time: string; message: string; level: string; }
interface TestScenario { index: number; name: string; type: string; description?: string; status: 'pending' | 'running' | 'passed' | 'failed'; error?: string; }

function normalizeUrl(raw: string): string {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

export default function AILiveTesterPage() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imgRef      = useRef(new Image());
  const sseRef      = useRef<XMLHttpRequest | null>(null);
  const logEndRef   = useRef<HTMLDivElement>(null);

  const [url, setUrl]             = useState('');
  const [apiKey, setApiKey]       = useState(() => localStorage.getItem('ai_api_key') ?? '');
  const [model, setModel]         = useState(MODELS[0].id);
  const [showKey, setShowKey]     = useState(false);
  const [showModel, setShowModel] = useState(false);

  const [running, setRunning]     = useState(false);
  const [hasFrame, setHasFrame]   = useState(false);
  const [expandBrowser, setExpandBrowser] = useState(false);

  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [domSummary, setDomSummary] = useState<{ inputs: number; selects: number; textareas: number; buttons: number } | null>(null);
  const [result, setResult]       = useState<{ passed: number; failed: number; total: number; error?: string } | null>(null);

  const pushLog = useCallback((message: string, level = 'info') => {
    const entry: LogEntry = { time: new Date().toLocaleTimeString(), message, level };
    setLogs(prev => {
      const next = [...prev, entry];
      setTimeout(() => logEndRef.current?.scrollTo({ top: logEndRef.current.scrollHeight, behavior: 'smooth' }), 30);
      return next;
    });
  }, []);

  const drawFrame = useCallback((b64: string) => {
    const img = imgRef.current;
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.getContext('2d')?.drawImage(img, 0, 0, 1280, 720);
      setHasFrame(true);
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  }, []);

  const handleRun = () => {
    const targetUrl = normalizeUrl(url.trim());
    if (!targetUrl) { pushLog('Enter a URL first', 'error'); return; }
    if (!apiKey.trim()) { pushLog('Enter your Anthropic API key', 'error'); return; }

    localStorage.setItem('ai_api_key', apiKey);

    setLogs([]);
    setScenarios([]);
    setDomSummary(null);
    setResult(null);
    setHasFrame(false);
    setRunning(true);
    const c = canvasRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, 1280, 720);

    const xhr = new XMLHttpRequest();
    sseRef.current = xhr;
    xhr.open('POST', '/api/ai-live-test', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let buffer = '';

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(buffer.length);
      buffer = xhr.responseText;

      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const { type, payload } = JSON.parse(line.slice(6));
          if (type === 'FRAME') {
            drawFrame(payload.frameBase64);
          } else if (type === 'LOG') {
            pushLog(payload.message, payload.level);
          } else if (type === 'TEST_PLAN') {
            setScenarios(payload.tests.map((t: TestScenario) => ({ ...t, status: 'pending' })));
          } else if (type === 'TEST_STATUS') {
            setScenarios(prev => prev.map(s =>
              s.index === payload.index ? { ...s, status: payload.status, error: payload.error } : s
            ));
          } else if (type === 'DOM_SUMMARY') {
            setDomSummary(payload);
          } else if (type === 'COMPLETE') {
            setResult(payload);
            setRunning(false);
          }
        } catch (_) {}
      }
    };

    xhr.onload = xhr.onerror = () => setRunning(false);

    xhr.send(JSON.stringify({ url: targetUrl, apiKey: apiKey.trim(), model }));
  };

  const handleStop = () => {
    sseRef.current?.abort();
    setRunning(false);
    pushLog('⏹ Stopped by user', 'error');
  };

  const logColor: Record<string, string> = {
    info: 'text-slate-400', success: 'text-emerald-400',
    error: 'text-red-400', step: 'text-indigo-300', warn: 'text-amber-400',
  };
  const logPfx: Record<string, string> = {
    info: '·', success: '✓', error: '✗', step: '▶', warn: '⚠',
  };

  const totalPassed  = scenarios.filter(s => s.status === 'passed').length;
  const totalFailed  = scenarios.filter(s => s.status === 'failed').length;
  const totalRunning = scenarios.filter(s => s.status === 'running').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="page-header flex-shrink-0 !py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Brain className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              AI Live Tester
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">Claude</span>
            </h1>
            <p className="text-xs text-slate-500">Auto-analyze &amp; test any webpage with Claude AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <button onClick={handleStop} className="btn-danger text-xs">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={running}
            className={`btn-primary ${running ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {running
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Testing…</>
              : <><Zap className="w-4 h-4" /> Run AI Test</>}
          </button>
        </div>
      </div>

      {/* Config bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-surface-900/40 flex-shrink-0 flex-wrap">
        {/* URL */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Globe className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !running && handleRun()}
            placeholder="https://example.com/login"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none font-mono"
          />
        </div>

        <div className="w-px h-4 bg-slate-700" />

        {/* API Key */}
        <div className="flex items-center gap-2 min-w-[180px]">
          <Key className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-…  Anthropic key"
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-600 outline-none font-mono w-40"
          />
          <button onClick={() => setShowKey(v => !v)} className="text-slate-600 hover:text-slate-400">
            {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>

        <div className="w-px h-4 bg-slate-700" />

        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setShowModel(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white"
          >
            <Cpu className="w-3.5 h-3.5 text-violet-400" />
            {MODELS.find(m => m.id === model)?.label ?? model}
            <ChevronDown className="w-3 h-3 text-slate-600" />
          </button>
          {showModel && (
            <div className="absolute top-full mt-1 right-0 z-50 bg-surface-800 border border-slate-700 rounded-lg shadow-xl py-1 w-60">
              {MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id); setShowModel(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 transition-colors ${model === m.id ? 'text-violet-400' : 'text-slate-300'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DOM summary chips */}
        {domSummary && (
          <>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-2 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">{domSummary.inputs} inputs</span>
              <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/20">{domSummary.selects} selects</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{domSummary.buttons} btns</span>
            </div>
          </>
        )}
      </div>

      {/* Main body */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* Left — Log + Scenarios */}
        {!expandBrowser && (
          <div className="flex flex-col w-[42%] border-r border-slate-800 min-h-0">

            {/* Scenario list */}
            {scenarios.length > 0 && (
              <div className="flex-shrink-0 border-b border-slate-800 bg-surface-900/30">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800/50">
                  <FlaskConical className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Scenarios</span>
                  <div className="ml-auto flex items-center gap-2 text-[10px]">
                    {totalPassed > 0  && <span className="text-emerald-400">{totalPassed} ✓</span>}
                    {totalFailed > 0  && <span className="text-red-400">{totalFailed} ✗</span>}
                    {totalRunning > 0 && <span className="text-amber-400 animate-pulse">{totalRunning} ↻</span>}
                  </div>
                </div>
                <div className="px-2 py-1.5 space-y-1 max-h-[180px] overflow-y-auto">
                  {scenarios.map(s => {
                    const meta = TYPE_META[s.type] ?? { label: s.type, color: 'text-slate-400', bg: 'bg-slate-700/30 border-slate-700' };
                    return (
                      <div key={s.index}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all duration-300 ${
                          s.status === 'running' ? 'bg-amber-500/10 border-amber-500/30' :
                          s.status === 'passed'  ? 'bg-emerald-500/10 border-emerald-500/20' :
                          s.status === 'failed'  ? 'bg-red-500/10 border-red-500/20' :
                          'bg-surface-800/50 border-slate-700/50'
                        }`}>
                        <span className="flex-shrink-0 text-sm">
                          {s.status === 'passed'  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> :
                           s.status === 'failed'  ? <XCircle className="w-3.5 h-3.5 text-red-400" /> :
                           s.status === 'running' ? <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" /> :
                           <Clock className="w-3.5 h-3.5 text-slate-600" />}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${meta.bg} ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className={`flex-1 text-xs truncate ${s.status === 'running' ? 'text-white font-medium' : 'text-slate-400'}`}>
                          {s.name}
                        </span>
                        {s.status === 'failed' && s.error && (
                          <span className="text-[10px] text-red-400 truncate max-w-[100px]" title={s.error}>
                            {s.error.slice(0, 30)}…
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Result banner */}
            {result && (
              <div className={`flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 text-sm font-semibold ${
                result.error ? 'bg-red-500/10 text-red-400' :
                result.failed === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
              }`}>
                {result.error
                  ? <><AlertTriangle className="w-4 h-4" /> Error: {result.error.slice(0, 80)}</>
                  : result.failed === 0
                    ? <><CheckCircle className="w-4 h-4" /> All {result.total} scenarios passed!</>
                    : <><AlertTriangle className="w-4 h-4" /> {result.passed} passed · {result.failed} failed of {result.total}</>}
              </div>
            )}

            {/* Terminal */}
            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-800 bg-surface-900/40 flex-shrink-0">
              <span className="text-[11px] font-mono text-slate-600">$</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Log</span>
              {running && <span className="ml-auto flex items-center gap-1.5 text-[10px] text-violet-400">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />LIVE
              </span>}
            </div>

            <div
              ref={logEndRef}
              className="flex-1 overflow-y-auto font-mono text-[11px] p-3 space-y-0.5 bg-[#070b10]"
            >
              {logs.length === 0 && !running && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-700 py-12 gap-3">
                  <Brain className="w-10 h-10 opacity-30" />
                  <div>
                    <p className="text-xs font-medium text-slate-600">Enter a URL &amp; API key, then click Run AI Test</p>
                    <p className="text-[11px] text-slate-700 mt-1">Claude will analyze the page, generate test scenarios,<br />and execute them live in a real browser.</p>
                  </div>
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className={`flex gap-2 leading-relaxed ${logColor[log.level] ?? 'text-slate-400'} ${log.message.startsWith('\n') ? 'mt-2' : ''}`}>
                  <span className="flex-shrink-0 opacity-50 w-3 text-center">{logPfx[log.level] ?? '·'}</span>
                  <span className="opacity-40 flex-shrink-0">{log.time}</span>
                  <span className="break-all whitespace-pre-wrap">{log.message.replace(/^\n/, '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right — Live browser */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#070b10]">
          {/* Browser toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-surface-900/50 flex-shrink-0">
            <div className="flex gap-1 flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
            </div>
            <div className="flex-1 mx-2 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-500 truncate">
              {url ? normalizeUrl(url) : 'about:blank'}
            </div>
            {running && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
            <button onClick={() => setExpandBrowser(v => !v)} className="btn-icon flex-shrink-0">
              {expandBrowser ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'auto' }}
            />

            {/* Idle overlay */}
            {!hasFrame && !running && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center pointer-events-none">
                <div className="absolute inset-0 opacity-[0.03]"
                  style={{ backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <Brain className="w-8 h-8 text-violet-400/60" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Browser Preview</p>
                    <p className="text-xs text-slate-700 mt-0.5">Live frames will appear here during testing</p>
                  </div>
                </div>
              </div>
            )}

            {/* Launching overlay */}
            {running && !hasFrame && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#070b10]/90">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
                  <div className="relative w-16 h-16 rounded-full bg-violet-500/15 border-2 border-violet-500/40 flex items-center justify-center">
                    <RefreshCw className="w-7 h-7 text-violet-400 animate-spin" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Launching browser…</p>
                  <p className="text-xs text-slate-600 mt-1">Claude is analyzing the page</p>
                </div>
              </div>
            )}

            {/* Running status overlay (corner) */}
            {running && hasFrame && (
              <div className="absolute top-2 right-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-violet-600/90 backdrop-blur-sm border border-violet-500/50 shadow-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-bold text-white tracking-wider uppercase">AI Testing</span>
              </div>
            )}

            {/* Done overlay (corner) */}
            {!running && result && hasFrame && (
              <div className={`absolute top-2 right-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg ${
                result.failed === 0 ? 'bg-emerald-600/90 border-emerald-500/50' : 'bg-amber-600/90 border-amber-500/50'
              }`}>
                {result.failed === 0
                  ? <><CheckCircle className="w-3.5 h-3.5 text-white" /><span className="text-[10px] font-bold text-white">{result.passed}/{result.total} Passed</span></>
                  : <><AlertTriangle className="w-3.5 h-3.5 text-white" /><span className="text-[10px] font-bold text-white">{result.failed} Failed</span></>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
