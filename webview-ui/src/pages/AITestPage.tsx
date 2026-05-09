import { useRef, useState, useCallback } from 'react';
import {
  Play, Square, Globe, Lock, Target, ChevronDown, ChevronUp,
  CheckCircle, XCircle, RefreshCw, Zap, AlertTriangle,
  Camera, Route, Brain, BarChart3, FileText, Eye, Code2, Copy, X
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface LogEntry { level: 'info'|'success'|'error'|'step'; msg: string; ts: string; }
interface Screenshot { data: string; url: string; label: string; passed: boolean; }

interface PageAction {
  url: string;
  title: string;
  actions: { tool?: string; type?: string; selector?: string; url?: string; text?: string; passed: boolean; error?: string | null }[];
  assertions: { selector?: string; expected?: string; passed: boolean }[];
}

interface Report {
  totalPages: number; testedPages: number;
  totalActions: number; passed: number; failed: number;
  assertPassed: number; assertFailed: number; coverage: string;
  visitedPages: string[]; discoveredRoutes: string[];
  issues: { page: string; action?: string; issue: string }[];
  screenshotCount: number;
  stopReason?: string;
  pageActions: PageAction[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const LOG_COLOR: Record<LogEntry['level'], string> = {
  info: 'text-slate-400', success: 'text-emerald-400',
  error: 'text-red-400',  step: 'text-indigo-300',
};
const LOG_PFX: Record<LogEntry['level'], string> = {
  info: 'ℹ', success: '✓', error: '✗', step: '→',
};

// ── Playwright code generator ─────────────────────────────────────────────────
function generatePlaywrightCode(report: Report, baseUrl: string, goal: string): string {
  const safeName = (s: string) => s.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'Page';
  let origin = '';
  try { origin = new URL(baseUrl).origin; } catch { origin = baseUrl; }

  const lines: string[] = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `/**`,
    ` * AI-Generated Playwright Test Suite`,
    ` * Goal : ${goal}`,
    ` * URL  : ${baseUrl}`,
    ` * Pages: ${report.testedPages} tested, ${report.coverage} pass rate`,
    ` * Generated: ${new Date().toISOString()}`,
    ` */`,
    ``,
    `test.use({ baseURL: '${origin}' });`,
    ``,
    `test.describe('AI Test Suite — ${origin}', () => {`,
  ];

  for (const pg of (report.pageActions || [])) {
    let pathname = '/';
    try { pathname = new URL(pg.url).pathname || '/'; } catch { pathname = pg.url; }

    lines.push(`  test('${safeName(pg.title || pathname)}', async ({ page }) => {`);
    lines.push(`    await page.goto('${pathname}');`);
    lines.push(`    await page.waitForLoadState('domcontentloaded');`);

    for (const act of pg.actions) {
      if (!act.passed) {
        const label = `${act.tool || act.type} ${act.selector || act.url || ''}`.trim();
        lines.push(`    // ✗ FAILED: ${label}${act.error ? ` — ${act.error}` : ''}`);
        continue;
      }
      const tool = act.tool || act.type || '';
      const sel  = act.selector || '';
      const text = act.text || '';
      const url  = act.url || '';

      switch (tool) {
        case 'fill': case 'type': case 'input':
          lines.push(`    await page.fill(${JSON.stringify(sel)}, ${JSON.stringify(text)});`);
          break;
        case 'click': case 'press': case 'tap':
          lines.push(`    await page.click(${JSON.stringify(sel)});`);
          break;
        case 'check':
          lines.push(`    await page.check(${JSON.stringify(sel)});`);
          break;
        case 'dblclick':
          lines.push(`    await page.dblclick(${JSON.stringify(sel)});`);
          break;
        case 'hover':
          lines.push(`    await page.hover(${JSON.stringify(sel)});`);
          break;
        case 'select':
          lines.push(`    await page.selectOption(${JSON.stringify(sel)}, ${JSON.stringify(text)});`);
          break;
        case 'navigate': case 'goto': case 'visit':
          lines.push(`    await page.goto(${JSON.stringify(url || sel)});`);
          break;
        case 'scroll':
          lines.push(`    await page.evaluate(() => window.scrollBy(0, 300));`);
          break;
        case 'wait': case 'sleep':
          lines.push(`    await page.waitForTimeout(1000);`);
          break;
        default:
          if (sel) lines.push(`    await page.click(${JSON.stringify(sel)});`);
      }
    }

    for (const ass of pg.assertions) {
      if (!ass.selector) continue;
      if (ass.expected === 'visible') {
        lines.push(`    await expect(page.locator(${JSON.stringify(ass.selector)})).toBeVisible();`);
      } else if (ass.expected === 'hidden') {
        lines.push(`    await expect(page.locator(${JSON.stringify(ass.selector)})).toBeHidden();`);
      } else if (ass.expected) {
        lines.push(`    await expect(page.locator(${JSON.stringify(ass.selector)})).toContainText(${JSON.stringify(ass.expected)});`);
      }
    }

    lines.push(`  });`);
    lines.push(`  `);
  }

  lines.push(`});`);
  lines.push(``);

  // Summary test
  lines.push(`test('Coverage summary', async () => {`);
  lines.push(`  // ${report.testedPages} page(s) tested`);
  lines.push(`  // ${report.passed} action(s) passed · ${report.failed} failed`);
  lines.push(`  // Coverage: ${report.coverage}`);
  if (report.issues.length > 0) {
    lines.push(`  // Issues:`);
    for (const iss of report.issues.slice(0, 5)) {
      lines.push(`  //   ${iss.page} — ${iss.issue}`);
    }
  }
  lines.push(`  expect(${report.passed}).toBeGreaterThanOrEqual(${Math.floor(report.passed * 0.8)});`);
  lines.push(`});`);

  return lines.join('\n');
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AITestPage() {
  const [url,      setUrl]      = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [goal,     setGoal]     = useState('Test the full website — forms, buttons, navigation and validation');
  const [maxPages, setMaxPages] = useState(6);
  const [maxSteps, setMaxSteps] = useState(30);
  const [showCreds, setShowCreds] = useState(false);

  const [running,     setRunning]     = useState(false);
  const [done,        setDone]        = useState(false);
  const [logs,        setLogs]        = useState<LogEntry[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [report,      setReport]      = useState<Report | null>(null);
  const [activeShot,  setActiveShot]  = useState<Screenshot | null>(null);
  const [showCode,    setShowCode]    = useState(false);
  const [codeText,    setCodeText]    = useState('');
  const [copied,      setCopied]      = useState(false);

  const [curPage,   setCurPage]   = useState('');
  const [visited,   setVisited]   = useState(0);
  const [queueSz,   setQueueSz]   = useState(0);
  const [actPassed, setActPassed] = useState(0);
  const [actFailed, setActFailed] = useState(0);
  const [routes,    setRoutes]    = useState<string[]>([]);

  const logEndRef = useRef<HTMLDivElement>(null);

  const pushLog = (level: LogEntry['level'], msg: string) =>
    setLogs(prev => {
      const next = [...prev, { level, msg, ts: new Date().toLocaleTimeString() }];
      setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      return next;
    });

  const stop = useCallback(() => { setRunning(false); }, []);

  const handleEvent = useCallback((type: string, payload: Record<string, unknown>) => {
    switch (type) {
      case 'LOG':
        pushLog((payload.level as LogEntry['level']) || 'info', payload.msg as string);
        break;
      case 'PAGE_START':
        setCurPage(payload.url as string);
        setVisited((payload.visited as number) || 0);
        setQueueSz((payload.queueSize as number) || 0);
        break;
      case 'ACTION_PASS': setActPassed(p => p + 1); break;
      case 'ACTION_FAIL': setActFailed(p => p + 1); break;
      case 'SCREENSHOT': {
        const s = payload as unknown as Screenshot;
        setScreenshots(prev => [...prev, s]);
        setActiveShot(s);
        break;
      }
      case 'ROUTE_FOUND':
        setRoutes(prev => prev.includes(payload.url as string) ? prev : [...prev, payload.url as string]);
        setQueueSz(prev => prev + 1);
        break;
      case 'COMPLETE':
        setReport(payload as unknown as Report);
        setRunning(false);
        setDone(true);
        pushLog('success', '🎉 Testing complete — see the report below');
        break;
      case 'ERROR':
        pushLog('error', `Fatal: ${payload.message}`);
        setRunning(false);
        break;
    }
  }, []);

  const start = useCallback(() => {
    if (!url.trim()) return;
    setLogs([]); setScreenshots([]); setReport(null);
    setDone(false); setRunning(true);
    setCurPage(''); setVisited(0); setQueueSz(0);
    setActPassed(0); setActFailed(0); setRoutes([]);
    setActiveShot(null); setShowCode(false);

    const body = JSON.stringify({
      url: url.startsWith('http') ? url : 'https://' + url,
      goal, maxPages, maxSteps,
      credentials: (username || password) ? { username, password } : null,
    });

    fetch('/api/ai-test/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).then(res => {
      if (!res.ok || !res.body) {
        pushLog('error', 'Server error — is the Runner Server workflow running?');
        setRunning(false); return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      const read = () => reader.read().then(({ done: d, value }) => {
        if (d) { setRunning(false); return; }
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const chunk of lines) {
          const line = chunk.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const { type, payload } = JSON.parse(line.slice(5).trim());
            handleEvent(type, payload);
          } catch (_) {}
        }
        read();
      }).catch(() => setRunning(false));
      read();
    }).catch(e => { pushLog('error', `Connection failed: ${e.message}`); setRunning(false); });
  }, [url, username, password, goal, maxPages, maxSteps, handleEvent]);

  const openCode = () => {
    if (!report) return;
    const code = generatePlaywrightCode(report, url.startsWith('http') ? url : 'https://' + url, goal);
    setCodeText(code);
    setShowCode(true);
  };

  const downloadSpec = () => {
    const blob = new Blob([codeText], { type: 'text/typescript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-test-${Date.now()}.spec.ts`;
    a.click();
  };

  const copyCode = () => {
    navigator.clipboard.writeText(codeText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const totalActs = actPassed + actFailed;
  const pct = totalActs > 0 ? Math.round((actPassed / totalActs) * 100) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="page-header flex-shrink-0 !py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${running ? 'bg-amber-500/20 border-amber-500/30' : done ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-indigo-500/20 border-indigo-500/30'}`}>
            <Brain className={`w-4 h-4 ${running ? 'text-amber-400 animate-pulse' : done ? 'text-emerald-400' : 'text-indigo-400'}`} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">AI Autonomous Tester</h1>
            <p className="text-xs text-slate-500">
              {running
                ? `Testing ${curPage ? (() => { try { return new URL(curPage).hostname; } catch { return curPage; } })() : '…'} — ${visited} page(s) · ${queueSz} in queue`
                : done ? (report?.stopReason ?? 'Testing complete')
                : 'Configure and launch'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-1.5 text-[10px] text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> LIVE · {actPassed + actFailed} actions
            </span>
          )}
          {done && report && (
            <button className="btn-ghost text-xs text-indigo-300 border border-indigo-500/30" onClick={openCode}>
              <Code2 className="w-3.5 h-3.5" /> Generate .spec.ts
            </button>
          )}
          {running
            ? <button className="btn-ghost text-xs text-red-400 border border-red-500/30" onClick={stop}><Square className="w-3.5 h-3.5" /> Stop</button>
            : <button className="btn-primary" onClick={start} disabled={!url.trim()}><Zap className="w-4 h-4" /> Run AI Test</button>}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* ─ Left panel ─ */}
        <div className="w-[300px] flex-shrink-0 flex flex-col border-r border-slate-800 overflow-y-auto">

          {/* Config */}
          <div className="p-4 space-y-3 border-b border-slate-800">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Configuration</p>

            <div>
              <label className="text-[11px] text-slate-400 flex items-center gap-1 mb-1"><Globe className="w-3 h-3" />Website URL</label>
              <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-brand-500/60 font-mono"
                disabled={running} />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 flex items-center gap-1 mb-1"><Target className="w-3 h-3" />Testing Goal</label>
              <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2}
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-brand-500/60 resize-none"
                disabled={running} />
            </div>

            <button className="w-full flex items-center gap-2 text-[11px] text-slate-400 hover:text-white transition-colors"
              onClick={() => setShowCreds(v => !v)}>
              <Lock className="w-3 h-3" /> Login credentials (optional)
              {showCreds ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
            </button>
            {showCreds && (
              <div className="space-y-2 pl-4 border-l border-slate-700/50">
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username / Email"
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-brand-500/60" disabled={running} />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-brand-500/60" disabled={running} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Max Pages</label>
                <input type="number" min={1} max={20} value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500/60" disabled={running} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Max Steps</label>
                <input type="number" min={1} max={200} value={maxSteps} onChange={e => setMaxSteps(Number(e.target.value))}
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-brand-500/60" disabled={running} />
              </div>
            </div>

            <button onClick={start} disabled={!url.trim() || running} className="w-full btn-primary justify-center text-sm">
              {running
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</>
                : <><Play className="w-4 h-4" /> Start AI Test</>}
            </button>
          </div>

          {/* Live stats */}
          {(running || done) && (
            <div className="p-4 space-y-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Live Stats</p>
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>Pass rate</span>
                  <span className={pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}>{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                {[
                  { label: 'Pages',   value: visited,    color: 'text-blue-400' },
                  { label: 'Queue',   value: queueSz,    color: 'text-slate-400' },
                  { label: '✓ Pass',  value: actPassed,  color: 'text-emerald-400' },
                  { label: '✗ Fail',  value: actFailed,  color: 'text-red-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-800/50 rounded-lg p-2">
                    <div className={`text-[10px] ${color} mb-0.5`}>{label}</div>
                    <div className="text-sm font-bold text-white">{value}</div>
                  </div>
                ))}
              </div>

              {curPage && (
                <div className="bg-slate-800/40 rounded-lg p-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">Current page</p>
                  <p className="text-[10px] text-white font-mono truncate">{curPage}</p>
                </div>
              )}
            </div>
          )}

          {/* Discovered routes */}
          {routes.length > 0 && (
            <div className="p-4 border-t border-slate-800">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Route className="w-3 h-3" /> Routes ({routes.length})
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {routes.map((r, i) => (
                  <div key={i} className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-1">
                    <span className="text-emerald-500 flex-shrink-0">+</span>
                    {(() => { try { return new URL(r).pathname || '/'; } catch { return r; } })()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─ Center: Terminal ─ */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-800 min-w-0">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-surface-900/40 flex-shrink-0">
            <span className="text-[11px] font-mono text-slate-600">$</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Log</span>
            {running && <span className="ml-auto flex items-center gap-1.5 text-[10px] text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />AI RUNNING</span>}
            {done && !running && <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle className="w-3 h-3" />DONE</span>}
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono bg-[#080c12] text-xs space-y-0.5">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <Brain className="w-10 h-10 text-slate-700" />
                <p className="text-sm text-white font-medium">AI Test Engine Ready</p>
                <p className="text-xs text-slate-600 max-w-xs">
                  Enter a URL and click "Start AI Test".<br />
                  The engine will automatically discover every page, fill forms, click buttons, and report issues.
                </p>
              </div>
            ) : (
              <>
                <div className="text-[10px] text-slate-700 mb-3 pb-2 border-b border-slate-800">
                  $ ai-test --url "{url}" --max-pages {maxPages} --max-steps {maxSteps}
                </div>
                {logs.map((l, i) => (
                  <div key={i} className={`flex items-start gap-2 leading-5 ${LOG_COLOR[l.level]}`}>
                    <span className="text-slate-700 flex-shrink-0 tabular-nums text-[10px] w-16">{l.ts}</span>
                    <span className="flex-shrink-0">{LOG_PFX[l.level]}</span>
                    <span className="break-all whitespace-pre-wrap">{l.msg}</span>
                  </div>
                ))}
                {running && (
                  <div className="flex items-center gap-2 text-amber-400 mt-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span className="animate-pulse text-[11px]">AI analyzing…</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </>
            )}
          </div>
        </div>

        {/* ─ Right: Screenshots + Report ─ */}
        <div className="w-[320px] flex-shrink-0 flex flex-col overflow-hidden">

          {/* Active screenshot viewer */}
          <div className="flex-shrink-0 border-b border-slate-800">
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-900/40">
              <Camera className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preview</span>
              <span className="ml-auto text-[10px] text-slate-600">{screenshots.length} frame(s)</span>
            </div>
            <div className="aspect-video bg-[#080c12] flex items-center justify-center overflow-hidden">
              {activeShot ? (
                <img src={`data:image/jpeg;base64,${activeShot.data}`}
                  className="w-full h-full object-contain cursor-zoom-in"
                  alt={activeShot.label}
                  onClick={() => setActiveShot(activeShot)} />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Eye className="w-8 h-8 text-slate-700" />
                  <span className="text-[10px] text-slate-600">Screenshots appear here</span>
                </div>
              )}
            </div>
            {activeShot && (
              <div className={`px-3 py-1.5 text-[10px] flex items-center gap-1.5 ${activeShot.passed ? 'text-emerald-400 bg-emerald-900/10' : 'text-red-400 bg-red-900/10'}`}>
                {activeShot.passed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                <span className="truncate">{activeShot.label}</span>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {screenshots.length > 0 && (
            <div className="p-2 border-b border-slate-800 flex-shrink-0">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {screenshots.slice(-12).map((s, i) => (
                  <button key={i} onClick={() => setActiveShot(s)}
                    className={`flex-shrink-0 w-14 h-10 rounded overflow-hidden border transition-all ${s === activeShot ? 'border-brand-400' : 'border-slate-700 hover:border-slate-500'} ${!s.passed ? 'ring-1 ring-red-500/50' : ''}`}>
                    <img src={`data:image/jpeg;base64,${s.data}`} className="w-full h-full object-cover" alt="" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Final Report */}
          <div className="flex-1 overflow-y-auto">
            {report ? (
              <div className="p-4 space-y-4">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" /> Final Report
                </p>

                {report.stopReason && (
                  <div className="text-[10px] text-slate-500 bg-slate-800/40 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" /> {report.stopReason}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Coverage',  value: report.coverage,      color: 'text-emerald-400' },
                    { label: 'Pages',     value: `${report.testedPages}/${report.totalPages}`, color: 'text-blue-400' },
                    { label: 'Passed',    value: report.passed,         color: 'text-emerald-400' },
                    { label: 'Failed',    value: report.failed,         color: report.failed > 0 ? 'text-red-400' : 'text-slate-500' },
                    { label: 'Assert ✓',  value: report.assertPassed,   color: 'text-emerald-400' },
                    { label: 'Assert ✗',  value: report.assertFailed,   color: report.assertFailed > 0 ? 'text-red-400' : 'text-slate-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-800/50 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                      <div className={`text-sm font-bold ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>

                {report.issues.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-red-400 flex items-center gap-1 mb-1.5">
                      <AlertTriangle className="w-3 h-3" /> Issues ({report.issues.length})
                    </p>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {report.issues.map((issue, i) => (
                        <div key={i} className="bg-red-500/5 border border-red-500/15 rounded-lg px-2 py-1.5">
                          <p className="text-[9px] font-mono text-red-300 truncate">
                            {(() => { try { return new URL(issue.page).pathname; } catch { return issue.page; } })()}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{issue.issue}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 mb-1.5">
                    <FileText className="w-3 h-3" /> Pages Tested
                  </p>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {report.visitedPages.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <CheckCircle className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />
                        <span className="font-mono truncate">{(() => { try { return new URL(p).pathname || '/'; } catch { return p; } })()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Buttons */}
                <div className="space-y-2">
                  <button onClick={openCode} className="w-full btn-primary text-xs justify-center">
                    <Code2 className="w-3.5 h-3.5" /> Generate Playwright .spec.ts
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                      a.download = `ai-test-report-${Date.now()}.json`; a.click();
                    }}
                    className="w-full btn-secondary text-xs justify-center"
                  >
                    <FileText className="w-3.5 h-3.5" /> Export JSON Report
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
                <BarChart3 className="w-8 h-8 text-slate-700" />
                <p className="text-xs text-slate-600">Report appears here when testing completes</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Playwright Code Modal ── */}
      {showCode && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowCode(false)}>
          <div className="bg-surface-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">Generated Playwright Test</span>
              <span className="text-[10px] text-slate-500 font-mono ml-1">ai-test.spec.ts</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={copyCode}
                  className={`btn-ghost text-xs ${copied ? 'text-emerald-400 border-emerald-500/30' : 'text-slate-400 border-slate-700'} border`}>
                  <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={downloadSpec} className="btn-primary text-xs">
                  <FileText className="w-3.5 h-3.5" /> Download .spec.ts
                </button>
                <button onClick={() => setShowCode(false)} className="btn-ghost text-slate-500 border border-slate-700 p-1.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-[#080c12]">
              <pre className="text-slate-300 whitespace-pre leading-5">{codeText}</pre>
            </div>
            <div className="px-4 py-2 border-t border-slate-800 text-[10px] text-slate-600">
              Run with: <span className="font-mono text-slate-400">npx playwright test ai-test.spec.ts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
