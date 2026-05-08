import { useEffect, useRef, useState, useCallback } from 'react';
import { useFlow } from '../context/FlowContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Play, CheckCircle, XCircle, Clock, Zap,
  RefreshCw, Globe, Eye, EyeOff, MousePointer,
  Loader, Type, Check, ChevronsDown, Camera, Code2,
  ArrowLeft, ArrowRight, Move, Square, Maximize2, Minimize2,
} from 'lucide-react';

interface RunLog { time: string; message: string; type: 'info'|'success'|'error'|'step'; }

const ACTION_COLOR: Record<string,string> = {
  visit:'#38bdf8', click:'#818cf8', dblclick:'#818cf8', rightclick:'#818cf8',
  fill:'#a78bfa', type:'#a78bfa', assert:'#34d399', check:'#34d399', uncheck:'#34d399',
  hover:'#22d3ee', wait:'#fbbf24', screenshot:'#fb7185',
  scroll:'#fb923c', press:'#e879f9', reload:'#38bdf8',
  goback:'#94a3b8', goforward:'#94a3b8', drag:'#f472b6', evaluate:'#facc15',
  default:'#6366f1',
};
const ACTION_LABEL: Record<string,string> = {
  visit:'Navigating to', click:'Clicking', dblclick:'Double-clicking', rightclick:'Right-clicking',
  fill:'Filling in', type:'Typing into', assert:'Asserting', check:'Checking',
  uncheck:'Unchecking', hover:'Hovering over', wait:'Waiting', screenshot:'Screenshot',
  scroll:'Scrolling', press:'Pressing key', reload:'Reloading', goback:'Going back',
  goforward:'Going forward', drag:'Dragging', evaluate:'Running JS', default:'Executing',
};
const ACTION_ICON: Record<string, React.ElementType> = {
  visit: Globe, click: MousePointer, dblclick: MousePointer, rightclick: MousePointer,
  fill: Type, type: Type, check: Check, uncheck: Check, hover: Eye,
  scroll: ChevronsDown, screenshot: Camera, evaluate: Code2,
  goback: ArrowLeft, goforward: ArrowRight, drag: Move, default: Zap,
};

