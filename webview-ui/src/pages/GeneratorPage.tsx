import { useState } from 'react';
import { useFlow } from '../context/FlowContext';
import { useNavigate } from 'react-router-dom';
import {
  Code2, Copy, Download, Play, RefreshCw, Check,
  FileText, Settings, Zap, ChevronDown
} from 'lucide-react';

export default function GeneratorPage() {
  const { state, generateTest, runTest } = useFlow();
  const navigate = useNavigate();
  const { currentFlow, generatedCode, isGenerating, generatorOptions: opts } = state;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerate = () => generateTest();

  const lineCount = generatedCode ? generatedCode.split('\n').length : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="page-header flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Code2 className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Code Generator</h1>
            <p className="text-xs text-slate-500">
              {generatedCode ? `${lineCount} lines · ${currentFlow.steps.filter(s=>s.enabled).length} steps` : 'Generate TypeScript Playwright test'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => navigate('/settings')}>
            <Settings className="w-4 h-4" /> Options
          </button>
          {generatedCode && (
            <>
              <button className="btn-ghost" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button className="btn-success" onClick={() => { runTest(); navigate('/runner'); }}>
                <Play className="w-4 h-4" /> Run Test
              </button>
            </>
          )}
          <button
            className={`btn-primary ${isGenerating ? 'opacity-60 cursor-not-allowed' : ''}`}
            onClick={handleGenerate}
            disabled={isGenerating || currentFlow.steps.length === 0}
          >
            {isGenerating
              ? <><RefreshCw className="w-4 h-4 animate-spin-slow" /> Generating…</>
              : <><Zap className="w-4 h-4" /> Generate Code</>
            }
          </button>
        </div>
      </div>

      {/* Config bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-800 bg-surface-900/40 flex-shrink-0 text-xs text-slate-400">
        <span>Framework: <b className="text-white">{opts.testFramework}</b></span>
        <span>Browser: <b className="text-white capitalize">{opts.browserType}</b></span>
        <span>Headless: <b className="text-white">{opts.headless ? 'Yes' : 'No'}</b></span>
        <span>Timeout: <b className="text-white">{opts.timeout / 1000}s</b></span>
        <span>Retries: <b className="text-white">{opts.retries}</b></span>
        <span>BVA: <b className={opts.useBoundaryValues ? 'text-success' : 'text-slate-600'}>{opts.useBoundaryValues ? 'On' : 'Off'}</b></span>
        <span>Comments: <b className={opts.includeComments ? 'text-success' : 'text-slate-600'}>{opts.includeComments ? 'On' : 'Off'}</b></span>
      </div>

      {/* Code area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isGenerating ? (
          /* ── Generating Spinner ── */
          <div className="flex-1 flex items-center justify-center">
            <div className="empty-state">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                </div>
                <div className="absolute -inset-1 rounded-2xl border border-amber-500/20 animate-ping opacity-30" />
              </div>
              <div>
                <p className="text-white font-semibold text-lg">Generating your test…</p>
                <p className="text-slate-400 text-sm mt-1">
                  Building Playwright code from {currentFlow.steps.filter(s=>s.enabled).length} steps. This will only take a moment.
                </p>
              </div>
            </div>
          </div>
        ) : !generatedCode ? (
          /* ── Empty State ── */
          <div className="flex-1 flex items-center justify-center">
            <div className="empty-state">
              <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <FileText className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-semibold text-lg">No Code Yet</p>
                <p className="text-slate-400 text-sm mt-1">
                  {currentFlow.steps.length === 0
                    ? 'Add steps in the Builder first, then generate.'
                    : `Click "Generate Code" to create test from ${currentFlow.steps.filter(s=>s.enabled).length} steps.`}
                </p>
              </div>
              {currentFlow.steps.length === 0 ? (
                <button className="btn-primary" onClick={() => navigate('/builder')}>
                  Go to Builder
                </button>
              ) : (
                <button className="btn-primary" onClick={handleGenerate} disabled={isGenerating}>
                  <Zap className="w-4 h-4" /> Generate Now
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Line numbers + code */}
            <div className="flex-1 overflow-auto bg-surface-950 font-mono text-xs">
              <div className="flex min-h-full">
                {/* Line numbers */}
                <div className="flex-shrink-0 py-4 pr-3 pl-4 text-right text-slate-700 select-none border-r border-slate-800 bg-surface-950">
                  {generatedCode.split('\n').map((_, i) => (
                    <div key={i} className="leading-5">{i + 1}</div>
                  ))}
                </div>
                {/* Code */}
                <div className="flex-1 py-4 pl-4 pr-6 overflow-x-auto">
                  <pre className="text-slate-300 leading-5 whitespace-pre">
                    {generatedCode.split('\n').map((line, i) => (
                      <div key={i} className={`${
                        line.trim().startsWith('//') ? 'text-slate-600' :
                        line.includes('await expect') ? 'text-green-400' :
                        line.includes('await page.') ? 'text-blue-300' :
                        line.includes('import ') ? 'text-purple-300' :
                        line.includes('test(') || line.includes('test.describe') ? 'text-amber-300' :
                        'text-slate-300'
                      }`}>
                        {line || ' '}
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 bg-surface-900/50 text-xs text-slate-500 flex-shrink-0">
              <span>TypeScript · {lineCount} lines · {currentFlow.name.replace(/[^a-zA-Z0-9]/g,'_').toLowerCase()}.spec.ts</span>
              <div className="flex items-center gap-3">
                <button className="hover:text-white transition-colors flex items-center gap-1" onClick={handleCopy}>
                  {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy all'}
                </button>
                <button className="hover:text-white transition-colors flex items-center gap-1" onClick={() => { runTest(); navigate('/runner'); }}>
                  <Play className="w-3 h-3" /> Run in terminal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
