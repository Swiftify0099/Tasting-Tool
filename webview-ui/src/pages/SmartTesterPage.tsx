import { useRef, useState, useCallback } from 'react';
import {
  FlaskConical, Play, Square, Globe, RefreshCw,
  CheckCircle, XCircle, Clock, Zap, AlertTriangle,
  Maximize2, Minimize2, ChevronRight,
} from 'lucide-react';

const TYPE_META: Record<string, { label: string; color: string; border: string; dot: string }> = {
  valid:          { label: 'Valid Data',      color: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  boundary_empty: { label: 'Empty Fields',    color: 'text-slate-400',   border: 'border-slate-600/40',   dot: 'bg-slate-500'   },
  boundary_min:   { label: 'Min Boundary',    color: 'text-sky-400',     border: 'border-sky-500/30',     dot: 'bg-sky-400'     },
  boundary_max:   { label: 'Max Boundary',    color: 'text-violet-400',  border: 'border-violet-500/30',  dot: 'bg-violet-400'  },
  invalid:        { label: 'Invalid Format',  color: 'text-red-400',     border: 'border-red-500/30',     dot: 'bg-red-400'     },
};

interface LogEntry    { time: string; message: string; level: string; }
interface Scenario    { index: number; name: string; type: string; description: string; status: 'pending'|'running'|'passed'|'failed'; error?: string; }
interface DomInfo     { inputs: number; selects: number; textareas: number; buttons: number; }

function normalizeUrl(raw: string) {
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
}

export default function SmartTesterPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef(new Image());
  const xhrRef     = useRef<XMLHttpRequest | null>(null);
  const logEndRef  = useRef<HTMLDivElement>(null);

  const [url, setUrl]           = useState('');
  const [running, setRunning]   = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [wide, setWide]         = useState(false);

  const [logs,      setLogs]      = useState<LogEntry[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [domInfo,   setDomInfo]   = useState<DomInfo | null>(null);
  const [result,    setResult]    = useState<{ passed: number; failed: number; total: number; error?: string } | null>(null);

  const pushLog = useCallback((message: string, level = 'info') => {
    setLogs(prev => {
      const next = [...prev, { time: new Date().toLocaleTimeString(), message, level }];
      setTimeout(() => logEndRef.current?.scrollTo({ top: logEndRef.current.scrollHeight }), 20);
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
    const target = normalizeUrl(url.trim());
    if (!target) { pushLog('Enter a URL first', 'error'); return; }

    setLogs([]); setScenarios([]); setDomInfo(null); setResult(null);
    setHasFrame(false); setRunning(true);
    const c = canvasRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, 1280, 720);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/smart-test', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let buf = '';
    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(buf.length);
      buf = xhr.responseText;
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const { type, payload } = JSON.parse(line.slice(6));
          if      (type === 'FRAME')       drawFrame(payload.frameBase64);
          else if (type === 'LOG')         pushLog(payload.message, payload.level);
          else if (type === 'DOM_SUMMARY') setDomInfo(payload);
          else if (type === 'TEST_PLAN')   setScenarios(payload.tests.map((t: Scenario) => ({ ...t, status: 'pending' })));
          else if (type === 'TEST_STATUS') setScenarios(prev => prev.map(s => s.index === payload.index ? { ...s, ...payload } : s));
          else if (type === 'COMPLETE')    { setResult(payload); setRunning(false); }
        } catch (_) {}
      }
    };
    xhr.onload = xhr.onerror = () => setRunning(false);
    xhr.send(JSON.stringify({ url: target }));
  };

  const handleStop = () => { xhrRef.current?.abort(); setRunning(false); pushLog('⏹ Stopped', 'error'); };

  const logStyle: Record<string, string> = {
    info: 'text-slate-400', success: 'text-emerald-400',
    error: 'text-red-400', step: 'text-indigo-300', warn: 'text-amber-400',
  };
  const logPrefix: Record<string, string> = {
    info: '·', success: '✓', error: '✗', step: '▶', warn: '⚠',
  };

  const nPassed  = scenarios.filter(s => s.status === 'passed').length;
  const nFailed  = scenarios.filter(s => s.status === 'failed').length;
  const nRunning = scenarios.filter(s => s.status === 'running').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="page-header flex-shrink-0 !py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Smart Tester
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">No API key</span>
            </h1>
            <p className="text-xs text-slate-500">Auto-detect fields · fill correct / boundary / invalid values · live preview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <button onClick={handleStop} className="btn-danger text-xs">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          <button onClick={handleRun} disabled={running}
            className={`btn-primary ${running ? 'opacity-60 cursor-not-allowed' : ''}`}>
            {running
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Testing…</>
              : <><Zap className="w-4 h-4" /> Run Smart Test</>}
          </button>
        </div>
      </div>

      {/* ── URL bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-surface-900/40 flex-shrink-0">
        <Globe className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !running && handleRun()}
          placeholder="https://example.com/login  —  paste any URL with a form"
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none font-mono"
        />
        {domInfo && (
          <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">{domInfo.inputs} inputs</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">{domInfo.selects} selects</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">{domInfo.buttons} buttons</span>
          </div>
        )}
        {result && (
          <span className={`text-xs font-semibold flex-shrink-0 ${result.failed === 0 && result.total > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {result.total > 0 ? `${result.passed}/${result.total} passed` : 'No fields found'}
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* Left panel — scenarios + log */}
        {!wide && (
          <div className="flex flex-col w-[40%] border-r border-slate-800 min-h-0">

            {/* Scenarios */}
            {scenarios.length > 0 && (
              <div className="flex-shrink-0 border-b border-slate-800">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 bg-surface-900/30">
                  <FlaskConical className="w-3 h-3 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Scenarios</span>
                  <div className="ml-auto flex items-center gap-2 text-[10px]">
                    {nPassed  > 0 && <span className="text-emerald-400 font-mono">{nPassed} ✓</span>}
                    {nFailed  > 0 && <span className="text-red-400 font-mono">{nFailed} ✗</span>}
                    {nRunning > 0 && <span className="text-amber-400 animate-pulse font-mono">{nRunning} ↻</span>}
                  </div>
                </div>

                <div className="divide-y divide-slate-800/40">
                  {scenarios.map(s => {
                    const meta = TYPE_META[s.type] ?? TYPE_META.valid;
                    const isRun  = s.status === 'running';
                    const isDone = s.status === 'passed' || s.status === 'failed';
                    return (
                      <div key={s.index} className={`flex items-center gap-2.5 px-3 py-2 transition-all duration-300 ${
                        isRun ? 'bg-amber-500/8' : isDone ? 'bg-transparent' : 'bg-transparent'
                      }`}>
                        {/* Status icon */}
                        <span className="w-4 flex-shrink-0 flex items-center justify-center">
                          {s.status === 'passed'  && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                          {s.status === 'failed'  && <XCircle     className="w-3.5 h-3.5 text-red-400" />}
                          {s.status === 'running' && <RefreshCw   className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                          {s.status === 'pending' && <Clock       className="w-3.5 h-3.5 text-slate-700" />}
                        </span>

                        {/* Type badge */}
                        <span className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-medium ${meta.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>

                        <ChevronRight className="w-3 h-3 text-slate-700 flex-shrink-0" />

                        {/* Name */}
                        <span className={`flex-1 text-xs truncate ${isRun ? 'text-white font-medium' : s.status === 'passed' ? 'text-slate-400' : 'text-slate-500'}`}>
                          {s.name}
                        </span>

                        {/* Error hint */}
                        {s.status === 'failed' && s.error && (
                          <span className="text-[10px] text-red-400 truncate max-w-[90px]" title={s.error}>
                            {s.error.slice(0, 25)}…
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Result banner */}
            {result && result.total > 0 && (
              <div className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b border-slate-800 ${
                result.error       ? 'bg-red-500/10 text-red-400' :
                result.failed === 0 ? 'bg-emerald-500/10 text-emerald-400' :
                                      'bg-amber-500/10 text-amber-400'
              }`}>
                {result.error        ? <><AlertTriangle className="w-3.5 h-3.5" /> {result.error.slice(0, 80)}</> :
                 result.failed === 0 ? <><CheckCircle   className="w-3.5 h-3.5" /> All {result.total} scenarios completed</> :
                                       <><AlertTriangle className="w-3.5 h-3.5" /> {result.passed} passed · {result.failed} failed</>}
              </div>
            )}

            {/* Log */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-surface-900/30 flex-shrink-0">
              <span className="text-[10px] font-mono text-slate-700">$</span>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Live Log</span>
              {running && <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>}
            </div>

            <div ref={logEndRef} className="flex-1 overflow-y-auto font-mono text-[11px] px-3 py-2 space-y-px bg-[#060a0f]">
              {logs.length === 0 && !running && (
                <div className="flex flex-col items-center justify-center h-full text-center py-10 gap-3">
                  <FlaskConical className="w-9 h-9 text-slate-800" />
                  <div>
                    <p className="text-xs text-slate-600 font-medium">Paste a URL above and click Run</p>
                    <p className="text-[11px] text-slate-700 mt-1 leading-relaxed">
                      Smart Tester opens a real browser,<br />
                      auto-detects form fields, and runs<br />
                      5 test scenarios — no API key needed.
                    </p>
                  </div>
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className={`flex gap-1.5 leading-snug ${logStyle[log.level] ?? 'text-slate-400'} ${log.message.startsWith('\n') ? 'mt-2' : ''}`}>
                  <span className="flex-shrink-0 opacity-40 w-3 text-center">{logPrefix[log.level] ?? '·'}</span>
                  <span className="opacity-30 flex-shrink-0 text-[10px] self-center">{log.time}</span>
                  <span className="break-all whitespace-pre-wrap">{log.message.replace(/^\n/, '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right — Live browser */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#060a0f]">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-surface-900/50 flex-shrink-0">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
            </div>
            <div className="flex-1 mx-2 px-2 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-[11px] font-mono text-slate-500 truncate">
              {url ? normalizeUrl(url) : 'about:blank'}
            </div>
            {running && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            )}
            <button onClick={() => setWide(v => !v)} className="btn-icon flex-shrink-0 p-1">
              {wide ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            <canvas ref={canvasRef} width={1280} height={720}
              className="max-w-full max-h-full object-contain" />

            {/* Idle */}
            {!hasFrame && !running && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
                <div className="absolute inset-0 opacity-[0.025]"
                  style={{ backgroundImage: 'radial-gradient(circle,#94a3b8 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="relative z-10 flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <FlaskConical className="w-7 h-7 text-emerald-500/50" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Live Browser Preview</p>
                    <p className="text-xs text-slate-700 mt-0.5">Frames stream here as the tester runs</p>
                  </div>
                  <div className="flex flex-col gap-1.5 text-[11px] text-slate-700 text-left mt-1">
                    {['Fills correct values — purple glow', 'Empty scenario — grey glow', 'Boundary / invalid — coloured glow', 'Auto-dismisses popups & overlays'].map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-slate-700" />{t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Launching */}
            {running && !hasFrame && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                  <div className="relative w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center">
                    <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Launching browser…</p>
                  <p className="text-xs text-slate-600 mt-1">Analyzing your page</p>
                </div>
              </div>
            )}

            {/* Active scenario badge */}
            {running && hasFrame && (() => {
              const active = scenarios.find(s => s.status === 'running');
              if (!active) return null;
              const meta = TYPE_META[active.type] ?? TYPE_META.valid;
              return (
                <div className={`absolute top-2 left-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg bg-surface-900/90 ${meta.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${meta.dot}`} />
                  <span className={`text-[10px] font-bold tracking-wider ${meta.color}`}>{meta.label}</span>
                  <span className="text-[10px] text-slate-400 max-w-[140px] truncate">{active.name}</span>
                </div>
              );
            })()}

            {/* Done badge */}
            {!running && result && result.total > 0 && hasFrame && (
              <div className={`absolute top-2 right-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg ${
                result.failed === 0 ? 'bg-emerald-600/90 border-emerald-500/50' : 'bg-amber-600/90 border-amber-500/50'
              }`}>
                {result.failed === 0
                  ? <><CheckCircle className="w-3.5 h-3.5 text-white" /><span className="text-[10px] font-bold text-white">{result.passed}/{result.total} Done</span></>
                  : <><AlertTriangle className="w-3.5 h-3.5 text-white" /><span className="text-[10px] font-bold text-white">{result.failed} failed</span></>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
