import { useEffect, useRef, useState } from 'react';
import { useFlow } from '../context/FlowContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVSCodeListener } from '../hooks/useVSCode';
import { TestStep } from '../types';
import {
  Play, CheckCircle, XCircle, Clock, Zap,
  RefreshCw, Settings, Globe, Eye, EyeOff, MousePointer,
  Lock, Loader, ChevronLeft, ChevronRight, RotateCw, AlertCircle,
  Type, Check, ChevronsDown, Camera, Code2, ArrowLeft, ArrowRight, Move
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
  goforward:'Going forward', drag:'Dragging', evaluate:'Evaluating JS', default:'Executing',
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

// Removed dummy animations since we have live Playwright screenshots now.

/* ── ActionVisualizer — main preview component ─────────────────── */
function ActionVisualizer({ url, running, status, activeAction, activeLabel,
  stepIdx, totalSteps, steps, activeStepIdx, screenshotData, prevScreenshotData }: {
  url: string; running: boolean; status: string;
  activeAction: string; activeLabel: string; activeValue?: string;
  stepIdx: number|null; totalSteps: number;
  steps: TestStep[]; activeStepIdx: number|null;
  screenshotData: string|null; prevScreenshotData: string|null;
}) {
  const color   = ACTION_COLOR[activeAction] ?? ACTION_COLOR.default;
  const actText = ACTION_LABEL[activeAction] ?? ACTION_LABEL.default;
  const enabled  = steps.filter(s => s.enabled !== false);

  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    if (screenshotData) {
      setFadeKey(k => k + 1);
    }
  }, [screenshotData]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0b0f18] relative">

      {/* ── Action hero area ── */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative">
        
        {/* Render Screenshots */}
        {(screenshotData || prevScreenshotData) ? (
          <div className="w-full h-full relative bg-slate-900 flex items-center justify-center overflow-hidden group">
            {/* Previous Screenshot (underneath, for crossfade) */}
            {prevScreenshotData && (
              <img
                src={`data:image/jpeg;base64,${prevScreenshotData}`}
                className={`absolute object-contain max-w-full max-h-full transition-opacity duration-500 ease-in-out ${screenshotData ? 'opacity-0' : 'opacity-100'}`}
                alt="Previous Playwright State"
              />
            )}
            
            {/* Current Screenshot */}
            {screenshotData && (
              <img
                key={fadeKey}
                src={`data:image/jpeg;base64,${screenshotData}`}
                className="absolute object-contain max-w-full max-h-full transition-opacity duration-300 ease-in-out animate-in fade-in"
                alt="Live Playwright State"
              />
            )}

            {/* Action Overlay */}
            {running && activeAction && (
              <div className="absolute top-4 right-4 animate-in fade-in slide-in-from-top-4 duration-300 z-10 pointer-events-none">
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md"
                  style={{ borderColor: color+'50', background: color+'18' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color+'30' }}>
                    {(() => { const Icon = ACTION_ICON[activeAction] ?? ACTION_ICON.default; return <Icon className="w-4 h-4" style={{ color }} />; })()}
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="text-xs font-bold text-white uppercase tracking-wider shadow-sm">{actText}</div>
                    <div className="text-[10px] text-slate-300 truncate max-w-[200px]">{activeLabel}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]" style={{ background: color, color }} />
                    <span className="text-[10px] font-bold tracking-wider" style={{ color }}>LIVE</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Completion Overlays over Screenshot */}
            {!running && status === 'passed' && (
              <div className="absolute inset-0 bg-emerald-900/20 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in">
                <div className="flex items-center gap-3 bg-emerald-950/80 border border-emerald-500/30 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                  <div>
                    <div className="font-bold text-emerald-400 text-lg tracking-wide">All Tests Passed!</div>
                    <div className="text-xs text-emerald-200/70">{totalSteps} steps completed successfully</div>
                  </div>
                </div>
              </div>
            )}

            {!running && status === 'failed' && (
              <div className="absolute inset-0 bg-red-900/20 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in">
                <div className="flex items-center gap-3 bg-red-950/80 border border-red-500/30 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md">
                  <XCircle className="w-8 h-8 text-red-400" />
                  <div>
                    <div className="font-bold text-red-400 text-lg tracking-wide">Test Failed</div>
                    <div className="text-xs text-red-200/70">Check terminal log for details</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-5 px-6 py-4">
            {/* Idle */}
            {!running && status === 'idle' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Play className="w-7 h-7 text-indigo-400" />
                </div>
                <p className="text-sm font-semibold text-white">Preview Ready</p>
                <p className="text-xs text-slate-500">Click <strong>Generate &amp; Run</strong> to see live execution</p>
              </div>
            )}

            {/* Passed */}
            {!running && status === 'passed' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-emerald-400">All Tests Passed!</p>
                <p className="text-xs text-slate-500">{totalSteps} step{totalSteps!==1?'s':''} completed successfully</p>
              </div>
            )}

            {/* Failed */}
            {!running && status === 'failed' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-sm font-bold text-red-400">Test Failed</p>
                <p className="text-xs text-slate-500">Check terminal log for details</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Step timeline ── */}
      <div className="border-t border-slate-800 bg-surface-950/60 overflow-y-auto flex-shrink-0" style={{ maxHeight:'160px' }}>
        <div className="px-2 py-1.5 space-y-0.5">
          {enabled.map((step, i) => {
            const done   = activeStepIdx !== null && i < activeStepIdx;
            const active = i === activeStepIdx;
            const c = ACTION_COLOR[step.action] ?? ACTION_COLOR.default;
            return (
              <div key={step.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all duration-300 ${
                active ? 'border' : 'border border-transparent'}`}
                style={active ? { background: c+'12', borderColor: c+'40' } : {}}>
                <span className="flex-shrink-0 w-4 text-center">
                  {done ? <span className="text-emerald-400">✓</span>
                    : active ? <RefreshCw className="w-3 h-3 animate-spin inline" style={{ color: c }} />
                    : <span className="text-slate-700">○</span>}
                </span>
                <span className={`font-mono text-[10px] flex-shrink-0 w-5 text-right ${active ? 'text-white' : 'text-slate-600'}`}>{i+1}</span>
                <span className={`flex-1 truncate ${done ? 'text-slate-500' : active ? 'text-white font-medium' : 'text-slate-600'}`}>{step.label}</span>
                <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded font-mono" style={active ? { background: c+'25', color: c } : { color:'#334155' }}>{step.action}</span>
              </div>
            );
          })}
          {enabled.length === 0 && (
            <p className="text-center text-[10px] text-slate-700 py-3">No steps — add steps in Builder first</p>
          )}
        </div>
      </div>
    </div>
  );
}


export default function RunnerPage() {
  const { state, generateTest, runTest, updateFlow } = useFlow();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentFlow } = state;

  const [logs, setLogs]           = useState<RunLog[]>([]);
  const [running, setRunning]     = useState(false);
  const [status, setStatus]       = useState<'idle'|'running'|'passed'|'failed'>('idle');
  const [showPreview, setShowPreview] = useState(true);
  const [activeStepIdx, setActiveStepIdx] = useState<number|null>(null);
  const [activeAction, setActiveAction]   = useState('');
  const [activeLabel, setActiveLabel]     = useState('');
  const [activeValue, setActiveValue]     = useState('');
  const [displayUrl, setDisplayUrl]       = useState('');
  const [scrollDir, setScrollDir]         = useState<'up'|'down'|null>(null);
  const [screenshotData, setScreenshotData] = useState<string|null>(null);
  const [prevScreenshotData, setPrevScreenshotData] = useState<string|null>(null);

  const logEndRef  = useRef<HTMLDivElement>(null);
  const autoRunFired = useRef(false);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  useEffect(() => {
    const base = normalizeUrl(currentFlow.baseUrl);
    if (base) { setDisplayUrl(base); return; }
    const visitStep = currentFlow.steps.find(s => s.action === 'visit' && s.url);
    if (visitStep?.url) { setDisplayUrl(normalizeUrl(visitStep.url)); }
  }, [currentFlow.baseUrl, currentFlow.steps]);


  const pushLog = (message: string, type: RunLog['type'] = 'info') =>
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);

  useVSCodeListener('TEST_RUN_LOG', (payload) => {
    const p = payload as { logType: string; message: string };
    const tm: Record<string,RunLog['type']> = { info:'info', success:'success', error:'error', step:'step' };
    setRunning(true);
    setStatus(prev => prev === 'idle' ? 'running' : prev);
    pushLog(p.message, tm[p.logType] ?? 'info');
    if (p.logType === 'step') {
      const m = p.message.match(/^\[(\d+)\/(\d+)\]\s+(.+?)\s+\(([^)]+)\)$/);
      if (m) {
        const idx   = parseInt(m[1]) - 1;
        const action = m[4];
        setActiveStepIdx(idx);
        setActiveLabel(m[3]);
        setActiveAction(action);
        // When a visit step executes, update displayUrl to that step's URL
        if (action === 'visit') {
          const step = currentFlow.steps.filter(s => s.enabled)[idx];
          if (step?.url) {
            const u = normalizeUrl(step.url);
            if (u) setDisplayUrl(u);
          }
        }
      }
    }
  });

  useVSCodeListener('TEST_RUN_STEP', (payload) => {
    const step = payload as any;
    if (step.action === 'visit') {
      setScrollDir(null);
      if (step.url) setDisplayUrl(normalizeUrl(step.url));
    } else if (step.action === 'scroll') {
      const delta = step.scrollY ?? 500;
      setScrollDir(delta < 0 ? 'up' : 'down');
    }
    setActiveValue((step.action === 'fill' || step.action === 'type') ? (step.value ?? '') : '');
  });

  useVSCodeListener('TEST_RUN_SCREENSHOT', (payload) => {
    const data = payload as { stepIdx: number; action: string; phase: string; color: string; screenshotBase64: string };
    if (data.screenshotBase64) {
      setPrevScreenshotData(screenshotData);
      setScreenshotData(data.screenshotBase64);
    }
  });


  useVSCodeListener('TEST_RUN_COMPLETE', (payload) => {
    const p = payload as { passed: boolean };
    setRunning(false);
    setStatus(p.passed ? 'passed' : 'failed');
    setActiveStepIdx(null);
    setActiveAction('');
    setActiveLabel('');
    setActiveValue('');
    setScrollDir(null);
    pushLog(p.passed ? '✅ Test run complete — all tests passed!' : '❌ Test run complete — some tests failed.', p.passed ? 'success' : 'error');
  });

  const handleGenAndRun = () => {
    if (!currentFlow.steps.length) { pushLog('No steps — add steps in Builder first.', 'error'); return; }

    // Auto-sync baseUrl from first visit step if not set
    const hasBase = currentFlow.baseUrl && currentFlow.baseUrl !== 'https://';
    if (!hasBase) {
      const visitStep = currentFlow.steps.find(s => s.action === 'visit' && s.url);
      if (visitStep?.url) {
        const u = normalizeUrl(visitStep.url);
        if (u) { updateFlow({ baseUrl: u }); setDisplayUrl(u); }
      }
    }

    setLogs([]); setRunning(true); setStatus('running');
    setActiveStepIdx(null); setActiveAction(''); setActiveLabel('');
    setScreenshotData(null); setPrevScreenshotData(null);
    pushLog(`▶  Starting: "${currentFlow.name}"`, 'info');
    pushLog(`Steps: ${currentFlow.steps.filter(s=>s.enabled).length} enabled of ${currentFlow.steps.length} total`, 'info');
    pushLog('Generating test file…', 'info');
    generateTest();
    setTimeout(() => { pushLog('Dispatching to Playwright runner…', 'info'); runTest(); }, 700);
  };

  const handleClear = () => {
    setLogs([]); setStatus('idle'); setRunning(false);
    setActiveStepIdx(null); setActiveAction(''); setActiveLabel(''); setActiveValue('');
    setScrollDir(null); setScreenshotData(null); setPrevScreenshotData(null);
  };

  // Auto-run when navigated from Builder's Run button
  useEffect(() => {
    const loc = location as any;
    if (loc?.state?.autoRun && !autoRunFired.current && currentFlow.steps.length > 0) {
      autoRunFired.current = true;
      setTimeout(() => handleGenAndRun(), 150);
    }
  }, []);

  const logColors: Record<RunLog['type'],string> = { info:'text-slate-400', success:'text-emerald-400', error:'text-red-400', step:'text-indigo-300' };
  const logPfx:    Record<RunLog['type'],string>  = { info:'ℹ', success:'✓', error:'✗', step:'→' };

  const statusBg = status==='passed' ? 'bg-emerald-500/20 border-emerald-500/30'
    : status==='failed'  ? 'bg-red-500/20 border-red-500/30'
    : status==='running' ? 'bg-amber-500/20 border-amber-500/30'
    : 'bg-slate-700/30 border-slate-700/50';

  const statusIcon = status==='passed'  ? <CheckCircle className="w-4 h-4 text-emerald-400" />
    : status==='failed'  ? <XCircle   className="w-4 h-4 text-red-400" />
    : status==='running' ? <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
    : <Play className="w-4 h-4 text-slate-400" />;

  const enabledSteps = currentFlow.steps.filter(s=>s.enabled);

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="page-header flex-shrink-0 !py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${statusBg}`}>{statusIcon}</div>
          <div>
            <h1 className="text-base font-bold text-white">Test Runner</h1>
            <p className="text-xs text-slate-500">
              {status==='running' ? `Step ${activeStepIdx!=null?activeStepIdx+1:'?'} running…`
               : status==='passed' ? '✓ All tests passed'
               : status==='failed' ? '✗ Tests failed'
               : `${enabledSteps.length} steps ready`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className={`btn-ghost text-xs ${showPreview?'text-brand-400':''}`} onClick={()=>setShowPreview(v=>!v)}>
            {showPreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Preview
          </button>
          <button className="btn-secondary text-xs" onClick={()=>navigate('/settings')}><Settings className="w-4 h-4" /> Options</button>
          <button className="btn-ghost text-xs" onClick={handleClear}><RefreshCw className="w-3.5 h-3.5" /> Clear</button>
          <button className={`btn-primary ${running?'opacity-60 cursor-not-allowed':''}`} onClick={handleGenAndRun} disabled={running}>
            {running ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</> : <><Zap className="w-4 h-4" /> Generate &amp; Run</>}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-slate-800 bg-surface-900/30 flex-shrink-0 text-xs text-slate-400 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          Flow: <span className="text-white font-medium">{currentFlow.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Globe className="w-3 h-3" />
          <span className="text-white font-medium font-mono truncate max-w-44">{displayUrl || 'no URL — add a Visit step'}</span>
        </div>
        <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{state.generatorOptions.timeout/1000}s</div>
        <div>Steps: <span className="text-white font-medium">{enabledSteps.length}</span></div>
        <div>Browser: <span className="text-white font-medium capitalize">{state.generatorOptions.browserType}</span></div>
      </div>

      {/* Split panel */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* Terminal */}
        <div className={`flex flex-col overflow-hidden border-r border-slate-800 ${showPreview?'w-[42%]':'flex-1'} transition-all duration-300`}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-surface-900/40 flex-shrink-0">
            <span className="text-[11px] font-mono text-slate-600">$</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Terminal</span>
            {running && <span className="ml-auto flex items-center gap-1.5 text-[10px] text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/>LIVE</span>}
            {status==='passed' && <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle className="w-3 h-3"/>PASSED</span>}
            {status==='failed' && <span className="ml-auto flex items-center gap-1 text-[10px] text-red-400"><XCircle className="w-3 h-3"/>FAILED</span>}
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono bg-[#080c12]">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <span className="text-3xl text-slate-700">$</span>
                <p className="text-sm text-white font-medium">Ready to Run</p>
                <p className="text-xs text-slate-600">{currentFlow.steps.length===0 ? 'Add steps in Builder first.' : 'Click "Generate & Run" to start.'}</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                <div className="text-[10px] text-slate-700 mb-3 pb-2 border-b border-slate-800 font-mono">
                  $ npx playwright test {currentFlow.name.replace(/[^a-zA-Z0-9]/g,'_').toLowerCase()}.spec.ts --reporter=list
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
                    <span className="animate-pulse">Processing…</span>
                  </div>
                )}
                <div ref={logEndRef} />
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
                    : activeStepIdx===i ? 'bg-indigo-500 text-white scale-105'
                    : activeStepIdx!==null && i<activeStepIdx ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-500'}`}>
                    {i+1}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Visualizer */}
        {showPreview && (
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 border-l border-slate-800">
            {/* Mini browser chrome header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
              </div>
              <div className="flex-1 flex items-center gap-1.5 bg-[#0d1117] border border-slate-700 rounded-full px-2.5 py-0.5 mx-2 min-w-0">
                {displayUrl.startsWith('https') ? <Lock className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" /> : <Globe className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" />}
                <span className="text-[10px] font-mono text-slate-400 truncate">{displayUrl || 'No URL — add a Visit step'}</span>
                {running && <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin flex-shrink-0 ml-auto" />}
              </div>
              <span className="text-[10px] text-slate-600 capitalize flex-shrink-0">{state.generatorOptions.browserType}</span>
            </div>
            {/* Visualizer */}
            <div className="flex-1 overflow-hidden">
              <ActionVisualizer
                url={displayUrl}
                running={running}
                status={status}
                activeAction={activeAction}
                activeLabel={activeLabel}
                activeValue={activeValue}
                stepIdx={activeStepIdx}
                totalSteps={enabledSteps.length}
                steps={currentFlow.steps}
                activeStepIdx={activeStepIdx}
                screenshotData={screenshotData}
                prevScreenshotData={prevScreenshotData}
              />
            </div>
          </div>
        )}
      </div>

      {/* Result banner */}
      {(status==='passed'||status==='failed') && (
        <div className={`flex items-center gap-3 px-4 py-2.5 border-t flex-shrink-0 ${status==='passed'?'bg-emerald-500/10 border-emerald-500/20':'bg-red-500/10 border-red-500/20'}`}>
          {status==='passed' ? <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" /> : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
          <div className="flex-1">
            <p className={`text-sm font-semibold ${status==='passed'?'text-emerald-400':'text-red-400'}`}>
              {status==='passed'?'All tests passed!':'Test run failed'}
            </p>
            <p className="text-xs text-slate-500">
              {status==='passed'
                ? `${enabledSteps.length} step${enabledSteps.length!==1?'s':''} completed successfully.`
                : 'Check terminal log for error details.'}
            </p>
          </div>
          <div className="flex gap-2">
            {status==='failed' && (
              <button className="btn-secondary text-xs" onClick={handleGenAndRun}>
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
            <button className="btn-ghost text-xs" onClick={handleClear}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
