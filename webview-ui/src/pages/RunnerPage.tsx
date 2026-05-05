import { useEffect, useRef, useState } from 'react';
import { useFlow } from '../context/FlowContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVSCodeListener } from '../hooks/useVSCode';
import {
  Play, Terminal, CheckCircle, XCircle, Clock, Zap,
  RefreshCw, Settings, Globe, Eye, EyeOff, MousePointer,
  Lock, Loader
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

function SimBrowser({
  url, running, status, activeAction, activeLabel, stepIdx, totalSteps,
}: {
  url: string; running: boolean; status: string;
  activeAction: string; activeLabel: string;
  stepIdx: number|null; totalSteps: number;
}) {
  const color      = ACTION_COLOR[activeAction] ?? ACTION_COLOR.default;
  const actionText = ACTION_LABEL[activeAction] ?? ACTION_LABEL.default;
  const progress   = stepIdx !== null ? ((stepIdx + 1) / totalSteps) * 100 : 0;
  const hasUrl     = !!url;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 relative overflow-hidden bg-white">

        {/* ── Live Website Iframe ── */}
        {hasUrl && (
          <iframe
            key={url}
            src={url}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            title="Live Browser Preview"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        )}

        {/* No-URL placeholder */}
        {!hasUrl && (
          <div className="absolute inset-0 bg-gray-50 flex flex-col pointer-events-none select-none">
            {/* Skeleton page */}
            <div className="p-5 flex flex-col gap-3 flex-1">
              <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
                <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center"><div className="w-4 h-4 rounded-full bg-indigo-400" /></div>
                <div className="h-3 w-28 bg-gray-300 rounded" />
                <div className="ml-auto flex gap-2">
                  <div className="h-2.5 w-12 bg-gray-200 rounded" />
                  <div className="h-2.5 w-12 bg-gray-200 rounded" />
                  <div className="h-2.5 w-12 bg-gray-200 rounded" />
                </div>
              </div>
              <div className="flex gap-4 mt-2">
                <div className="flex-1 space-y-2">
                  <div className="h-6 w-3/4 bg-gray-200 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-5/6 bg-gray-100 rounded" />
                  <div className="h-3 w-4/6 bg-gray-100 rounded" />
                  <div className="flex gap-2 mt-3">
                    <div className="h-8 w-24 bg-indigo-200 rounded" />
                    <div className="h-8 w-24 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="w-36 h-28 bg-indigo-50 rounded-xl flex-shrink-0" />
              </div>
              <div className="flex gap-3 mt-1">
                {[1,2,3].map(i=>(
                  <div key={i} className="flex-1 h-20 bg-white rounded-lg border border-gray-200 p-3 space-y-1.5">
                    <div className="h-2.5 w-1/2 bg-gray-200 rounded"/>
                    <div className="h-2 w-full bg-gray-100 rounded"/>
                    <div className="h-2 w-3/4 bg-gray-100 rounded"/>
                  </div>
                ))}
              </div>
            </div>
            {/* Centered message */}
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center">
                <Globe className="w-7 h-7 text-indigo-300" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No URL configured</p>
              <p className="text-xs text-gray-400 text-center max-w-52">
                Add a <b>Visit URL</b> step and set its URL, or set a Base URL in the Builder toolbar.
              </p>
            </div>
          </div>
        )}

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

        {/* ── Scroll indicator (non-blocking) ── */}
        {running && activeAction === 'scroll' && (
          <div className="absolute right-3 top-1/4 bottom-1/4 w-1.5 bg-gray-300/60 rounded-full pointer-events-none z-10">
            <div className="absolute w-full rounded-full animate-bounce" style={{ height:'30%', top:'30%', background: color }} />
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
  const [displayUrl, setDisplayUrl]       = useState('');
  const logEndRef    = useRef<HTMLDivElement>(null);
  const autoRunFired = useRef(false);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // Compute initial display URL: baseUrl → first visit step url
  useEffect(() => {
    const base = normalizeUrl(currentFlow.baseUrl);
    if (base) { setDisplayUrl(base); return; }
    const visitStep = currentFlow.steps.find(s => s.action === 'visit' && s.url);
    if (visitStep?.url) setDisplayUrl(normalizeUrl(visitStep.url));
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

  useVSCodeListener('TEST_RUN_COMPLETE', (payload) => {
    const p = payload as { passed: boolean };
    setRunning(false);
    setStatus(p.passed ? 'passed' : 'failed');
    setActiveStepIdx(null);
    setActiveAction('');
    setActiveLabel('');
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
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-[#1a1f2e] flex-shrink-0">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-red-400/70" />
                <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/70" />
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 bg-white/5 border border-slate-700 rounded-t px-3 py-1 text-[10px] text-slate-300">
                  <Globe className="w-2.5 h-2.5" />
                  <span className="max-w-20 truncate">{currentFlow.name||'New Tab'}</span>
                </div>
              </div>
              {/* URL bar */}
              <div className="flex-1 flex items-center gap-1.5 bg-[#0d1117] border border-slate-700 rounded px-2.5 py-1 min-w-0">
                <Lock className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                {running && <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin flex-shrink-0" />}
                <span className="text-[11px] text-slate-300 truncate font-mono">
                  {displayUrl || 'about:blank'}
                </span>
              </div>
              <div className="text-[10px] text-slate-600 capitalize flex-shrink-0">{state.generatorOptions.browserType}</div>
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
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-1 border-t border-slate-800 bg-[#1a1f2e] flex-shrink-0 text-[10px] text-slate-600">
              <span>{running ? '● Executing test…' : status==='passed' ? '● Test passed' : status==='failed' ? '● Test failed' : '○ Idle'}</span>
              <span className="capitalize">{state.generatorOptions.browserType} · {state.generatorOptions.headless?'headless':'headed'}</span>
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
