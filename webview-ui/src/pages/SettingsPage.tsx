import { useState } from 'react';
import { useFlow } from '../context/FlowContext';
import { Settings, Monitor, Globe, Timer, RotateCcw, Camera, Video, MessageSquare, ChevronDown, Save } from 'lucide-react';

type BrowserType = 'chromium' | 'firefox' | 'webkit';

export default function SettingsPage() {
  const { state, setOptions, updateFlow, showToast } = useFlow();
  const { generatorOptions: opts, currentFlow } = state;
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    showToast('Settings saved!', 'success');
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center">
              <Settings className="w-4 h-4 text-slate-300" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Settings</h1>
              <p className="text-xs text-slate-500">Configure generator & flow options</p>
            </div>
          </div>
          <button className={saved ? 'btn-success' : 'btn-primary'} onClick={handleSave}>
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>

        {/* Flow Settings */}
        <div className="card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white border-b border-slate-800 pb-3">
            <Globe className="w-4 h-4 text-brand-400" />
            Flow Configuration
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Flow Name</label>
              <input className="input" value={currentFlow.name}
                onChange={e => updateFlow({ name: e.target.value })} />
            </div>
            <div>
              <label className="label">Base URL</label>
              <input className="input" placeholder="https://example.com"
                value={currentFlow.baseUrl}
                onChange={e => updateFlow({ baseUrl: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="textarea h-16" value={currentFlow.description}
              onChange={e => updateFlow({ description: e.target.value })}
              placeholder="What does this test flow cover?" />
          </div>
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input className="input" placeholder="smoke, regression, login"
              value={currentFlow.tags.join(', ')}
              onChange={e => updateFlow({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
          </div>
        </div>

        {/* Browser Settings */}
        <div className="card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white border-b border-slate-800 pb-3">
            <Monitor className="w-4 h-4 text-amber-400" />
            Browser Configuration
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['chromium', 'firefox', 'webkit'] as BrowserType[]).map(b => (
              <button
                key={b}
                onClick={() => setOptions({ browserType: b })}
                className={`p-3 rounded-lg border text-sm font-medium transition-all capitalize ${
                  opts.browserType === b
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : 'bg-surface-800 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {b === 'chromium' ? '🔵' : b === 'firefox' ? '🦊' : '🧭'} {b}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Toggle label="Headless Mode" value={opts.headless} onChange={v => setOptions({ headless: v })}
              desc="Run without browser window" />
            <div>
              <label className="label">Slow Motion (ms)</label>
              <input type="number" className="input" min={0} max={5000}
                value={opts.slowMo ?? 0}
                onChange={e => setOptions({ slowMo: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Default Timeout (ms)</label>
              <input type="number" className="input" min={1000} max={120000} step={1000}
                value={opts.timeout}
                onChange={e => setOptions({ timeout: parseInt(e.target.value) || 30000 })} />
            </div>
            <div>
              <label className="label">Retry Count</label>
              <input type="number" className="input" min={0} max={5}
                value={opts.retries}
                onChange={e => setOptions({ retries: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </div>

        {/* Generator Settings */}
        <div className="card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white border-b border-slate-800 pb-3">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            Generator Options
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Toggle label="Include Comments" value={opts.includeComments} onChange={v => setOptions({ includeComments: v })}
              desc="Add step labels as comments" />
            <Toggle label="Boundary Value Analysis" value={opts.useBoundaryValues} onChange={v => setOptions({ useBoundaryValues: v })}
              desc="Generate BVA tests for fill steps" />
            <Toggle label="Screenshot on Failure" value={opts.screenshotOnFailure} onChange={v => setOptions({ screenshotOnFailure: v })}
              desc="Capture screenshot on test fail" icon={<Camera className="w-3 h-3" />} />
            <Toggle label="Video on Failure" value={opts.videoOnFailure} onChange={v => setOptions({ videoOnFailure: v })}
              desc="Record video on first retry" icon={<Video className="w-3 h-3" />} />
          </div>
          <div>
            <label className="label">Test Framework</label>
            <select className="select" value={opts.testFramework}
              onChange={e => setOptions({ testFramework: e.target.value as 'playwright' | 'jest-playwright' })}>
              <option value="playwright">@playwright/test (recommended)</option>
              <option value="jest-playwright">jest-playwright</option>
            </select>
          </div>
        </div>

        {/* Reset */}
        <div className="flex justify-end">
          <button className="btn-ghost text-danger" onClick={() => {
            setOptions({
              includeComments: true, useBoundaryValues: false, testFramework: 'playwright',
              browserType: 'chromium', headless: true, slowMo: 0, timeout: 30000,
              retries: 0, screenshotOnFailure: true, videoOnFailure: false,
            });
            showToast('Reset to defaults', 'info');
          }}>
            <RotateCcw className="w-4 h-4" /> Reset Defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, desc, icon }: {
  label: string; value: boolean; onChange: (v: boolean) => void; desc?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 bg-surface-800 rounded-lg">
      <div>
        <div className="flex items-center gap-1.5 text-sm text-white font-medium">
          {icon}{label}
        </div>
        {desc && <div className="text-xs text-slate-500 mt-0.5">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 mt-0.5 ${value ? 'bg-brand-600' : 'bg-slate-700'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
