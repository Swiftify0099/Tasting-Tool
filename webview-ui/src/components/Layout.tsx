import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useFlow } from '../context/FlowContext';
import Toast from './Toast';
import {
  Home, Wrench, Code2, Play, History, Settings, Zap, ChevronRight, Sparkles, Crosshair
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/home',         icon: Home,      label: 'Home',        desc: 'Dashboard & overview' },
  { to: '/builder',      icon: Wrench,    label: 'Builder',     desc: 'Build test steps' },
  { to: '/dom-inspector',icon: Crosshair, label: 'Inspector',   desc: 'Extract DOM elements' },
  { to: '/ai',           icon: Sparkles,  label: 'AI Gen',      desc: 'Generate with AI' },
  { to: '/generator',    icon: Code2,     label: 'Generator',   desc: 'Code preview & export' },
  { to: '/runner',       icon: Play,      label: 'Runner',      desc: 'Run & debug tests' },
  { to: '/history',      icon: History,   label: 'History',     desc: 'Saved flows' },
  { to: '/settings',     icon: Settings,  label: 'Settings',    desc: 'Configure options' },
];

export default function Layout() {
  const { state } = useFlow();
  const location = useLocation();

  const currentPage = NAV_ITEMS.find(n => location.pathname.startsWith(n.to));

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[200px] flex-shrink-0 flex flex-col bg-surface-900 border-r border-slate-800">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold text-white leading-tight">PW Builder</div>
            <div className="text-[10px] text-slate-500">Playwright Studio</div>
          </div>
        </div>

        {/* Flow indicator */}
        <div className="px-3 py-2 mx-2 my-2 bg-surface-800 rounded-lg border border-slate-700">
          <div className="text-[10px] text-slate-500 mb-0.5">Active Flow</div>
          <div className="text-xs text-white font-medium truncate">{state.currentFlow.name}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {state.currentFlow.steps.length} step{state.currentFlow.steps.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto no-scrollbar">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom status */}
        <div className="px-3 py-3 border-t border-slate-800">
          {state.isSaving && (
            <div className="flex items-center gap-2 text-[10px] text-brand-400">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              Saving…
            </div>
          )}
          {state.isGenerating && (
            <div className="flex items-center gap-2 text-[10px] text-amber-400">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Generating…
            </div>
          )}
          {!state.isSaving && !state.isGenerating && (
            <div className="flex items-center gap-2 text-[10px] text-success">
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
              Ready
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top breadcrumb bar */}
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-surface-900/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Zap className="w-3.5 h-3.5 text-brand-400" />
            <ChevronRight className="w-3 h-3" />
            <span className="text-white font-medium">{currentPage?.label ?? 'Dashboard'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>v1.0.0</span>
            <div className="w-1 h-1 rounded-full bg-slate-700" />
            <span>Playwright Studio</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* Toast */}
      <Toast />
    </div>
  );
}
