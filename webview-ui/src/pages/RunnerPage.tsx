import { useEffect, useRef, useState } from 'react';
import { useFlow } from '../context/FlowContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVSCodeListener } from '../hooks/useVSCode';
import {
  Play, Terminal, CheckCircle, XCircle, Clock, Zap,
  RefreshCw, Settings, Globe, Eye, EyeOff, MousePointer,
  Lock, Loader, ChevronLeft, ChevronRight, RotateCw, AlertCircle
} from 'lucide-react';

interface RunLog { time: string; message: string; type: 'info'|'success'|'error'|'step'; }

const ACTION_COLOR: Record<string,string> = {
  visit:'#38bdf8', click:'#818cf8', dblclick:'#818cf8',
  fill:'#a78bfa', type:'#a78bfa', assert:'#34d399',
  hover:'#22d3ee', wait:'#fbbf24', screenshot:'#fb7185',
  default:'#6366f1',
};
const ACTION_LABEL: Record<string,string> = {
  visit:'Navigating to', click:'Clicking', dblclick:'Double-clicking',
  fill:'Filling input', type:'Typing', assert:'Asserting',
  hover:'Hovering', wait:'Waiting', screenshot:'Taking screenshot',
  check:'Checking', uncheck:'Unchecking', scroll:'Scrolling',
  press:'Pressing key', reload:'Reloading', goback:'Going back',
  goforward:'Going forward', default:'Executing',
};

