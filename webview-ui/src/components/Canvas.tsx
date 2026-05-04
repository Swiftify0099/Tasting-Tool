import { useFlow } from '../context/FlowContext';
import { TestStep } from '../types';
import StepCard from './StepCard';
import { Trash2, Copy, ClipboardList, PlusCircle } from 'lucide-react';

export default function Canvas() {
  const { state, addStep, reorderSteps, clearSteps, selectStep } = useFlow();
  const { currentFlow, selectedStepId } = state;
  const steps = currentFlow.steps;

  /* drag-over-step reorder */
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnStep = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    const action = e.dataTransfer.getData('action');
    const fromIdx = e.dataTransfer.getData('fromIdx');

    if (action) {
      addStep(action as import('../types').ActionType);
      return;
    }
    if (fromIdx !== '') {
      const from = parseInt(fromIdx);
      if (from === targetIdx) return;
      const updated = [...steps];
      const [moved] = updated.splice(from, 1);
      updated.splice(targetIdx, 0, moved);
      reorderSteps(updated);
    }
  };

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    const action = e.dataTransfer.getData('action');
    if (action) addStep(action as import('../types').ActionType);
  };

  const enabledCount = steps.filter(s => s.enabled).length;
  const assertCount  = steps.filter(s => s.action === 'assert').length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Canvas header */}
      <div className="section-header flex-shrink-0">
        <span className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5 text-brand-400" />
          Canvas
          <span className="badge badge-brand ml-1">{steps.length}</span>
        </span>
        <div className="flex items-center gap-1">
          {assertCount > 0 && (
            <span className="badge badge-success text-[10px]">{assertCount} assert</span>
          )}
          {steps.length > 0 && (
            <button
              className="btn-icon text-danger"
              title="Clear all steps"
              onClick={() => { if (confirm('Clear all steps?')) clearSteps(); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-2"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDropOnCanvas}
        onClick={() => selectStep(null)}
      >
        {steps.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full min-h-48 border-2 border-dashed border-slate-700 rounded-xl text-center gap-3 hover:border-brand-500/50 transition-colors duration-200 cursor-default"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDropOnCanvas}
          >
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
              <PlusCircle className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400 font-medium">Drop actions here</p>
              <p className="text-xs text-slate-600 mt-1">Click actions in the toolbox or drag them onto the canvas</p>
            </div>
          </div>
        ) : (
          <>
            {steps.map((step, idx) => (
              <div
                key={step.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('fromIdx', String(idx));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={e => { e.stopPropagation(); handleDropOnStep(e, idx); }}
              >
                <StepCard
                  step={step}
                  index={idx}
                  isSelected={step.id === selectedStepId}
                  total={steps.length}
                />
              </div>
            ))}

            {/* Bottom drop target */}
            <div
              className="h-10 border-2 border-dashed border-slate-800 rounded-lg flex items-center justify-center text-xs text-slate-700 hover:border-brand-500/40 hover:text-slate-500 transition-colors"
              onDragOver={e => e.preventDefault()}
              onDrop={handleDropOnCanvas}
            >
              Drop here to append
            </div>
          </>
        )}
      </div>

      {/* Footer stats */}
      {steps.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 border-t border-slate-800 bg-surface-900/40 text-xs text-slate-500 flex-shrink-0">
          <span>{steps.length} total</span>
          <span className="text-success">{enabledCount} enabled</span>
          <span className="text-slate-600">{steps.length - enabledCount} disabled</span>
          {assertCount > 0 && <span className="text-green-400">{assertCount} assertions</span>}
        </div>
      )}
    </div>
  );
}
