import { ActionType, ToolboxAction } from '../types';
import { useFlow } from '../context/FlowContext';
import { useState } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';

const TOOLBOX_ACTIONS: ToolboxAction[] = [
  // Navigation
  { action:'visit',        label:'Visit URL',       icon:'🌐', category:'navigation', description:'Navigate to a URL',                  color:'chip-visit'  },
  { action:'reload',       label:'Reload',          icon:'🔄', category:'navigation', description:'Reload current page',               color:'chip-visit'  },
  { action:'goback',       label:'Go Back',         icon:'⬅️', category:'navigation', description:'Navigate browser back',             color:'chip-visit'  },
  { action:'goforward',    label:'Go Forward',      icon:'➡️', category:'navigation', description:'Navigate browser forward',          color:'chip-visit'  },
  { action:'newpage',      label:'New Page',        icon:'📄', category:'navigation', description:'Open a new browser tab',            color:'chip-visit'  },
  { action:'closepage',    label:'Close Page',      icon:'❌', category:'navigation', description:'Close current page',                color:'chip-visit'  },
  // Interaction
  { action:'click',        label:'Click',           icon:'👆', category:'interaction', description:'Click on an element',             color:'chip-click'  },
  { action:'dblclick',     label:'Double Click',    icon:'👆', category:'interaction', description:'Double-click an element',         color:'chip-click'  },
  { action:'rightclick',   label:'Right Click',     icon:'🖱️', category:'interaction', description:'Right-click context menu',        color:'chip-click'  },
  { action:'hover',        label:'Hover',           icon:'🫱', category:'interaction', description:'Hover over element',              color:'chip-hover'  },
  { action:'drag',         label:'Drag & Drop',     icon:'✋', category:'interaction', description:'Drag element to target',          color:'chip-hover'  },
  { action:'scroll',       label:'Scroll',          icon:'↕️', category:'interaction', description:'Scroll page to position',         color:'chip-scroll' },
  { action:'popup',        label:'Handle Popup',    icon:'🪟', category:'interaction', description:'Wait and handle popup window',    color:'chip-popup'  },
  { action:'press',        label:'Press Key',       icon:'⌨️', category:'interaction', description:'Press a keyboard key',            color:'chip-press'  },
  { action:'focus',        label:'Focus',           icon:'🎯', category:'interaction', description:'Focus an element',                color:'chip-default'},
  { action:'blur',         label:'Blur',            icon:'💨', category:'interaction', description:'Remove focus from element',        color:'chip-default'},
  // Input
  { action:'fill',         label:'Fill Input',      icon:'✏️', category:'input', description:'Fill an input field',                  color:'chip-fill'   },
  { action:'type',         label:'Type Text',       icon:'📝', category:'input', description:'Type text with key events',            color:'chip-fill'   },
  { action:'clear',        label:'Clear Input',     icon:'🗑️', category:'input', description:'Clear an input field',                 color:'chip-fill'   },
  { action:'select',       label:'Select Option',   icon:'📋', category:'input', description:'Choose a dropdown option',             color:'chip-select' },
  { action:'check',        label:'Check',           icon:'☑️', category:'input', description:'Check a checkbox',                     color:'chip-select' },
  { action:'uncheck',      label:'Uncheck',         icon:'⬜', category:'input', description:'Uncheck a checkbox',                   color:'chip-select' },
  { action:'upload',       label:'Upload File',     icon:'📎', category:'input', description:'Upload a file',                        color:'chip-upload' },
  // Assertion
  { action:'assert',       label:'Assert',          icon:'✅', category:'assertion', description:'Assert element/page state',         color:'chip-assert' },
  { action:'screenshot',   label:'Screenshot',      icon:'📸', category:'assertion', description:'Take a screenshot',                color:'chip-screenshot'},
  // Advanced
  { action:'wait',         label:'Wait',            icon:'⏳', category:'advanced', description:'Wait for time/selector/state',       color:'chip-wait'   },
  { action:'evaluate',     label:'Evaluate JS',     icon:'⚡', category:'advanced', description:'Execute JavaScript on page',         color:'chip-default'},
  { action:'frame',        label:'Frame Action',    icon:'🖼️', category:'advanced', description:'Interact inside an iframe',          color:'chip-default'},
  { action:'setviewport',  label:'Set Viewport',    icon:'📐', category:'advanced', description:'Change browser viewport size',       color:'chip-default'},
  // Network
  { action:'networkrequest',label:'Network Wait',   icon:'📡', category:'network', description:'Wait for network request',           color:'chip-mock'   },
  { action:'mockresponse', label:'Mock Response',   icon:'🎭', category:'network', description:'Intercept & mock API response',      color:'chip-mock'   },
  { action:'cookie',       label:'Set Cookie',      icon:'🍪', category:'network', description:'Add/set a browser cookie',           color:'chip-mock'   },
  { action:'localstorage', label:'LocalStorage',    icon:'💾', category:'network', description:'Set a localStorage value',           color:'chip-mock'   },
];

const CATEGORIES = [
  { id: 'navigation',  label: 'Navigation',   color: 'text-sky-400' },
  { id: 'interaction', label: 'Interaction',  color: 'text-blue-400' },
  { id: 'input',       label: 'Input',        color: 'text-violet-400' },
  { id: 'assertion',   label: 'Assertion',    color: 'text-green-400' },
  { id: 'advanced',    label: 'Advanced',     color: 'text-amber-400' },
  { id: 'network',     label: 'Network',      color: 'text-fuchsia-400' },
];

export default function Toolbox() {
  const { addStep } = useFlow();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (id: string) =>
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const filtered = TOOLBOX_ACTIONS.filter(a =>
    a.label.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  const groupedFiltered = CATEGORIES.map(cat => ({
    ...cat,
    items: filtered.filter(a => a.category === cat.id),
  })).filter(g => g.items.length > 0);

  return (
    <div className="flex flex-col h-full bg-surface-900 border-r border-slate-800">
      {/* Header */}
      <div className="section-header flex-shrink-0">
        <span>Toolbox</span>
        <span className="badge badge-brand">{TOOLBOX_ACTIONS.length}</span>
      </div>

      {/* Search */}
      <div className="px-2 py-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            className="input-sm pl-7"
            placeholder="Search actions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Actions list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2 no-scrollbar">
        {groupedFiltered.map(({ id, label, color, items }) => (
          <div key={id}>
            <button
              className="w-full flex items-center justify-between px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
              onClick={() => toggleCategory(id)}
            >
              <span className={color}>{label}</span>
              {collapsed[id]
                ? <ChevronRight className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />}
            </button>

            {!collapsed[id] && (
              <div className="space-y-1">
                {items.map(tool => (
                  <button
                    key={tool.action}
                    className="tool-item w-full text-left"
                    title={tool.description}
                    onClick={() => addStep(tool.action as ActionType)}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('action', tool.action)}
                  >
                    <span className="text-base leading-none flex-shrink-0">{tool.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-300 group-hover:text-white truncate">{tool.label}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-600 text-xs">
            No actions match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
