import { useNavigate } from 'react-router-dom';
import { useFlow } from '../context/FlowContext';
import {
  Wrench, Play, History, Code2, Plus, FolderOpen,
  Zap, ArrowRight, Layers, CheckCircle, Clock
} from 'lucide-react';

const FEATURE_CARDS = [
  { icon: Wrench,  color: 'text-brand-400',   bg: 'bg-brand-500/10  border-brand-500/20',  title: 'Visual Builder',   desc: 'Drag & drop Playwright actions onto canvas', to: '/builder' },
  { icon: Code2,   color: 'text-amber-400',    bg: 'bg-amber-500/10  border-amber-500/20',  title: 'Code Generator',   desc: 'Auto-generate TypeScript Playwright tests',  to: '/generator' },
  { icon: Play,    color: 'text-success',       bg: 'bg-success/10    border-success/20',    title: 'Test Runner',      desc: 'Execute tests directly in the terminal',     to: '/runner' },
  { icon: History, color: 'text-purple-400',   bg: 'bg-purple-500/10 border-purple-500/20', title: 'Flow History',     desc: 'Manage and reload saved test flows',         to: '/history' },
];

const QUICK_ACTIONS = [
  { label: 'New Flow',    icon: Plus,       color: 'btn-primary',    action: 'new' },
  { label: 'Open Flow',   icon: FolderOpen, color: 'btn-secondary',  action: 'history' },
  { label: 'Run Tests',   icon: Play,       color: 'btn-success',    action: 'runner' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { state, newFlow } = useFlow();
  const { currentFlow, savedFlows } = state;

  const handleQuickAction = (action: string) => {
    if (action === 'new') { newFlow(); navigate('/builder'); }
    else navigate(`/${action}`);
  };

  return (
    <div className="h-full overflow-y-auto bg-grid">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Hero */}
        <div className="text-center space-y-3 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-medium mb-2">
            <Zap className="w-3.5 h-3.5" />
            Playwright Test Builder v1.0
          </div>
          <h1 className="text-3xl font-bold text-gradient">Build Playwright Tests Visually</h1>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Drag actions onto the canvas, configure properties, and generate production-ready TypeScript test scripts instantly.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-center gap-3">
          {QUICK_ACTIONS.map(({ label, icon: Icon, color, action }) => (
            <button key={action} className={color} onClick={() => handleQuickAction(action)}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Current Flow Status */}
        <div className="card p-4 glow-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-white">Current Flow</span>
            </div>
            <button className="btn-ghost text-xs" onClick={() => navigate('/builder')}>
              Edit <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-white">{currentFlow.steps.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Steps</div>
            </div>
            <div className="bg-surface-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-success">
                {currentFlow.steps.filter(s => s.enabled).length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Enabled</div>
            </div>
            <div className="bg-surface-800 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-amber-400">
                {currentFlow.steps.filter(s => s.action === 'assert').length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Assertions</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="text-xs text-slate-400 truncate flex-1">
              <span className="text-white font-medium">{currentFlow.name}</span>
              {currentFlow.baseUrl && <> · <span className="text-brand-400">{currentFlow.baseUrl}</span></>}
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-2 gap-3">
          {FEATURE_CARDS.map(({ icon: Icon, color, bg, title, desc, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={`card p-4 text-left hover:scale-[1.02] transition-all duration-200 border ${bg} group`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors">{title}</div>
              <div className="text-xs text-slate-500 mt-1">{desc}</div>
              <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${color}`}>
                Open <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          ))}
        </div>

        {/* Saved Flows */}
        {savedFlows.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-purple-400" />
                Recent Flows
              </span>
              <button className="btn-ghost text-xs" onClick={() => navigate('/history')}>
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {savedFlows.slice(0, 3).map(flow => (
                <div key={flow.id} className="flex items-center gap-3 p-2 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors cursor-pointer" onClick={() => navigate('/history')}>
                  <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
                  <span className="text-sm text-white flex-1 truncate">{flow.name}</span>
                  <span className="text-xs text-slate-500">{flow.stepCount} steps</span>
                  <Clock className="w-3 h-3 text-slate-600" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Supported Actions */}
        <div className="card p-4">
          <div className="text-sm font-semibold text-white mb-3">All Supported Playwright Actions</div>
          <div className="flex flex-wrap gap-1.5">
            {['visit','click','fill','select','upload','wait','assert','popup','hover','dblclick',
              'rightclick','check','uncheck','focus','blur','press','type','clear','drag','scroll',
              'screenshot','evaluate','frame','newpage','closepage','reload','goback','goforward',
              'setviewport','cookie','localstorage','networkrequest','mockresponse'].map(a => (
              <span key={a} className="badge badge-brand text-[10px]">{a}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
