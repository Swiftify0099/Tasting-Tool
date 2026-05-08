import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDOM } from '../context/DOMContext';
import { useFlow } from '../context/FlowContext';
import { DOMElement, DOMCategory, ActionType } from '../types';
import { Play, Layers as LayersIcon } from 'lucide-react';
import {
  Globe, Crosshair, Zap, Plus, Copy, Check, RefreshCw,
  ChevronDown, ChevronRight, Search, Layers, AlertTriangle,
  CheckCircle, Shield, MousePointer2, Type, List, Link2,
  CheckSquare, FileText, Tag, Cpu, ArrowRight, X, Info
} from 'lucide-react';

const CATEGORY_TABS: { id: DOMCategory | 'all'; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'all',      label: 'All',       icon: Layers,       color: 'text-slate-400' },
  { id: 'button',   label: 'Buttons',   icon: MousePointer2,color: 'text-blue-400'  },
  { id: 'input',    label: 'Inputs',    icon: Type,         color: 'text-violet-400'},
  { id: 'select',   label: 'Selects',   icon: List,         color: 'text-amber-400' },
  { id: 'link',     label: 'Links',     icon: Link2,        color: 'text-sky-400'   },
  { id: 'checkbox', label: 'Checkboxes',icon: CheckSquare,  color: 'text-green-400' },
  { id: 'textarea', label: 'Textareas', icon: FileText,     color: 'text-pink-400'  },
  { id: 'form',     label: 'Forms',     icon: Tag,          color: 'text-orange-400'},
];

