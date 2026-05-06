import { TestStep } from '../types';
import { useFlow } from '../context/FlowContext';
import {
  Trash2, Copy, GripVertical, Power, ChevronUp, ChevronDown, AlertCircle
} from 'lucide-react';

const ACTION_ICONS: Record<string, string> = {
  visit:'🌐',click:'👆',fill:'✏️',select:'📋',upload:'📎',wait:'⏳',assert:'✅',popup:'🪟',
  hover:'🫱',dblclick:'👆',rightclick:'🖱️',check:'☑️',uncheck:'⬜',focus:'🎯',blur:'💨',
  press:'⌨️',type:'📝',clear:'🗑️',drag:'✋',scroll:'↕️',screenshot:'📸',evaluate:'⚡',
  frame:'🖼️',newpage:'📄',closepage:'❌',reload:'🔄',goback:'⬅️',goforward:'➡️',
  setviewport:'📐',cookie:'🍪',localstorage:'💾',networkrequest:'📡',mockresponse:'🎭',
};

const ACTION_COLOR: Record<string, string> = {
  visit:'chip-visit',click:'chip-click',fill:'chip-fill',select:'chip-select',
  upload:'chip-upload',wait:'chip-wait',assert:'chip-assert',popup:'chip-popup',
  hover:'chip-hover',press:'chip-press',scroll:'chip-scroll',screenshot:'chip-screenshot',
  networkrequest:'chip-mock',mockresponse:'chip-mock',cookie:'chip-mock',localstorage:'chip-mock',
};

function getSubtitle(step: TestStep): string {
  if (step.action === 'visit')      return step.url ?? '';
  if (step.action === 'assert')     return `${step.assertType ?? ''} ${step.assertExpected ? `= "${step.assertExpected}"` : ''}`;
  if (step.action === 'wait' && !step.selector) return step.value ? `${step.value}ms` : 'networkidle';
  if (step.action === 'press')      return step.key ?? '';
  if (step.action === 'setviewport') return `${step.viewportWidth ?? 1280}×${step.viewportHeight ?? 720}`;
  if (step.action === 'mockresponse') return step.mockUrl ?? '';
  if (step.selector)                return step.selector;
  return step.value ?? '';
}

interface StepCardProps {
  step: TestStep;
  index: number;
  isSelected: boolean;
  total: number;
}

export default function StepCard({ step, index, isSelected, total }: StepCardProps) {
  const { selectStep, removeStep, duplicateStep, toggleStep, moveStep } = useFlow();

  const chipClass = ACTION_COLOR[step.action] ?? 'chip-default';
  const subtitle = getSubtitle(step);
  // Only show warning for actions that genuinely need a selector and don't have one
  const NO_SELECTOR_NEEDED = [
    'visit','wait','reload','goback','goforward','newpage','closepage',
    'setviewport','screenshot','evaluate','scroll','cookie','localstorage',
    'mockresponse','popup','frame','networkrequest','press',
  ];
  const hasWarning = !step.selector && !NO_SELECTOR_NEEDED.includes(step.action);

  return (
    <div
      className={`step-card group relative ${!step.enabled ? 'disabled' : ''} ${isSelected ? 'border-brand-500/60 shadow-glow-sm' : ''}`}
      onClick={e => { e.stopPropagation(); selectStep(step.id); }}
    >
      {/* Step number + grip */}
      <div className="flex items-start gap-2">
        {/* Grip handle */}
        <div className="mt-0.5 text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing flex-shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Index */}
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-surface-800 border border-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-400">
          {index + 1}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base leading-none">{ACTION_ICONS[step.action] ?? '⚙️'}</span>
            <span className={`badge border text-[10px] ${chipClass}`}>{step.action}</span>
            <span className="text-xs font-medium text-white truncate">{step.label}</span>
            {hasWarning && !subtitle && (
              <span title="Selector missing">
                <AlertCircle className="w-3 h-3 text-warning flex-shrink-0" />
              </span>
            )}
          </div>

          {subtitle && (
            <div className="mt-1 text-[10px] text-slate-500 font-mono truncate pl-0.5">
              {subtitle}
            </div>
          )}

          {step.comment && (
            <div className="mt-1 text-[10px] text-slate-600 italic truncate">
              // {step.comment}
            </div>
          )}
        </div>

        {/* Actions - visible on hover / selected */}
        <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-150 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            className="btn-icon p-1"
            aria-label="Move up"
            disabled={index === 0}
            onClick={e => { e.stopPropagation(); moveStep(index, index - 1); }}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-icon p-1"
            aria-label="Move down"
            disabled={index === total - 1}
            onClick={e => { e.stopPropagation(); moveStep(index, index + 1); }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-icon p-1"
            aria-label={step.enabled ? 'Disable' : 'Enable'}
            onClick={e => { e.stopPropagation(); toggleStep(step.id); }}
          >
            <Power className={`w-3.5 h-3.5 ${step.enabled ? 'text-success' : 'text-slate-600'}`} />
          </button>
          <button
            className="btn-icon p-1"
            aria-label="Duplicate"
            onClick={e => { e.stopPropagation(); duplicateStep(step.id); }}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            className="btn-icon p-1 text-danger"
            aria-label="Delete"
            onClick={e => { e.stopPropagation(); removeStep(step.id); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-500" />
      )}
    </div>
  );
}
