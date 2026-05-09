import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, Wand2, Globe, RefreshCw, CheckCircle, XCircle,
  Zap, Play, ChevronRight, MousePointer, Type, Check,
  Camera, ArrowLeft, Eye, Loader, AlertTriangle,
  ChevronsDown, Code2, ListChecks,
} from 'lucide-react';
import { TestStep } from '../types';

interface Props {
  initialUrl: string;
  onApply: (steps: TestStep[], replace: boolean) => void;
  onClose: () => void;
}

interface LogLine { time: string; message: string; kind: 'info' | 'success' | 'error' | 'step' }

const PAGE_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  login:      { label: 'Login Page',       color: 'text-blue-400' },
  signup:     { label: 'Sign-up / Register', color: 'text-violet-400' },
  search:     { label: 'Search Page',      color: 'text-amber-400' },
  contact:    { label: 'Contact Form',     color: 'text-emerald-400' },
  ecommerce:  { label: 'E-commerce',       color: 'text-pink-400' },
  dashboard:  { label: 'Dashboard',        color: 'text-cyan-400' },
  general:    { label: 'General Page',     color: 'text-slate-400' },
};

const ACTION_COLOR: Record<string, string> = {
  visit:'#38bdf8', click:'#818cf8', fill:'#a78bfa', assert:'#34d399',
  screenshot:'#fb7185', wait:'#fbbf24', check:'#34d399', select:'#f59e0b',
  scroll:'#fb923c', press:'#e879f9', goback:'#94a3b8', default:'#6366f1',
};
const ACTION_ICON: Record<string, React.ElementType> = {
  visit: Globe, click: MousePointer, fill: Type, type: Type,
  check: Check, screenshot: Camera, goback: ArrowLeft,
  scroll: ChevronsDown, evaluate: Code2, default: Zap,
};