function normalizeUrl(raw: string): string {
  if (!raw || raw === 'https://' || raw === 'http://') return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

export default function RunnerPage() {
  const { state, updateFlow } = useFlow();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFlow } = state;

  const [logs, setLogs]               = useState<RunLog[]>([]);
  const [running, setRunning]         = useState(false);
  const [status, setStatus]           = useState<'idle'|'running'|'passed'|'failed'>('idle');
  const [showPreview, setShowPreview] = useState(true);
  const [wideCanvas, setWideCanvas]   = useState(false);

  const [activeStepIdx, setActiveStepIdx] = useState<number|null>(null);
  const [activeAction, setActiveAction]   = useState('');
  const [activeLabel, setActiveLabel]     = useState('');
  const [activeValue, setActiveValue]     = useState('');
  const [displayUrl, setDisplayUrl]       = useState('');
  const [hasLiveFrame, setHasLiveFrame]   = useState(false);
  const [startTime, setStartTime]         = useState<number|null>(null);
  const [elapsed, setElapsed]             = useState(0);

  const logEndRef    = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef(new Image());
  const xhrRef       = useRef<XMLHttpRequest | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRunFired = useRef(false);

  // Scroll log to bottom
  const pushLog = useCallback((message: string, type: RunLog['type'] = 'info') => {
    setLogs(prev => {
      const next = [...prev, { time: new Date().toLocaleTimeString(), message, type }];
      setTimeout(() => logEndRef.current?.scrollTo({ top: logEndRef.current.scrollHeight }), 20);
      return next;
    });
  }, []);

  // Draw a live frame onto the canvas
  const drawFrame = useCallback((b64: string) => {
    const img = imgRef.current;
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.getContext('2d')?.drawImage(img, 0, 0, 1280, 720);
      setHasLiveFrame(true);
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  }, []);

  // Sync displayUrl from flow
  useEffect(() => {
    const base = normalizeUrl(currentFlow.baseUrl);
    if (base) { setDisplayUrl(base); return; }
    const visit = currentFlow.steps.find(s => s.action === 'visit' && s.url);
    if (visit?.url) setDisplayUrl(normalizeUrl(visit.url));
  }, [currentFlow.baseUrl, currentFlow.steps]);

  // Elapsed timer
  useEffect(() => {
    if (running && startTime) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTime), 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, startTime]);

  const resetState = () => {
    setLogs([]); setStatus('idle'); setRunning(false);
    setActiveStepIdx(null); setActiveAction(''); setActiveLabel(''); setActiveValue('');
    setHasLiveFrame(false); setElapsed(0); setStartTime(null);
    const c = canvasRef.current;
    if (c) c.getContext('2d')?.clearRect(0, 0, 1280, 720);
  };

  const handleStop = () => {
    xhrRef.current?.abort();
    setRunning(false);
    setStatus('failed');
    pushLog('⏹ Stopped by user', 'error');
  };

  const handleRun = () => {
    const enabledSteps = currentFlow.steps.filter(s => s.enabled !== false);
    if (enabledSteps.length === 0) { pushLog('No steps — add steps in Builder first.', 'error'); return; }

    // Auto-sync baseUrl from first visit step
    const hasBase = currentFlow.baseUrl && currentFlow.baseUrl !== 'https://';
    if (!hasBase) {
      const visit = currentFlow.steps.find(s => s.action === 'visit' && s.url);
      if (visit?.url) {
        const u = normalizeUrl(visit.url);
        if (u) { updateFlow({ baseUrl: u }); setDisplayUrl(u); }
      }
    }

    resetState();
    setRunning(true);
    setStatus('running');
    setStartTime(Date.now());

    pushLog(`▶  Starting: "${currentFlow.name}"`, 'info');
    pushLog(`Steps: ${enabledSteps.length} enabled of ${currentFlow.steps.length} total`, 'info');

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/run-test', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let buf = '';
    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(buf.length);
      buf = xhr.responseText;
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const { type, payload } = JSON.parse(line.slice(6));

          if (type === 'TEST_RUN_FRAME') {
            if (payload.frameBase64) drawFrame(payload.frameBase64);

          } else if (type === 'TEST_RUN_LOG') {
            const tm: Record<string, RunLog['type']> = { info:'info', success:'success', error:'error', step:'step' };
            pushLog(payload.message, tm[payload.logType] ?? 'info');
            if (payload.logType === 'step') {
              const m = payload.message.match(/^\[(\d+)\/(\d+)\]\s+(.+?)\s+\(([^)]+)\)$/);
              if (m) {
                setActiveStepIdx(parseInt(m[1]) - 1);
                setActiveLabel(m[3]);
                setActiveAction(m[4]);
              }
            }

          } else if (type === 'TEST_RUN_STEP') {
            const step = payload as any;
            if (step.action === 'visit' && step.url) setDisplayUrl(normalizeUrl(step.url));
            setActiveValue((step.action === 'fill' || step.action === 'type') ? (step.value ?? '') : '');

          } else if (type === 'TEST_RUN_SCREENSHOT') {
            if (payload.screenshotBase64) drawFrame(payload.screenshotBase64);

          } else if (type === 'TEST_RUN_COMPLETE') {
            setRunning(false);
            setStatus(payload.passed ? 'passed' : 'failed');
            setActiveStepIdx(null); setActiveAction(''); setActiveLabel(''); setActiveValue('');
            pushLog(payload.passed ? '✅ All tests passed!' : '❌ Test run failed.', payload.passed ? 'success' : 'error');
          }
        } catch (_) {}
      }
    };
    xhr.onload = xhr.onerror = () => { setRunning(false); };
    xhr.send(JSON.stringify({ flow: currentFlow }));
  };

  // Auto-run when navigated from Builder
  useEffect(() => {
    const loc = location as any;
    if (loc?.state?.autoRun && !autoRunFired.current && currentFlow.steps.length > 0) {
      autoRunFired.current = true;
      setTimeout(() => handleRun(), 150);
    }
  }, []);

  const logColors: Record<RunLog['type'],string> = {
    info:'text-slate-400', success:'text-emerald-400', error:'text-red-400', step:'text-indigo-300',
  };
  const logPfx: Record<RunLog['type'],string> = { info:'·', success:'✓', error:'✗', step:'→' };

  const statusBg = status==='passed' ? 'bg-emerald-500/20 border-emerald-500/30'
    : status==='failed'  ? 'bg-red-500/20 border-red-500/30'
    : status==='running' ? 'bg-amber-500/20 border-amber-500/30'
    : 'bg-slate-700/30 border-slate-700/50';

  const statusIcon = status==='passed'  ? <CheckCircle className="w-4 h-4 text-emerald-400" />
    : status==='failed'  ? <XCircle   className="w-4 h-4 text-red-400" />
    : status==='running' ? <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
    : <Play className="w-4 h-4 text-slate-400" />;

  const enabledSteps = currentFlow.steps.filter(s => s.enabled !== false);
  const currentNum   = activeStepIdx !== null ? activeStepIdx + 1 : 0;
  const pct          = enabledSteps.length > 0 ? (currentNum / enabledSteps.length) * 100 : 0;
  const color        = ACTION_COLOR[activeAction] ?? ACTION_COLOR.default;
  const ActionIcon   = ACTION_ICON[activeAction] ?? ACTION_ICON.default;
  const elapsedStr   = elapsed > 0 ? `${(elapsed / 1000).toFixed(1)}s` : '';

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="page-header flex-shrink-0 !py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${statusBg}`}>{statusIcon}</div>
          <div>
            <h1 className="text-base font-bold text-white">Test Runner</h1>
            <p className="text-xs text-slate-500">
              {status==='running'
                ? `Step ${currentNum}/${enabledSteps.length} running… ${elapsedStr}`
                : status==='passed' ? `✓ All ${enabledSteps.length} steps passed ${elapsedStr}`
                : status==='failed' ? '✗ Test failed — check terminal'
                : `${enabledSteps.length} step${enabledSteps.length!==1?'s':''} ready`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className={`btn-ghost text-xs ${showPreview?'text-brand-400':''}`} onClick={()=>setShowPreview(v=>!v)}>
            {showPreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Preview
          </button>
          {running && (
            <button onClick={handleStop} className="btn-danger text-xs">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          <button className={`btn-primary ${running?'opacity-60 cursor-not-allowed':''}`} onClick={handleRun} disabled={running}>
            {running ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</> : <><Zap className="w-4 h-4" /> Run Tests</>}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-slate-800 bg-surface-900/30 flex-shrink-0 text-xs text-slate-400 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          <span className="text-white font-medium">{currentFlow.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Globe className="w-3 h-3" />
          <span className="text-white font-medium font-mono truncate max-w-44">{displayUrl || 'no URL — add a Visit step'}</span>
        </div>
        <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{state.generatorOptions.timeout/1000}s timeout</div>
        <div>Steps: <span className="text-white font-medium">{enabledSteps.length}</span></div>
        <div>Browser: <span className="text-white font-medium capitalize">{state.generatorOptions.browserType}</span></div>
        {running && elapsedStr && <div className="ml-auto text-amber-400 font-mono animate-pulse">{elapsedStr}</div>}
      </div>

      {/* ── Split panel ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* ── Terminal panel ── */}
        {!wideCanvas && (
          <div className={`flex flex-col overflow-hidden border-r border-slate-800 ${showPreview?'w-[40%]':'flex-1'} transition-all duration-300`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-surface-900/40 flex-shrink-0">
              <span className="text-[11px] font-mono text-slate-600">$</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Terminal</span>
              {running && <span className="ml-auto flex items-center gap-1.5 text-[10px] text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/>LIVE</span>}
              {status==='passed' && <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle className="w-3 h-3"/>PASSED</span>}
              {status==='failed' && <span className="ml-auto flex items-center gap-1 text-[10px] text-red-400"><XCircle className="w-3 h-3"/>FAILED</span>}
            </div>

            <div ref={logEndRef} className="flex-1 overflow-y-auto p-4 font-mono bg-[#080c12]">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <span className="text-3xl text-slate-700">$</span>
                  <p className="text-sm text-white font-medium">Ready to Run</p>
                  <p className="text-xs text-slate-600">
                    {currentFlow.steps.length === 0
                      ? 'Add steps in Builder first.'
                      : 'Click "Run Tests" to execute your flow.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="text-[10px] text-slate-700 mb-3 pb-2 border-b border-slate-800 font-mono">
                    $ npx playwright test {currentFlow.name.replace(/[^a-zA-Z0-9]/g,'_').toLowerCase()}.spec.ts
                  </div>
                  {logs.map((log, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs leading-5 ${logColors[log.type]}`}>
                      <span className="text-slate-700 flex-shrink-0 tabular-nums text-[10px]">{log.time}</span>
                      <span className="flex-shrink-0">{logPfx[log.type]}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                  {running && (
                    <div className="flex items-center gap-2 text-xs text-amber-400 mt-2">
                      <RefreshCw className="w-3 h-3 animate-spin"/>
                      <span className="animate-pulse">Running…</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step pills */}
            {currentFlow.steps.length > 0 && (
              <div className="px-3 py-2 border-t border-slate-800 bg-surface-900/30 flex-shrink-0">
                <div className="flex flex-wrap gap-1">
                  {currentFlow.steps.map((step, i) => (
                    <span key={step.id} className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-all duration-300 ${
                      !step.enabled ? 'bg-slate-800 text-slate-600'
                      : activeStepIdx===i ? 'bg-indigo-500 text-white scale-110'
                      : activeStepIdx!==null && i<activeStepIdx ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-500'}`}>
                      {i+1}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Live Browser Preview panel ── */}
        {showPreview && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#060a0f]">

            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-surface-900/50 flex-shrink-0">
              <div className="flex gap-1 flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
              </div>
              <div className="flex-1 mx-2 px-2 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-[11px] font-mono text-slate-500 truncate">
                {displayUrl || 'about:blank'}
              </div>
              {running && (
                <span className="flex items-center gap-1.5 text-[10px] text-amber-400 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> LIVE
                </span>
              )}
              {!running && status === 'passed' && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 flex-shrink-0">
                  <CheckCircle className="w-3 h-3" /> DONE
                </span>
              )}
              <button onClick={() => setWideCanvas(v => !v)} className="btn-icon flex-shrink-0 p-1">
                {wideCanvas ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Progress bar */}
            {running && (
              <div className="h-0.5 bg-slate-900 flex-shrink-0">
                <div className="h-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
              </div>
            )}

            {/* Canvas area */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <canvas ref={canvasRef} width={1280} height={720}
                className="max-w-full max-h-full object-contain" />

              {/* ── Idle state ── */}
              {!running && !hasLiveFrame && status === 'idle' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
                  <div className="absolute inset-0 opacity-[0.025]"
                    style={{ backgroundImage: 'radial-gradient(circle,#94a3b8 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
                  <div className="relative z-10 flex flex-col items-center gap-4 text-center w-full max-w-sm px-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Play className="w-6 h-6 text-indigo-400/60" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-500">Live Browser Preview</p>
                      <p className="text-xs text-slate-700 mt-0.5">Frames stream here as your test runs</p>
                    </div>
                    {/* Step pipeline preview */}
                    {enabledSteps.length > 0 && (
                      <div className="w-full space-y-1 max-h-48 overflow-y-auto">
                        {enabledSteps.slice(0, 8).map((step, i) => {
                          const c = ACTION_COLOR[step.action] ?? ACTION_COLOR.default;
                          const Icon = ACTION_ICON[step.action] ?? ACTION_ICON.default;
                          return (
                            <div key={step.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
                              <span className="text-[9px] font-mono text-slate-700 w-4 text-right">{i+1}</span>
                              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: `${c}20` }}>
                                <Icon className="w-3 h-3" style={{ color: c }} />
                              </div>
                              <span className="text-[11px] text-slate-500 truncate flex-1">{step.label}</span>
                              <span className="text-[9px] font-mono px-1 py-0.5 rounded" style={{ background: `${c}15`, color: c }}>{step.action}</span>
                            </div>
                          );
                        })}
                        {enabledSteps.length > 8 && (
                          <p className="text-center text-[10px] text-slate-700">+{enabledSteps.length - 8} more steps</p>
                        )}
                      </div>
                    )}
                    {enabledSteps.length === 0 && (
                      <p className="text-xs text-slate-700">No steps yet — add steps in Builder first</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Launching (running, no frame yet) ── */}
              {running && !hasLiveFrame && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
                    <div className="relative w-16 h-16 rounded-full bg-amber-500/15 border-2 border-amber-500/40 flex items-center justify-center">
                      <Loader className="w-7 h-7 text-amber-400 animate-spin" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-white">Launching browser…</p>
                    <p className="text-xs text-slate-600 mt-1">Connecting to Playwright</p>
                  </div>
                </div>
              )}

              {/* ── Active step badge (overlay, bottom-left) ── */}
              {running && hasLiveFrame && activeAction && (
                <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg backdrop-blur-sm bg-surface-900/90 border shadow-lg"
                  style={{ borderColor: `${color}40` }}>
                  <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: `${color}20` }}>
                    <ActionIcon className="w-3 h-3" style={{ color }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold" style={{ color }}>{ACTION_LABEL[activeAction] ?? activeAction}</p>
                    {activeLabel && <p className="text-[10px] text-slate-400 max-w-[160px] truncate">{activeLabel}</p>}
                    {activeValue && <p className="text-[10px] font-mono text-slate-500 max-w-[160px] truncate">"{activeValue}"</p>}
                  </div>
                  <span className="text-[10px] font-mono text-slate-600">{currentNum}/{enabledSteps.length}</span>
                </div>
              )}

              {/* ── Passed overlay ── */}
              {!running && status === 'passed' && hasLiveFrame && (
                <div className="absolute top-2 right-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-600/90 border border-emerald-500/50 backdrop-blur-sm shadow-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                  <span className="text-[11px] font-bold text-white">All {enabledSteps.length} passed</span>
                </div>
              )}

              {/* ── Failed overlay ── */}
              {!running && status === 'failed' && hasLiveFrame && (
                <div className="absolute top-2 right-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-600/90 border border-red-500/50 backdrop-blur-sm shadow-lg">
                  <XCircle className="w-3.5 h-3.5 text-white" />
                  <span className="text-[11px] font-bold text-white">Test failed</span>
                </div>
              )}

              {/* ── Full-canvas done overlay when no frames ── */}
              {!running && !hasLiveFrame && status !== 'idle' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  {status === 'passed' ? (
                    <>
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                        <div className="relative w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center"
                          style={{ boxShadow: '0 0 48px #34d39925' }}>
                          <CheckCircle className="w-9 h-9 text-emerald-400" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-emerald-400">All Passed!</p>
                        <p className="text-sm text-slate-500 mt-1">{enabledSteps.length} step{enabledSteps.length!==1?'s':''} completed</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center">
                        <XCircle className="w-9 h-9 text-red-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-red-400">Test Failed</p>
                        <p className="text-sm text-slate-500 mt-1">Check the terminal log for details</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Step timeline strip ── */}
            <div className="border-t border-slate-800 flex-shrink-0 bg-[#080c12]" style={{ maxHeight: '130px', overflowY: 'auto' }}>
              <div className="px-2 py-1.5 space-y-px">
                {enabledSteps.map((step, i) => {
                  const done   = activeStepIdx !== null && i < activeStepIdx;
                  const active = i === activeStepIdx;
                  const c = ACTION_COLOR[step.action] ?? ACTION_COLOR.default;
                  const Icon = ACTION_ICON[step.action] ?? ACTION_ICON.default;
                  return (
                    <div key={step.id}
                      className={`flex items-center gap-2 px-2 py-1 rounded transition-all duration-300 border ${active ? 'border-opacity-40' : 'border-transparent'}`}
                      style={active ? { background: `${c}10`, borderColor: `${c}40` } : {}}>
                      <span className="flex-shrink-0 w-4 text-center text-xs">
                        {done   ? <span className="text-emerald-400 text-[10px]">✓</span>
                         : active ? <RefreshCw className="w-3 h-3 animate-spin inline" style={{ color: c }} />
                         :          <span className="text-slate-700 text-[10px]">○</span>}
                      </span>
                      <span className={`font-mono text-[10px] w-4 text-right flex-shrink-0 ${active?'text-white':'text-slate-700'}`}>{i+1}</span>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={(active||done) ? { background: `${c}20` } : {}}>
                        <Icon className="w-2.5 h-2.5" style={{ color: (active||done) ? c : '#334155' }} />
                      </div>
                      <span className={`flex-1 truncate text-[11px] ${done?'text-slate-600':active?'text-white font-medium':'text-slate-600'}`}>
                        {step.label}
                      </span>
                      <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded font-mono"
                        style={active ? { background:`${c}25`, color:c } : { color:'#334155' }}>
                        {step.action}
                      </span>
                    </div>
                  );
                })}
                {enabledSteps.length === 0 && (
                  <p className="text-center text-[10px] text-slate-700 py-2">No steps — add steps in Builder first</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Result banner ── */}
      {(status==='passed'||status==='failed') && (
        <div className={`flex items-center gap-3 px-4 py-2 border-t flex-shrink-0 ${status==='passed'?'bg-emerald-500/10 border-emerald-500/20':'bg-red-500/10 border-red-500/20'}`}>
          {status==='passed'
            ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            : <XCircle     className="w-4 h-4 text-red-400 flex-shrink-0" />}
          <p className={`text-xs font-semibold flex-1 ${status==='passed'?'text-emerald-400':'text-red-400'}`}>
            {status==='passed'
              ? `All ${enabledSteps.length} step${enabledSteps.length!==1?'s':''} passed${elapsedStr?' in '+elapsedStr:''}`
              : 'Test run failed — check terminal log for details'}
          </p>
          <div className="flex gap-2">
            {status==='failed' && (
              <button className="btn-secondary text-xs" onClick={handleRun}>
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
            <button className="btn-ghost text-xs" onClick={resetState}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
