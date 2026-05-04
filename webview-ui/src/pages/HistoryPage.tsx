import { useFlow } from '../context/FlowContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useVSCodeListener } from '../hooks/useVSCode';
import { FlowSummary } from '../types';
import {
  History, Plus, Trash2, Edit3, Play, Search, Tag,
  Clock, Layers, FolderOpen, ChevronRight
} from 'lucide-react';

export default function HistoryPage() {
  const { state, loadFlow, deleteFlow, newFlow, showToast } = useFlow();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [flows, setFlows] = useState<FlowSummary[]>(state.savedFlows);

  useEffect(() => {
    setFlows(state.savedFlows);
  }, [state.savedFlows]);

  useVSCodeListener('FLOW_LOADED', () => navigate('/builder'));

  const filtered = flows.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.description?.toLowerCase().includes(search.toLowerCase()) ||
    f.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleLoad = (id: string) => { loadFlow(id); };
  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete flow "${name}"?`)) deleteFlow(id);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    if (m < 1440)return `${Math.floor(m/60)}h ago`;
    return `${Math.floor(m/1440)}d ago`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="page-header flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <History className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Flow History</h1>
            <p className="text-xs text-slate-500">{flows.length} saved flow{flows.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => { newFlow(); navigate('/builder'); }}>
          <Plus className="w-4 h-4" /> New Flow
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Search flows by name, description or tag…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="w-16 h-16 rounded-2xl bg-surface-800 border border-slate-700 flex items-center justify-center">
              <FolderOpen className="w-7 h-7 text-slate-500" />
            </div>
            <div>
              <p className="text-white font-semibold">No flows found</p>
              <p className="text-xs text-slate-500 mt-1">
                {search ? 'Try a different search term' : 'Build your first test flow in the Builder'}
              </p>
            </div>
            <button className="btn-primary" onClick={() => { newFlow(); navigate('/builder'); }}>
              <Plus className="w-4 h-4" /> Create First Flow
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map(flow => (
              <div key={flow.id} className="card p-4 hover:border-slate-600 transition-all duration-200 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors truncate">
                        {flow.name}
                      </h3>
                    </div>
                    {flow.description && (
                      <p className="text-xs text-slate-500 mb-2 truncate">{flow.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {flow.stepCount} steps
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(flow.updatedAt)}
                      </span>
                    </div>
                    {flow.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {flow.tags.map(tag => (
                          <span key={tag} className="badge badge-brand text-[10px]">
                            <Tag className="w-2.5 h-2.5" /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      className="btn-icon text-brand-400"
                      title="Load & Edit"
                      onClick={() => handleLoad(flow.id)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      className="btn-icon text-success"
                      title="Load & Run"
                      onClick={() => { handleLoad(flow.id); setTimeout(() => navigate('/runner'), 300); }}
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      className="btn-icon text-danger"
                      title="Delete"
                      onClick={() => handleDelete(flow.id, flow.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
