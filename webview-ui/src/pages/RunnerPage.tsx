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

/* ── ScriptActionPreview — live animated visualization of what the script is doing ── */
function ScriptActionPreview({ running, status, activeAction, activeLabel, activeValue,
  stepIdx, totalSteps, steps, activeStepIdx, canvasRef, hasLiveFrame }: {
  running: boolean; status: string;
  activeAction: string; activeLabel: string; activeValue?: string;
  stepIdx: number|null; totalSteps: number;
  steps: TestStep[]; activeStepIdx: number|null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  hasLiveFrame: boolean;
}) {
  const color   = ACTION_COLOR[activeAction] ?? ACTION_COLOR.default;
  const actText = ACTION_LABEL[activeAction] ?? ACTION_LABEL.default;
  const enabled = steps.filter(s => s.enabled !== false);
  const currentNum = stepIdx !== null ? stepIdx + 1 : 0;
  const pct = totalSteps > 0 ? (currentNum / totalSteps) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-[#0b0f18]">
      {/* ── Main visualization ── */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden relative px-6 py-6">
        {/* Dot-grid background */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

        {/* Live Browser Canvas */}
        <canvas 
          ref={canvasRef} 
          width={1280} 
          height={720} 
          className={`absolute inset-0 w-full h-full object-contain z-0 transition-opacity duration-300 ${hasLiveFrame ? 'opacity-100' : 'opacity-0 hidden'}`} 
        />

        {/* ─── RUNNING ─── */}
        {running && !hasLiveFrame && (
          <div className="relative z-10 flex flex-col items-center gap-5 text-center w-full max-w-xs">

            {/* Progress bar */}
            <div className="w-full h-0.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
            </div>

            {/* Step counter */}
            <p className="text-[10px] font-mono tracking-widest text-slate-600 -mb-1">
              STEP {currentNum} / {totalSteps}
            </p>

            {/* Animated icon ring */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-36 h-36 rounded-full animate-ping opacity-10"
                style={{ background: color }} />
              <div className="absolute w-28 h-28 rounded-full opacity-20 animate-pulse"
                style={{ background: color }} />
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-2xl"
                style={{
                  background: `${color}14`,
                  border: `2px solid ${color}50`,
                  boxShadow: `0 0 48px ${color}25, 0 0 80px ${color}10`,
                }}>
                {(() => {
                  const Icon = ACTION_ICON[activeAction] ?? ACTION_ICON.default;
                  return <Icon className="w-10 h-10" style={{ color }} />;
                })()}
              </div>
            </div>

            {/* Action description */}
            <div className="space-y-1.5">
              <p className="text-2xl font-bold text-white tracking-wide">{actText}</p>
              {activeLabel && (
                <p className="text-sm text-slate-400 leading-snug max-w-[240px] break-words" title={activeLabel}>
                  {activeLabel.length > 60 ? activeLabel.slice(0, 57) + '…' : activeLabel}
                </p>
              )}
              {activeValue && (
                <div className="inline-block mt-1 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 max-w-[240px] truncate" title={activeValue}>
                  "{activeValue}"
                </div>
              )}
            </div>

            {/* Live badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
              style={{ borderColor: `${color}40`, background: `${color}10` }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color }}>Executing</span>
            </div>
          </div>
        )}

        {/* ─── RUNNING (With Live Frame Overlay) ─── */}
        {running && hasLiveFrame && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 text-center w-full max-w-sm bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700/80 shadow-2xl">
             <div className="flex items-center gap-3 w-full">
               <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                 style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
                 {(() => {
                    const Icon = ACTION_ICON[activeAction] ?? ACTION_ICON.default;
                    return <Icon className="w-5 h-5" style={{ color }} />;
                  })()}
               </div>
               <div className="flex-1 text-left min-w-0">
                 <div className="flex justify-between items-center mb-0.5">
                   <p className="text-sm font-bold text-white tracking-wide truncate">{actText}</p>
                   <span className="text-[10px] font-mono text-slate-400">{currentNum}/{totalSteps}</span>
                 </div>
                 {activeLabel && (
                    <p className="text-xs text-slate-400 truncate" title={activeLabel}>
                      {activeLabel}
                    </p>
                  )}
               </div>
             </div>
             {/* Progress bar */}
             <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
              <div className="h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
            </div>
          </div>
        )}

        {/* ─── IDLE ─── */}
        {!running && status === 'idle' && !hasLiveFrame && (
          <div className="z-10 w-full max-w-sm">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
                <Play className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-white">Ready to Run</p>
              <p className="text-xs text-slate-600 mt-1">
                {enabled.length} step{enabled.length !== 1 ? 's' : ''} queued
              </p>
            </div>

            {/* Step pipeline preview */}
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {enabled.slice(0, 10).map((step, i) => {
                const c = ACTION_COLOR[step.action] ?? ACTION_COLOR.default;
                const Icon = ACTION_ICON[step.action] ?? ACTION_ICON.default;
                return (
                  <div key={step.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition-colors">
                    <span className="text-[9px] font-mono text-slate-700 w-4 text-right flex-shrink-0">{i + 1}</span>
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: `${c}20` }}>
                      <Icon className="w-3 h-3" style={{ color: c }} />
                    </div>
                    <span className="text-[11px] text-slate-400 truncate flex-1">{step.label}</span>
                    <span className="text-[9px] font-mono flex-shrink-0 px-1 py-0.5 rounded"
                      style={{ background: `${c}15`, color: c }}>{step.action}</span>
                  </div>
                );
              })}
              {enabled.length > 10 && (
                <p className="text-center text-[10px] text-slate-700 py-1">+{enabled.length - 10} more steps</p>
              )}
              {enabled.length === 0 && (
                <p className="text-center text-[11px] text-slate-600 py-6">No steps — add steps in Builder first</p>
              )}
            </div>
          </div>
        )}

        {/* ─── PASSED ─── */}
        {!running && status === 'passed' && (
          <div className={`z-10 flex flex-col items-center gap-5 text-center ${hasLiveFrame ? 'absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md p-6 rounded-2xl border border-slate-700/80 shadow-2xl' : ''}`}>
            <div className={`relative ${hasLiveFrame ? 'hidden' : ''}`}>
              <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
              <div className="relative w-24 h-24 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center"
                style={{ boxShadow: '0 0 48px #34d39925' }}>
                <CheckCircle className="w-10 h-10 text-emerald-400" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">All Passed!</p>
              <p className={`text-sm mt-1 ${hasLiveFrame ? 'text-slate-300' : 'text-slate-500'}`}>{totalSteps} step{totalSteps !== 1 ? 's' : ''} completed</p>
            </div>
            {/* Compact step badges */}
            <div className={`flex flex-wrap gap-1.5 justify-center ${hasLiveFrame ? 'max-w-[400px]' : 'max-w-[280px]'}`}>
              {enabled.map((step) => {
                const c = ACTION_COLOR[step.action] ?? ACTION_COLOR.default;
                return (
                  <span key={step.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono"
                    style={{ background: `${c}15`, color: c, border: `1px solid ${c}30` }}>
                    ✓ {step.action}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── FAILED ─── */}
        {!running && status === 'failed' && (
          <div className={`z-10 flex flex-col items-center gap-5 text-center ${hasLiveFrame ? 'absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md p-6 rounded-2xl border border-slate-700/80 shadow-2xl' : ''}`}>
            <div className={`w-24 h-24 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center ${hasLiveFrame ? 'hidden' : ''}`}
              style={{ boxShadow: '0 0 48px #f8717125' }}>
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">Test Failed</p>
              <p className={`text-sm mt-1 ${hasLiveFrame ? 'text-slate-300' : 'text-slate-500'}`}>Check the terminal log for details</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Step timeline ── */}
      <div className="border-t border-slate-800 overflow-y-auto flex-shrink-0" style={{ maxHeight: '152px' }}>
        <div className="px-2 py-1.5 space-y-0.5">
          {enabled.map((step, i) => {
            const done   = activeStepIdx !== null && i < activeStepIdx;
            const active = i === activeStepIdx;
            const c = ACTION_COLOR[step.action] ?? ACTION_COLOR.default;
            const Icon = ACTION_ICON[step.action] ?? ACTION_ICON.default;
            return (
              <div key={step.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-300 ${active ? 'border' : 'border border-transparent'}`}
                style={active ? { background: `${c}12`, borderColor: `${c}40` } : {}}>
                <span className="flex-shrink-0 w-4 text-center text-xs">
                  {done
                    ? <span className="text-emerald-400">✓</span>
                    : active
                      ? <RefreshCw className="w-3 h-3 animate-spin inline" style={{ color: c }} />
                      : <span className="text-slate-700">○</span>}
                </span>
                <span className={`font-mono text-[10px] w-5 text-right flex-shrink-0 ${active ? 'text-white' : 'text-slate-700'}`}>{i + 1}</span>
                <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={active || done ? { background: `${c}20` } : {}}>
                  <Icon className="w-2.5 h-2.5" style={{ color: active || done ? c : '#334155' }} />
                </div>
                <span className={`flex-1 truncate text-[11px] ${done ? 'text-slate-600' : active ? 'text-white font-medium' : 'text-slate-600'}`}>
                  {step.label}
                </span>
                <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded font-mono"
                  style={active ? { background: `${c}25`, color: c } : { color: '#334155' }}>
                  {step.action}
                </span>
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
  const [hasLiveFrame, setHasLiveFrame]     = useState(false);

  const logEndRef    = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef(new Image());
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
    const data = payload as { stepIdx: number; action: string; phase: string; screenshotBase64: string };
    if (data.screenshotBase64) {
      setScreenshotData(data.screenshotBase64);
      const img = imgRef.current;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 1280, 720);
          setHasLiveFrame(true);
        }
      };
      img.src = `data:image/jpeg;base64,${data.screenshotBase64}`;
    }
  });

  useVSCodeListener('TEST_RUN_FRAME', (payload) => {
    const data = payload as { frameBase64: string };
    if (!data.frameBase64) return;
    const img = imgRef.current;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 1280, 720);
        setHasLiveFrame(true);
      }
    };
    img.src = `data:image/jpeg;base64,${data.frameBase64}`;
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
    setScreenshotData(null); setHasLiveFrame(false);
    const canvas = canvasRef.current;
    if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, 1280, 720); }
    pushLog(`▶  Starting: "${currentFlow.name}"`, 'info');
    pushLog(`Steps: ${currentFlow.steps.filter(s=>s.enabled).length} enabled of ${currentFlow.steps.length} total`, 'info');
    pushLog('Generating test file…', 'info');
    generateTest();
    setTimeout(() => { pushLog('Dispatching to Playwright runner…', 'info'); runTest(); }, 700);
  };

  const handleClear = () => {
    setLogs([]); setStatus('idle'); setRunning(false);
    setActiveStepIdx(null); setActiveAction(''); setActiveLabel(''); setActiveValue('');
    setScrollDir(null); setScreenshotData(null); setHasLiveFrame(false);
    const canvas = canvasRef.current;
    if (canvas) { const ctx = canvas.getContext('2d'); ctx?.clearRect(0, 0, 1280, 720); }
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

        {/* Script Action Preview */}
        {showPreview && (
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 border-l border-slate-800">
            {/* Panel header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] border-b border-slate-800 flex-shrink-0">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] font-semibold text-slate-300 tracking-wide">Script Action Preview</span>
              {running && (
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-amber-400">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  Running
                </span>
              )}
              {!running && status === 'passed' && (
                <span className="ml-auto text-[10px] font-mono text-emerald-400">● Passed</span>
              )}
              {!running && status === 'failed' && (
                <span className="ml-auto text-[10px] font-mono text-red-400">● Failed</span>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <ScriptActionPreview
                running={running}
                status={status}
                activeAction={activeAction}
                activeLabel={activeLabel}
                activeValue={activeValue}
                stepIdx={activeStepIdx}
                totalSteps={enabledSteps.length}
                steps={currentFlow.steps}
                activeStepIdx={activeStepIdx}
                canvasRef={canvasRef}
                hasLiveFrame={hasLiveFrame}
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