export default function SmartBuildModal({ initialUrl, onApply, onClose }: Props) {
  const [url, setUrl]               = useState(initialUrl && initialUrl !== 'https://' ? initialUrl : '');
  const [running, setRunning]       = useState(false);
  const [done, setDone]             = useState(false);
  const [error, setError]           = useState('');
  const [logs, setLogs]             = useState<LogLine[]>([]);
  const [steps, setSteps]           = useState<TestStep[]>([]);
  const [hasFrame, setHasFrame]     = useState(false);
  const [pageType, setPageType]     = useState('');
  const [pageTitle, setPageTitle]   = useState('');
  const [elemCounts, setElemCounts] = useState<any>(null);
  const [replace, setReplace]       = useState(true);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef(new Image());
  const xhrRef     = useRef<XMLHttpRequest | null>(null);
  const logEndRef  = useRef<HTMLDivElement>(null);

  const pushLog = useCallback((message: string, kind: LogLine['kind'] = 'info') => {
    setLogs(prev => {
      const next = [...prev, { time: new Date().toLocaleTimeString(), message, kind }];
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
    const trimmed = url.trim();
    if (!trimmed) return;
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
    setUrl(withProtocol);
    setRunning(true);
    setDone(false);
    setError('');
    setLogs([]);
    setSteps([]);
    setHasFrame(false);
    setPageType('');
    setPageTitle('');
    setElemCounts(null);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/generate-script', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let buf = '';
    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(buf.length);
      buf = xhr.responseText;
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const { type, payload } = JSON.parse(line.slice(6));
          if (type === 'PROGRESS') {
            pushLog(payload.message, 'info');
          } else if (type === 'SCREENSHOT') {
            if (payload.frameBase64) drawFrame(payload.frameBase64);
          } else if (type === 'PAGE_INFO') {
            setPageType(payload.pageType || '');
            setPageTitle(payload.pageTitle || '');
            setElemCounts(payload.elementCounts);
            pushLog(`Page type: ${payload.pageType} — "${payload.pageTitle}"`, 'step');
          } else if (type === 'STEP_ADDED') {
            setSteps(prev => [...prev, payload.step]);
            pushLog(`+ ${payload.step.label}`, 'success');
          } else if (type === 'COMPLETE') {
            setSteps(payload.steps || []);
            setRunning(false);
            setDone(true);
            pushLog(`✅ Generated ${payload.steps?.length || 0} steps for ${payload.pageType} page`, 'success');
          } else if (type === 'ERROR') {
            setError(payload.message || 'Unknown error');
            setRunning(false);
            pushLog(`❌ ${payload.message}`, 'error');
          }
        } catch (_) {}
      }
    };
    xhr.onload = xhr.onerror = () => { setRunning(false); };
    xhr.send(JSON.stringify({ url: withProtocol }));
  };

  const handleStop = () => {
    xhrRef.current?.abort();
    setRunning(false);
    pushLog('⏹ Stopped', 'error');
  };

  const handleApply = () => {
    onApply(steps, replace);
    onClose();
  };

  const logColor: Record<LogLine['kind'], string> = {
    info: 'text-slate-400', success: 'text-emerald-400', error: 'text-red-400', step: 'text-indigo-300',
  };

  const ptInfo = PAGE_TYPE_LABEL[pageType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl h-[88vh] flex flex-col rounded-2xl border border-slate-700 bg-[#0b0f18] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-surface-900/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Smart Script Builder</h2>
              <p className="text-[10px] text-slate-500">
                Analyzes any website and auto-generates a complete test script
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-surface-900/30 flex-shrink-0">
          <Globe className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <input
            className="flex-1 bg-surface-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
            placeholder="https://example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !running && handleRun()}
            disabled={running}
          />
          {running ? (
            <button onClick={handleStop} className="btn-danger text-xs px-3">
              <X className="w-3.5 h-3.5" /> Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!url.trim()}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all bg-violet-600 hover:bg-violet-500 text-white ${!url.trim() ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              {done ? 'Re-generate' : 'Analyze & Generate'}
            </button>
          )}
        </div>

        {/* Page type badge */}
        {(pageType || pageTitle) && (
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-800 bg-surface-900/20 flex-shrink-0 text-xs">
            {ptInfo && <span className={`font-semibold ${ptInfo.color}`}>{ptInfo.label}</span>}
            {pageTitle && <span className="text-slate-500">"{pageTitle}"</span>}
            {elemCounts && (
              <div className="flex items-center gap-2 ml-auto text-slate-600">
                {elemCounts.inputs > 0    && <span>{elemCounts.inputs} inputs</span>}
                {elemCounts.buttons > 0   && <span>{elemCounts.buttons} buttons</span>}
                {elemCounts.selects > 0   && <span>{elemCounts.selects} selects</span>}
                {elemCounts.links > 0     && <span>{elemCounts.links} links</span>}
              </div>
            )}
          </div>
        )}

        {/* Main split */}
        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* Left: log + steps */}
          <div className="w-[42%] flex-shrink-0 flex flex-col border-r border-slate-800 overflow-hidden">

            {/* Idle state */}
            {!running && !done && logs.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Wand2 className="w-7 h-7 text-violet-400/60" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-400">Enter a URL above</p>
                  <p className="text-xs text-slate-600 mt-1">Supports any website — login pages, sign-up forms, search, e-commerce, dashboards, and more</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-xs text-[11px]">
                  {Object.values(PAGE_TYPE_LABEL).map(({ label, color }) => (
                    <div key={label} className={`flex items-center gap-1.5 bg-surface-800 rounded-lg px-2.5 py-1.5 border border-slate-700 ${color}`}>
                      <CheckCircle className="w-3 h-3" /> {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Log panel */}
            {(running || done || logs.length > 0) && (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-surface-900/40 flex-shrink-0">
                  <span className="text-[10px] font-mono text-slate-600">$</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {done ? 'Complete' : 'Analyzing…'}
                  </span>
                  {running && <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-400"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"/>LIVE</span>}
                  {done && <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle className="w-3 h-3"/> {steps.length} steps</span>}
                </div>

                {/* Steps list when done */}
                {done && steps.length > 0 ? (
                  <div className="flex-1 overflow-y-auto">
                    <div className="px-2 py-1 space-y-px">
                      {steps.map((step, i) => {
                        const c = ACTION_COLOR[step.action] ?? ACTION_COLOR.default;
                        const Icon = ACTION_ICON[step.action] ?? ACTION_ICON.default;
                        return (
                          <div key={step.id || i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-800/60">
                            <span className="text-[10px] font-mono text-slate-700 w-5 text-right flex-shrink-0">{i + 1}</span>
                            <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${c}20` }}>
                              <Icon className="w-3 h-3" style={{ color: c }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-white truncate">{step.label}</p>
                              {step.selector && <p className="text-[9px] text-slate-600 font-mono truncate">{step.selector}</p>}
                            </div>
                            <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded font-mono" style={{ background: `${c}15`, color: c }}>{step.action}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Log lines while running */
                  <div ref={logEndRef} className="flex-1 overflow-y-auto p-3 font-mono bg-[#080c12]">
                    <div className="space-y-0.5">
                      {logs.map((l, i) => (
                        <div key={i} className={`flex items-start gap-2 text-[11px] leading-5 ${logColor[l.kind]}`}>
                          <span className="text-slate-700 flex-shrink-0 tabular-nums text-[10px]">{l.time}</span>
                          <span className="break-all">{l.message}</span>
                        </div>
                      ))}
                      {running && (
                        <div className="flex items-center gap-2 text-[11px] text-violet-400 mt-1">
                          <Loader className="w-3 h-3 animate-spin" />
                          <span className="animate-pulse">Processing…</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: browser preview */}
          <div className="flex-1 flex flex-col bg-[#060a0f] overflow-hidden">

            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-surface-900/50 flex-shrink-0">
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
              </div>
              <div className="flex-1 mx-2 px-2 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-[11px] font-mono text-slate-500 truncate">
                {url || 'about:blank'}
              </div>
              {running && <span className="flex items-center gap-1.5 text-[10px] text-violet-400 flex-shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /> LIVE</span>}
            </div>

            {/* Canvas */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <canvas ref={canvasRef} width={1280} height={720} className="max-w-full max-h-full object-contain" />

              {/* Idle */}
              {!running && !hasFrame && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
                  <div className="absolute inset-0 opacity-[0.025]"
                    style={{ backgroundImage: 'radial-gradient(circle,#94a3b8 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
                  <div className="relative z-10 text-center">
                    <Play className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm text-slate-600">Browser preview appears here</p>
                  </div>
                </div>
              )}

              {/* Launching */}
              {running && !hasFrame && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
                    <div className="relative w-16 h-16 rounded-full bg-violet-500/15 border-2 border-violet-500/40 flex items-center justify-center">
                      <Loader className="w-7 h-7 text-violet-400 animate-spin" />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white">Launching browser…</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <AlertTriangle className="w-10 h-10 text-red-400" />
                  <p className="text-sm font-semibold text-red-400">Failed</p>
                  <p className="text-xs text-slate-500 max-w-xs text-center">{error}</p>
                </div>
              )}

              {/* Done overlay */}
              {done && hasFrame && (
                <div className="absolute top-2 right-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-600/90 border border-emerald-500/50 backdrop-blur-sm">
                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                  <span className="text-[11px] font-bold text-white">{steps.length} steps ready</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-surface-900/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            {done && steps.length > 0 && (
              <>
                <span className="text-xs text-slate-500">Apply steps:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="mode" checked={replace} onChange={() => setReplace(true)} className="accent-violet-500" />
                  <span className="text-xs text-slate-400">Replace all</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="mode" checked={!replace} onChange={() => setReplace(false)} className="accent-violet-500" />
                  <span className="text-xs text-slate-400">Append to canvas</span>
                </label>
              </>
            )}
            {running && (
              <div className="flex items-center gap-2 text-xs text-violet-400">
                <Loader className="w-3.5 h-3.5 animate-spin" />
                Analyzing website…
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
            {done && steps.length > 0 && (
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                <ListChecks className="w-3.5 h-3.5" />
                Apply {steps.length} Steps to Canvas
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