const ACTIONS_FOR_CATEGORY: Record<string, ActionType[]> = {
  button:   ['click','dblclick','rightclick','hover','focus'],
  input:    ['fill','type','clear','click','focus','press'],
  select:   ['select','click'],
  link:     ['click','hover'],
  checkbox: ['check','uncheck','click'],
  radio:    ['check','click'],
  textarea: ['fill','type','clear','click'],
  form:     ['evaluate'],
  other:    ['click','hover'],
  all:      ['click','fill','select','check','hover'],
};

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  excellent: { label: '✦ data-testid', cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  good:      { label: '● id/name',     cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30'   },
  fair:      { label: '◈ aria-label',  cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30'},
  poor:      { label: '○ css/xpath',   cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30'},
};

const CAT_COLORS: Record<string, string> = {
  button:'bg-blue-500/20 text-blue-300', input:'bg-violet-500/20 text-violet-300',
  select:'bg-amber-500/20 text-amber-300', link:'bg-sky-500/20 text-sky-300',
  checkbox:'bg-green-500/20 text-green-300', radio:'bg-teal-500/20 text-teal-300',
  textarea:'bg-pink-500/20 text-pink-300', form:'bg-orange-500/20 text-orange-300',
  other:'bg-slate-500/20 text-slate-300',
};

function BoundaryChip({ label, value, special }: { label: string; value: string; special?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-[11px] group ${special ? 'bg-red-500/10 border-red-500/20' : 'bg-surface-800 border-slate-700'}`}>
      <span className={`font-medium ${special ? 'text-red-300' : 'text-slate-400'}`}>{label}</span>
      <div className="flex items-center gap-1.5">
        <code className="text-slate-300 font-mono truncate max-w-[120px]">{value.length > 20 ? value.slice(0,20)+'…' : value}</code>
        <button onClick={copy} className="opacity-0 group-hover:opacity-100 transition-opacity">
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-slate-500 hover:text-white" />}
        </button>
      </div>
    </div>
  );
}

export default function DOMInspectorPage() {
  const navigate = useNavigate();
  const { domState, extractDOM, selectDOMElement, clearDOM } = useDOM();
  const { importSteps, updateStep, updateFlow, state, showToast } = useFlow();

  const [url, setUrl]           = useState(state.currentFlow.baseUrl || '');
  const [activeTab, setActiveTab] = useState<DOMCategory | 'all'>('all');
  const [search, setSearch]     = useState('');
  const [selectedAction, setSelectedAction] = useState<ActionType>('click');
  const [copiedSel, setCopiedSel] = useState(false);
  const [pickerMode, setPickerMode] = useState(false);
  const [expandBVA, setExpandBVA] = useState(true);

  const { elements, isExtracting, selectedElement, error, lastExtractedAt } = domState;

  const handleExtract = useCallback(() => {
    if (!url.trim()) return;
    extractDOM(url.trim());
    setPickerMode(false);
  }, [url, extractDOM]);

  const filtered = elements.filter(el => {
    const matchTab = activeTab === 'all' || el.category === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q || el.text.toLowerCase().includes(q) || el.selector.toLowerCase().includes(q)
      || el.tag.toLowerCase().includes(q) || el.ariaLabel.toLowerCase().includes(q)
      || el.placeholder.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const selectEl = (el: DOMElement) => {
    selectDOMElement(el);
    const actions = ACTIONS_FOR_CATEGORY[el.category] || ['click'];
    setSelectedAction(actions[0]);
  };

  /** Sync the visit step URL and baseUrl with the extracted URL */
  const syncVisitUrl = useCallback(() => {
    if (!url || url === 'https://') return;
    const visitStep = state.currentFlow.steps.find(s => s.action === 'visit');
    if (visitStep) {
      updateStep(visitStep.id, {
        url,
        label: `Visit: ${url}`,
        comment: 'URL extracted by DOM Inspector',
      });
    }
    updateFlow({ baseUrl: url });
  }, [url, state.currentFlow.steps, updateStep, updateFlow]);

  /** Add selected element as a step — avoids stale-state by using importSteps */
  const addToCanvas = useCallback((thenNavigateTo?: string) => {
    if (!selectedElement) return;
    syncVisitUrl();
    importSteps([{
      action: selectedAction,
      label: `${selectedAction}: ${selectedElement.text || selectedElement.selector}`,
      selector: selectedElement.selector,
      comment: `[${selectedElement.selectorQuality}] Picked from DOM Inspector`,
      enabled: true,
    }]);
    const dest = thenNavigateTo ?? '/builder';
    showToast(`✅ Step added — going to ${dest === '/builder' ? 'Builder' : 'Runner'}`, 'success');
    setTimeout(() => navigate(dest, dest === '/runner' ? { state: { autoRun: true } } : {}), 500);
  }, [selectedElement, selectedAction, syncVisitUrl, importSteps, showToast, navigate]);

  const copySelector = (sel: string) => {
    navigator.clipboard.writeText(sel).catch(() => {});
    setCopiedSel(true);
    setTimeout(() => setCopiedSel(false), 1500);
  };

  const catCounts: Record<string, number> = {};
  elements.forEach(e => { catCounts[e.category] = (catCounts[e.category] || 0) + 1; });

  const defaultBVA = (el: DOMElement) => {
    if (!['input', 'textarea'].includes(el.category)) return [];
    const t = el.type;
    const isEmail = t === 'email';
    const isPassword = t === 'password';
    const isNumber = t === 'number';
    return [
      { label: 'Empty',       value: '' },
      { label: 'Valid',       value: isEmail ? 'test@example.com' : isNumber ? '42' : 'Hello World' },
      { label: 'Min length',  value: 'a' },
      { label: 'Max length',  value: 'a'.repeat(255) },
      { label: 'Whitespace',  value: '   ' },
      { label: 'Special chars', value: '!@#$%^&*()_+' },
      { label: 'Unicode',     value: '测试 αβγ 🚀' },
      { label: 'SQL Inject',  value: "' OR '1'='1" },
      { label: 'XSS',         value: '<script>alert(1)</script>' },
      ...(isEmail ? [{ label: 'Invalid email', value: 'not-an-email' }] : []),
      ...(isPassword ? [{ label: 'Weak pwd', value: '123' }] : []),
      ...(isNumber ? [{ label: 'Negative', value: '-1' }, { label: 'Float', value: '3.14' }] : []),
    ];
  };

  const bva = selectedElement ? (selectedElement.boundaryValues?.length ? selectedElement.boundaryValues : defaultBVA(selectedElement)) : [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-surface-900/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Crosshair className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">DOM Inspector</h1>
            <p className="text-[10px] text-slate-500">Extract elements · Pick selectors · Generate steps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {elements.length > 0 && (
            <span className="badge badge-brand text-[10px]">{elements.length} elements</span>
          )}
          <button className="btn-ghost text-xs" onClick={() => navigate('/builder')}>
            <Layers className="w-3.5 h-3.5" /> Builder <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* URL Bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-surface-900/40 flex-shrink-0">
        <Globe className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <input
          className="flex-1 bg-surface-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 font-mono"
          placeholder="https://example.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleExtract()}
        />
        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${pickerMode ? 'bg-cyan-600 text-white' : 'btn-ghost'}`}
          onClick={() => setPickerMode(v => !v)}
          title="Element Picker Mode"
        >
          <Crosshair className="w-3.5 h-3.5" />
          {pickerMode ? 'Picking…' : 'Pick'}
        </button>
        <button
          className={`btn-primary text-xs px-4 ${isExtracting ? 'opacity-70 cursor-not-allowed' : ''}`}
          onClick={handleExtract}
          disabled={isExtracting || !url.trim()}
        >
          {isExtracting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Extracting…</> : <><Zap className="w-3.5 h-3.5" /> Extract DOM</>}
        </button>
        {elements.length > 0 && (
          <button className="btn-icon" onClick={() => { clearDOM(); setPickerMode(false); }} title="Clear">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Picker mode banner */}
      {pickerMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/30 text-xs text-cyan-300 flex-shrink-0">
          <Crosshair className="w-3.5 h-3.5 animate-pulse" />
          <span><strong>Element Picker Mode</strong> — Extract DOM first, then click any element in the list to auto-fill its selector.</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-300 flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Empty state */}
      {!isExtracting && elements.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Crosshair className="w-7 h-7 text-cyan-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Inspect Any Page</p>
            <p className="text-slate-500 text-sm mt-1">Enter a URL and click Extract DOM</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 max-w-xs">
            {['Buttons', 'Inputs', 'Selects', 'Links', 'Checkboxes', 'Textareas', 'Forms', 'All elements'].map(f => (
              <div key={f} className="flex items-center gap-1.5 bg-surface-800 rounded-lg px-2.5 py-1.5 border border-slate-700">
                <CheckCircle className="w-3 h-3 text-cyan-500" /> {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isExtracting && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
          </div>
          <p className="text-sm text-white">Launching browser & extracting DOM…</p>
          <p className="text-xs text-slate-500">Visiting: {url}</p>
        </div>
      )}

      {/* Main content: elements + detail */}
      {elements.length > 0 && (
        <div className="flex-1 flex overflow-hidden">

          {/* Left: Element List */}
          <div className="w-[320px] flex-shrink-0 flex flex-col border-r border-slate-800 overflow-hidden">

            {/* Category tabs */}
            <div className="flex overflow-x-auto no-scrollbar border-b border-slate-800 bg-surface-900/40">
              {CATEGORY_TABS.filter(t => t.id === 'all' || catCounts[t.id] > 0).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1 px-2.5 py-2 text-[10px] font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                    activeTab === tab.id
                      ? `border-cyan-500 ${tab.color}`
                      : 'border-transparent text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                  {tab.id !== 'all' && catCounts[tab.id] && (
                    <span className="ml-0.5 px-1 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[9px]">
                      {catCounts[tab.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-2 py-1.5 border-b border-slate-800 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                <input
                  className="w-full bg-surface-800 border border-slate-700 rounded-lg pl-6 pr-2 py-1 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  placeholder="Search elements…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Element list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-600">No elements match</div>
              ) : (
                filtered.map(el => (
                  <button
                    key={el.uid}
                    onClick={() => selectEl(el)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-800/60 hover:bg-surface-800/60 transition-colors group ${
                      selectedElement?.uid === el.uid ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex-shrink-0 mt-0.5 ${CAT_COLORS[el.category]}`}>
                        {el.tag}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white font-medium truncate">
                          {el.text || el.ariaLabel || el.placeholder || el.name || el.elementId || `<${el.tag}>`}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{el.selector}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] border ${QUALITY_BADGE[el.selectorQuality].cls}`}>
                            {QUALITY_BADGE[el.selectorQuality].label}
                          </span>
                          {el.dataTestId && <span title="Has data-testid"><Shield className="w-2.5 h-2.5 text-green-400" /></span>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* List footer */}
            <div className="px-3 py-1.5 border-t border-slate-800 bg-surface-900/40 text-[10px] text-slate-600 flex-shrink-0">
              {filtered.length} of {elements.length} elements
              {lastExtractedAt && <> · {new Date(lastExtractedAt).toLocaleTimeString()}</>}
            </div>
          </div>

          {/* Right: Detail Panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-surface-950/40">
            {!selectedElement ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                <Cpu className="w-10 h-10 text-slate-700" />
                <p className="text-sm text-slate-600">Select an element to see details</p>
                <p className="text-xs text-slate-700">Click any element in the list on the left</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {/* Element header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-surface-900/60 sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${CAT_COLORS[selectedElement.category]}`}>
                      {selectedElement.tag}
                    </span>
                    <span className="text-sm font-semibold text-white truncate max-w-[200px]">
                      {selectedElement.text || selectedElement.ariaLabel || selectedElement.placeholder || `<${selectedElement.tag}>`}
                    </span>
                  </div>
                  <button className="btn-icon" onClick={() => selectDOMElement(null)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Action + Add to Canvas */}
                  <div className="card p-3 space-y-3">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Plus className="w-3.5 h-3.5 text-cyan-400" /> Add Step to Canvas
                    </div>
                    <div>
                      <label className="label">Action</label>
                      <select
                        className="select text-xs py-1"
                        value={selectedAction}
                        onChange={e => setSelectedAction(e.target.value as ActionType)}
                      >
                        {(ACTIONS_FOR_CATEGORY[selectedElement.category] || ACTIONS_FOR_CATEGORY.all).map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-primary flex-1 justify-center text-xs"
                        onClick={() => addToCanvas('/builder')}
                        title="Add step and open Builder"
                      >
                        <LayersIcon className="w-3.5 h-3.5" /> Add to Builder
                      </button>
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                        onClick={() => addToCanvas('/runner')}
                        title="Add step and run test immediately"
                      >
                        <Play className="w-3.5 h-3.5" /> Run
                      </button>
                    </div>
                  </div>

                  {/* Selectors */}
                  <div className="card p-3 space-y-2">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-green-400" /> Selectors (Priority Order)
                    </div>

                    {[
                      { label: 'Best (auto)', value: selectedElement.selector, quality: selectedElement.selectorQuality },
                      selectedElement.dataTestId && { label: 'data-testid', value: `[data-testid="${selectedElement.dataTestId}"]`, quality: 'excellent' as const },
                      selectedElement.elementId && { label: 'ID', value: `#${selectedElement.elementId}`, quality: 'good' as const },
                      selectedElement.name && { label: 'name', value: `[name="${selectedElement.name}"]`, quality: 'good' as const },
                      selectedElement.ariaLabel && { label: 'aria-label', value: `[aria-label="${selectedElement.ariaLabel}"]`, quality: 'fair' as const },
                      selectedElement.placeholder && { label: 'placeholder', value: `[placeholder="${selectedElement.placeholder}"]`, quality: 'fair' as const },
                      selectedElement.text && ['button','a'].includes(selectedElement.tag) && { label: 'text', value: `text="${selectedElement.text}"`, quality: 'fair' as const },
                      { label: 'XPath', value: selectedElement.xpath, quality: 'poor' as const },
                    ].filter(Boolean).map((s: any) => (
                      <div key={s.label} className="flex items-center gap-2 group">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border w-20 text-center flex-shrink-0 ${QUALITY_BADGE[s.quality].cls}`}>
                          {s.label}
                        </span>
                        <code className="flex-1 text-[10px] text-slate-300 font-mono bg-surface-800 px-2 py-1 rounded border border-slate-700 truncate">
                          {s.value}
                        </code>
                        <button
                          onClick={() => copySelector(s.value)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        >
                          {copiedSel ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-slate-500 hover:text-white" />}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Element attributes */}
                  <div className="card p-3 space-y-2">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-slate-400" /> Attributes
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { k: 'tag',      v: selectedElement.tag },
                        { k: 'type',     v: selectedElement.type },
                        { k: 'id',       v: selectedElement.elementId },
                        { k: 'name',     v: selectedElement.name },
                        { k: 'role',     v: selectedElement.role },
                        { k: 'category', v: selectedElement.category },
                      ].filter(a => a.v).map(a => (
                        <div key={a.k} className="bg-surface-800 rounded border border-slate-700 px-2 py-1">
                          <div className="text-[9px] text-slate-500 uppercase">{a.k}</div>
                          <div className="text-[11px] text-white font-mono truncate">{a.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Boundary Value Analysis */}
                  {bva.length > 0 && (
                    <div className="card p-3 space-y-2">
                      <button
                        className="w-full flex items-center justify-between text-xs font-semibold text-white"
                        onClick={() => setExpandBVA(v => !v)}
                      >
                        <span className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          Boundary Value Analysis
                          <span className="badge badge-warning text-[9px]">{bva.length} values</span>
                        </span>
                        {expandBVA ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      {expandBVA && (
                        <div className="space-y-1">
                          {bva.map((bv, i) => (
                            <BoundaryChip
                              key={i}
                              label={bv.label}
                              value={String(bv.value)}
                              special={['SQL Inject','XSS','Special chars'].includes(bv.label)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
