import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFlow } from '../context/FlowContext';
import Toolbox from '../components/Toolbox';
import Canvas from '../components/Canvas';
import PropertiesPanel from '../components/PropertiesPanel';
import {
  Save, Code2, Play, Plus, Download, Upload,
  Wrench, Eye, EyeOff, Zap, RefreshCw, Trash2
} from 'lucide-react';

export default function BuilderPage() {
  const navigate = useNavigate();
  const {
    state, saveFlow, generateTest, newFlow, clearSteps,
    updateFlow, exportJson, showToast
  } = useFlow();
  const { currentFlow, isSaving, isGenerating } = state;

  const [showProps, setShowProps] = useState(true);
  const [showToolbox, setShowToolbox] = useState(true);

  const handleImportJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const flow = JSON.parse(ev.target?.result as string);
          if (flow.steps && flow.name) {
            updateFlow(flow);
            showToast(`Imported: ${flow.name}`, 'success');
          } else {
            showToast('Invalid flow JSON', 'error');
          }
        } catch {
          showToast('Failed to parse JSON', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleGenerate = () => {
    if (currentFlow.steps.length === 0) {
      showToast('Add at least one step before generating', 'error');
      return;
    }
    generateTest();
    navigate('/generator');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Top Toolbar ─────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-surface-900/60 backdrop-blur-sm flex-shrink-0 gap-3">

        {/* Flow name + base URL */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded bg-brand-600/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
            <Wrench className="w-3.5 h-3.5 text-brand-400" />
          </div>
          <input
            className="bg-transparent text-sm font-semibold text-white border-none outline-none focus:outline-none placeholder-slate-600 min-w-0 flex-shrink w-32"
            value={currentFlow.name}
            onChange={e => updateFlow({ name: e.target.value })}
            placeholder="Flow name…"
          />
          <span className="text-slate-700 text-xs flex-shrink-0">|</span>
          <input
            className="bg-transparent text-xs text-slate-400 border-none outline-none focus:outline-none placeholder-slate-700 min-w-0 flex-1"
            value={currentFlow.baseUrl}
            onChange={e => updateFlow({ baseUrl: e.target.value })}
            placeholder="https://baseurl.com"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* View toggles */}
          <button
            className={`btn-ghost text-xs px-2 py-1.5 ${showToolbox ? 'text-brand-400' : 'text-slate-600'}`}
            onClick={() => setShowToolbox(v => !v)}
            title="Toggle Toolbox"
          >
            {showToolbox ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            className={`btn-ghost text-xs px-2 py-1.5 ${showProps ? 'text-brand-400' : 'text-slate-600'}`}
            onClick={() => setShowProps(v => !v)}
            title="Toggle Properties"
          >
            {showProps ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          <div className="w-px h-5 bg-slate-800 mx-0.5" />

          {/* New */}
          <button className="btn-ghost text-xs" onClick={() => { if (confirm('Start a new flow? Unsaved changes will be lost.')) newFlow(); }}>
            <Plus className="w-3.5 h-3.5" /> New
          </button>

          {/* Import */}
          <button className="btn-ghost text-xs" onClick={handleImportJson} title="Import JSON flow">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>

          {/* Export */}
          <button className="btn-ghost text-xs" onClick={exportJson} title="Export JSON" disabled={currentFlow.steps.length === 0}>
            <Download className="w-3.5 h-3.5" /> Export
          </button>

          <div className="w-px h-5 bg-slate-800 mx-0.5" />

          {/* Save */}
          <button
            className={`btn-secondary text-xs ${isSaving ? 'opacity-60' : ''}`}
            onClick={saveFlow}
            disabled={isSaving}
          >
            {isSaving
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin-slow" /> Saving…</>
              : <><Save className="w-3.5 h-3.5" /> Save</>
            }
          </button>

          {/* Generate */}
          <button
            className={`btn-warning text-xs ${isGenerating ? 'opacity-60' : ''}`}
            onClick={handleGenerate}
            disabled={isGenerating || currentFlow.steps.length === 0}
          >
            {isGenerating
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin-slow" /> Generating…</>
              : <><Code2 className="w-3.5 h-3.5" /> Generate</>
            }
          </button>

          {/* Run */}
          <button
            className="btn-primary text-xs"
            onClick={() => { handleGenerate(); navigate('/runner'); }}
            disabled={currentFlow.steps.length === 0}
          >
            <Zap className="w-3.5 h-3.5" /> Run
          </button>
        </div>
      </div>

      {/* ── 3-Panel Layout ──────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: Toolbox */}
        {showToolbox && (
          <div className="w-[180px] flex-shrink-0 overflow-hidden">
            <Toolbox />
          </div>
        )}

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden bg-surface-950 bg-grid">
          <Canvas />
        </div>

        {/* Right: Properties */}
        {showProps && (
          <div className="w-[220px] flex-shrink-0 overflow-hidden">
            <PropertiesPanel />
          </div>
        )}
      </div>

      {/* ── Bottom Status Bar ───────────────────── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-800 bg-surface-900/40 flex-shrink-0 text-[10px] text-slate-500">
        <div className="flex items-center gap-3">
          <span>Steps: <b className="text-white">{currentFlow.steps.length}</b></span>
          <span>Enabled: <b className="text-success">{currentFlow.steps.filter(s => s.enabled).length}</b></span>
          <span>Asserts: <b className="text-green-400">{currentFlow.steps.filter(s => s.action === 'assert').length}</b></span>
        </div>
        <div className="flex items-center gap-3">
          <span>Base: <b className="text-brand-400">{currentFlow.baseUrl || 'not set'}</b></span>
          {state.selectedStepId && <span className="text-brand-300">● Editing step</span>}
        </div>
      </div>
    </div>
  );
}