/** Add https:// if missing, return empty string for blank/placeholder URLs */
function normalizeUrl(raw: string): string {
  if (!raw || raw === 'https://' || raw === 'http://') return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

const DEMO_PAGE = '/demo.html';

function SimBrowser({
  url, running, status, activeAction, activeLabel, stepIdx, totalSteps,
  iframeRef, onLoad, scrollOffset, scrollDir,
}: {
  url: string; running: boolean; status: string;
  activeAction: string; activeLabel: string;
  stepIdx: number|null; totalSteps: number;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  onLoad?: () => void;
  scrollOffset?: number;
  scrollDir?: 'up'|'down'|null;
}) {
  const color      = ACTION_COLOR[activeAction] ?? ACTION_COLOR.default;
  const actionText = ACTION_LABEL[activeAction] ?? ACTION_LABEL.default;
  const progress   = stepIdx !== null ? ((stepIdx + 1) / totalSteps) * 100 : 0;
  const offset     = scrollOffset ?? 0;
  const SCROLL_BUFFER = 2000;

  // Use demo page when no URL is configured — it's same-origin so real interactions work
  const isDemo     = !url;
  const effectiveUrl = url || DEMO_PAGE;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 relative overflow-hidden bg-white">

        {/* ── Demo Mode badge ── */}
        {isDemo && !running && (
          <div className="absolute top-2 right-2 z-30 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-indigo-600/90 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full shadow-lg backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-200 animate-pulse" />
              Demo page — interactions work here
            </div>
          </div>
        )}

        {/* ── Iframe — always rendered (demo or real site) ── */}
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            ref={iframeRef}
            key={effectiveUrl}
            src={effectiveUrl}
            className="absolute top-0 left-0 w-full border-0"
            style={{
              height: `calc(100% + ${SCROLL_BUFFER}px)`,
              transform: `translateY(-${Math.max(0, Math.min(offset, SCROLL_BUFFER))}px)`,
              transition: activeAction === 'scroll' ? 'transform 0.85s cubic-bezier(0.4,0,0.2,1)' : 'transform 0.3s ease-out',
              willChange: 'transform',
            }}
            title="Browser Preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-pointer-lock allow-top-navigation-by-user-activation"
            allow="autoplay; fullscreen"
            onLoad={onLoad}
          />
        </div>

        {/* ── Step action banner (top, non-blocking) ── */}
        {running && activeAction && (
          <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-2 text-white text-xs font-semibold shadow-lg"
              style={{ background:`${color}ee` }}>
              {activeAction === 'visit'
                ? <Loader className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                : activeAction === 'click' || activeAction === 'dblclick'
                  ? <MousePointer className="w-3.5 h-3.5 flex-shrink-0" />
                  : <div className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
              }
              <span className="flex-shrink-0">{actionText}</span>
              <span className="opacity-80 font-normal truncate">— {activeLabel}</span>
              <span className="ml-auto opacity-70 flex-shrink-0 tabular-nums">
                {stepIdx!==null?`${stepIdx+1}/${totalSteps}`:''}
              </span>
            </div>
          </div>
        )}

        {/* ── Click ripple overlay (non-blocking, pointer-events-none) ── */}
        {running && (activeAction === 'click' || activeAction === 'dblclick') && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute" style={{ top: '45%', left: '40%' }}>
              <div className="w-8 h-8 rounded-full border-4 animate-ping opacity-60" style={{ borderColor: color }} />
              <div className="absolute top-1 left-1 w-6 h-6 rounded-full border-2 animate-ping opacity-40" style={{ borderColor: color, animationDelay: '0.1s' }} />
            </div>
          </div>
        )}

        {/* ── Assert highlight (non-blocking) ── */}
        {running && activeAction === 'assert' && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute border-2 rounded-lg"
              style={{ top:'20%', left:'8%', right:'8%', bottom:'45%', borderColor: color, boxShadow:`0 0 20px ${color}40` }}>
              <div className="absolute inset-0 rounded-lg opacity-5" style={{ background: color }} />
            </div>
          </div>
        )}

        {/* ── Scroll indicator — direction-aware track + thumb ── */}
        {running && activeAction === 'scroll' && (
          <div className="absolute right-3 top-8 bottom-8 w-2 pointer-events-none z-10 flex flex-col items-center gap-1">
            {/* Scrollbar track */}
            <div className="flex-1 w-1.5 bg-gray-300/40 rounded-full relative overflow-hidden">
              <div
                className="absolute left-0 right-0 rounded-full"
                style={{
                  height: '30%',
                  background: color,
                  top: scrollDir === 'up' ? '10%' : '60%',
                  transition: 'top 0.85s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: `0 0 8px ${color}80`,
                }}
              />
            </div>
            {/* Arrow hint */}
            <div className="text-[9px] font-bold" style={{ color }}>
              {scrollDir === 'up' ? '↑' : '↓'}
            </div>
          </div>
        )}

        {/* ── Progress bar (bottom, thin) ── */}
        {running && (
          <div className="absolute bottom-0 left-0 right-0 h-1 z-20 pointer-events-none">
            <div className="h-full transition-all duration-700 ease-out"
              style={{ width:`${progress}%`, background:`linear-gradient(90deg, #6366f1, ${color})` }} />
          </div>
        )}

        {/* ── Pass banner (top-right badge, NOT full screen) ── */}
        {status === 'passed' && (
          <div className="absolute top-10 right-3 z-30 pointer-events-none">
            <div className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-emerald-400/50">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold leading-tight">All Tests Passed!</p>
                <p className="text-[11px] opacity-80">{totalSteps} step{totalSteps!==1?'s':''} completed</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Fail banner (top-right badge, NOT full screen) ── */}
        {status === 'failed' && (
          <div className="absolute top-10 right-3 z-30 pointer-events-none">
            <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-red-400/50">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold leading-tight">Test Failed</p>
                <p className="text-[11px] opacity-80">Check terminal for details</p>
              </div>
            </div>
          </div>
        )}
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
  const [displayUrl, setDisplayUrl]           = useState('');
  const [urlInput, setUrlInput]               = useState('');
  const [iframeLoading, setIframeLoading]     = useState(false);
  const [iframeScrollOffset, setIframeScrollOffset] = useState(0);
  const [scrollDir, setScrollDir]             = useState<'up'|'down'|null>(null);
  const logEndRef    = useRef<HTMLDivElement>(null);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const autoRunFired = useRef(false);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // Compute initial display URL: baseUrl → first visit step url
  useEffect(() => {
    const base = normalizeUrl(currentFlow.baseUrl);
    if (base) { setDisplayUrl(base); setUrlInput(base); return; }
    const visitStep = currentFlow.steps.find(s => s.action === 'visit' && s.url);
    if (visitStep?.url) {
      const u = normalizeUrl(visitStep.url);
      setDisplayUrl(u);
      setUrlInput(u);
    }
  }, [currentFlow.baseUrl, currentFlow.steps]);

  // Keep urlInput in sync when displayUrl changes during test run
  useEffect(() => { if (displayUrl) setUrlInput(displayUrl); }, [displayUrl]);

  const navigateTo = (raw: string) => {
    const u = normalizeUrl(raw.trim()) || raw.trim();
    if (!u) return;
    setDisplayUrl(u);
    setUrlInput(u);
    setIframeLoading(true);
  };

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

  // ── Act on each step in the preview ───────────────────────────────────────
  useVSCodeListener('TEST_RUN_STEP', (payload) => {
    const step = payload as any;
    const iframeWin = iframeRef.current?.contentWindow as any;

    // ── Visit: reset scroll ──────────────────────────────────────────────
    if (step.action === 'visit') {
      setIframeScrollOffset(0);
      setScrollDir(null);
      return;
    }

    // ── Scroll ──────────────────────────────────────────────────────────
    if (step.action === 'scroll') {
      const isElement = step.scrollType === 'element';
      const delta     = isElement ? 400 : (step.scrollY ?? 500);
      const dir: 'up'|'down' = delta < 0 ? 'up' : 'down';
      setScrollDir(dir);
      setIframeScrollOffset(prev => Math.max(0, prev + delta));
      try {
        const cw = iframeRef.current?.contentWindow;
        if (cw) {
          if (isElement && step.selector) {
            (cw as any).document.querySelector(step.selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            cw.scrollBy({ top: delta, behavior: 'smooth' } as ScrollToOptions);
          }
        }
      } catch { /* cross-origin — CSS transform handles it */ }
      return;
    }

    // ── All other actions — try demo page API first, fallback to raw DOM ─
    try {
      switch (step.action) {
        case 'click':
        case 'dblclick':
        case 'rightclick':
          if (iframeWin?.pwHighlight) {
            iframeWin.pwHighlight(step.selector || '[data-testid="login-btn"]', 'click');
          } else {
            const el = iframeRef.current?.contentDocument?.querySelector(step.selector ?? '');
            if (el) (el as HTMLElement).click();
          }
          break;

        case 'hover':
          if (iframeWin?.pwHighlight) {
            iframeWin.pwHighlight(step.selector || 'button', 'hover');
          }
          break;

        case 'fill':
        case 'type':
          if (iframeWin?.pwFill) {
            iframeWin.pwFill(step.selector || 'input', step.value ?? '');
          } else {
            const el = iframeRef.current?.contentDocument?.querySelector(step.selector ?? '') as HTMLInputElement | null;
            if (el) { el.focus(); el.value = step.value ?? ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
          }
          break;

        case 'clear':
          if (iframeWin?.pwClear) {
            iframeWin.pwClear(step.selector || 'input');
          } else {
            const el = iframeRef.current?.contentDocument?.querySelector(step.selector ?? '') as HTMLInputElement | null;
            if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
          }
          break;

        case 'select':
          if (iframeWin?.pwSelect) {
            iframeWin.pwSelect(step.selector || 'select', step.value ?? '');
          } else {
            const el = iframeRef.current?.contentDocument?.querySelector(step.selector ?? '') as HTMLSelectElement | null;
            if (el) { el.value = step.value ?? ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }
          break;

        case 'check':
          if (iframeWin?.pwCheck) {
            iframeWin.pwCheck(step.selector || 'input[type="checkbox"]', true);
          } else {
            const el = iframeRef.current?.contentDocument?.querySelector(step.selector ?? '') as HTMLInputElement | null;
            if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }
          break;

        case 'uncheck':
          if (iframeWin?.pwCheck) {
            iframeWin.pwCheck(step.selector || 'input[type="checkbox"]', false);
          } else {
            const el = iframeRef.current?.contentDocument?.querySelector(step.selector ?? '') as HTMLInputElement | null;
            if (el) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
          }
          break;

        case 'focus':
          if (iframeWin?.pwHighlight) {
            iframeWin.pwHighlight(step.selector || 'input', 'hover');
          }
          break;

        default:
          // Visual-only feedback via overlays (assert, wait, screenshot, etc.)
          break;
      }
    } catch { /* cross-origin site — overlays still show */ }
  });

  useVSCodeListener('TEST_RUN_COMPLETE', (payload) => {
    const p = payload as { passed: boolean };
    setRunning(false);
    setStatus(p.passed ? 'passed' : 'failed');
    setActiveStepIdx(null);
    setActiveAction('');
    setActiveLabel('');
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
    pushLog(`▶  Starting: "${currentFlow.name}"`, 'info');
    pushLog(`Steps: ${currentFlow.steps.filter(s=>s.enabled).length} enabled of ${currentFlow.steps.length} total`, 'info');
    pushLog('Generating test file…', 'info');
    generateTest();
    setTimeout(() => { pushLog('Dispatching to Playwright runner…', 'info'); runTest(); }, 700);
  };

  const handleClear = () => {
    setLogs([]); setStatus('idle'); setRunning(false);
    setActiveStepIdx(null); setActiveAction(''); setActiveLabel('');
    setIframeScrollOffset(0); setScrollDir(null);
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

        {/* Browser preview */}
        {showPreview && (
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#0d1117]">
            {/* Browser chrome */}
            <div className="flex flex-col border-b border-slate-800 bg-[#1a1f2e] flex-shrink-0">
              {/* Tab bar */}
              <div className="flex items-center gap-2 px-3 pt-1.5">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-3 h-3 rounded-full bg-red-400/70" />
                  <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400/70" />
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <div className="flex items-center gap-1.5 bg-[#0d1117] border border-slate-700 border-b-0 rounded-t-lg px-4 py-1.5 text-[10px] text-slate-300">
                    {iframeLoading
                      ? <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin" />
                      : <Globe className="w-2.5 h-2.5 text-slate-400" />
                    }
                    <span className="max-w-28 truncate ml-1">{displayUrl ? new URL(displayUrl.startsWith('http') ? displayUrl : 'https://'+displayUrl).hostname : (currentFlow.name||'New Tab')}</span>
                  </div>
                </div>
              </div>
              {/* Navigation bar */}
              <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
                {/* Back / Forward / Refresh */}
                <button
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  onClick={() => iframeRef.current?.contentWindow?.history.back()}
                  title="Go back"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  onClick={() => iframeRef.current?.contentWindow?.history.forward()}
                  title="Go forward"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  onClick={() => { setIframeLoading(true); if(iframeRef.current) iframeRef.current.src = iframeRef.current.src; }}
                  title="Reload page"
                >
                  {iframeLoading
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    : <RotateCw className="w-3.5 h-3.5" />
                  }
                </button>
                {/* Editable URL bar */}
                <form
                  className="flex-1 flex items-center gap-1.5 bg-[#0d1117] border border-slate-700 hover:border-slate-500 focus-within:border-brand-500 rounded-full px-3 py-1 min-w-0 transition-colors"
                  onSubmit={e => { e.preventDefault(); navigateTo(urlInput); }}
                >
                  {displayUrl.startsWith('https') ? (
                    <Lock className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                  ) : displayUrl ? (
                    <AlertCircle className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                  ) : (
                    <Globe className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" />
                  )}
                  <input
                    className="flex-1 bg-transparent text-[11px] text-slate-200 font-mono outline-none placeholder:text-slate-600 min-w-0"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onFocus={e => e.target.select()}
                    placeholder="Enter URL and press Enter…"
                    spellCheck={false}
                  />
                  {running && <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin flex-shrink-0" />}
                </form>
                <div className="text-[10px] text-slate-600 capitalize flex-shrink-0 pl-1">{state.generatorOptions.browserType}</div>
              </div>
            </div>

            {/* Simulated page */}
            <div className="flex-1 overflow-hidden">
              <SimBrowser
                url={displayUrl}
                running={running}
                status={status}
                activeAction={activeAction}
                activeLabel={activeLabel}
                stepIdx={activeStepIdx}
                totalSteps={enabledSteps.length}
                iframeRef={iframeRef}
                onLoad={() => setIframeLoading(false)}
                scrollOffset={iframeScrollOffset}
                scrollDir={scrollDir}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-1 border-t border-slate-800 bg-[#1a1f2e] flex-shrink-0 text-[10px] text-slate-600">
              <span>{running ? '● Executing test…' : status==='passed' ? '● Test passed' : status==='failed' ? '● Test failed' : '○ Idle'}</span>
              <span>Scroll &amp; click inside the preview to interact · <span className="capitalize">{state.generatorOptions.browserType}</span></span>
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
