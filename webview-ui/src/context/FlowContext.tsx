import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { TestFlow, TestStep, FlowSummary, GeneratorOptions } from '../types';
import { useVSCode, useVSCodeListener } from '../hooks/useVSCode';

function uuid(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function flowId(): string {
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newFlow(): TestFlow {
  const visitStep: TestStep = {
    id: uuid(),
    action: 'visit',
    label: 'Visit URL',
    url: 'https://',
    enabled: true,
    timeout: 30000,
    comment: 'Start by visiting your target URL',
  };
  return {
    id: flowId(),
    name: 'Untitled Flow',
    description: '',
    baseUrl: 'https://',
    steps: [visitStep],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    version: '1.0.0',
  };
}

const DEFAULT_OPTIONS: GeneratorOptions = {
  includeComments: true,
  useBoundaryValues: false,
  testFramework: 'playwright',
  browserType: 'chromium',
  headless: true,
  timeout: 30000,
  retries: 0,
  screenshotOnFailure: true,
  videoOnFailure: false,
};

interface FlowState {
  currentFlow: TestFlow;
  savedFlows: FlowSummary[];
  selectedStepId: string | null;
  generatedCode: string;
  generatorOptions: GeneratorOptions;
  isSaving: boolean;
  isGenerating: boolean;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
}

type Action =
  | { type: 'SET_FLOW'; flow: TestFlow }
  | { type: 'NEW_FLOW' }
  | { type: 'UPDATE_FLOW'; patch: Partial<TestFlow> }
  | { type: 'ADD_STEP'; step: TestStep }
  | { type: 'IMPORT_STEPS'; steps: TestStep[] }
  | { type: 'UPDATE_STEP'; id: string; patch: Partial<TestStep> }
  | { type: 'REMOVE_STEP'; id: string }
  | { type: 'MOVE_STEP'; from: number; to: number }
  | { type: 'DUPLICATE_STEP'; id: string }
  | { type: 'TOGGLE_STEP'; id: string }
  | { type: 'SELECT_STEP'; id: string | null }
  | { type: 'SET_FLOWS'; flows: FlowSummary[] }
  | { type: 'SET_GENERATED'; code: string }
  | { type: 'SET_OPTIONS'; opts: Partial<GeneratorOptions> }
  | { type: 'SET_SAVING'; val: boolean }
  | { type: 'SET_GENERATING'; val: boolean }
  | { type: 'SHOW_TOAST'; message: string; kind: 'success' | 'error' | 'info' }
  | { type: 'CLEAR_TOAST' }
  | { type: 'CLEAR_STEPS' }
  | { type: 'REORDER_STEPS'; steps: TestStep[] };

function reducer(state: FlowState, action: Action): FlowState {
  switch (action.type) {
    case 'SET_FLOW':       return { ...state, currentFlow: action.flow, selectedStepId: null };
    case 'NEW_FLOW':       return { ...state, currentFlow: newFlow(), selectedStepId: null, generatedCode: '' };
    case 'UPDATE_FLOW':    return { ...state, currentFlow: { ...state.currentFlow, ...action.patch } };
    case 'ADD_STEP':       return {
      ...state,
      currentFlow: { ...state.currentFlow, steps: [...state.currentFlow.steps, action.step] },
      selectedStepId: action.step.id,
    };
    case 'IMPORT_STEPS':   return {
      ...state,
      currentFlow: { ...state.currentFlow, steps: [...state.currentFlow.steps, ...action.steps] },
      selectedStepId: action.steps.length > 0 ? action.steps[action.steps.length - 1].id : state.selectedStepId,
    };
    case 'UPDATE_STEP':    return { ...state, currentFlow: { ...state.currentFlow, steps: state.currentFlow.steps.map(s => s.id === action.id ? { ...s, ...action.patch } : s) } };
    case 'REMOVE_STEP':    return { ...state, currentFlow: { ...state.currentFlow, steps: state.currentFlow.steps.filter(s => s.id !== action.id) }, selectedStepId: state.selectedStepId === action.id ? null : state.selectedStepId };
    case 'MOVE_STEP': {
      const steps = [...state.currentFlow.steps];
      const [moved] = steps.splice(action.from, 1);
      steps.splice(action.to, 0, moved);
      return { ...state, currentFlow: { ...state.currentFlow, steps } };
    }
    case 'DUPLICATE_STEP': {
      const idx = state.currentFlow.steps.findIndex(s => s.id === action.id);
      if (idx === -1) return state;
      const clone = { ...state.currentFlow.steps[idx], id: uuid(), label: state.currentFlow.steps[idx].label + ' (copy)' };
      const steps = [...state.currentFlow.steps];
      steps.splice(idx + 1, 0, clone);
      return { ...state, currentFlow: { ...state.currentFlow, steps } };
    }
    case 'TOGGLE_STEP':    return { ...state, currentFlow: { ...state.currentFlow, steps: state.currentFlow.steps.map(s => s.id === action.id ? { ...s, enabled: !s.enabled } : s) } };
    case 'SELECT_STEP':    return { ...state, selectedStepId: action.id };
    case 'SET_FLOWS':      return { ...state, savedFlows: action.flows };
    case 'SET_GENERATED':  return { ...state, generatedCode: action.code };
    case 'SET_OPTIONS':    return { ...state, generatorOptions: { ...state.generatorOptions, ...action.opts } };
    case 'SET_SAVING':     return { ...state, isSaving: action.val };
    case 'SET_GENERATING': return { ...state, isGenerating: action.val };
    case 'SHOW_TOAST':     return { ...state, toast: { message: action.message, type: action.kind } };
    case 'CLEAR_TOAST':    return { ...state, toast: null };
    case 'CLEAR_STEPS':    return { ...state, currentFlow: { ...state.currentFlow, steps: [] }, selectedStepId: null };
    case 'REORDER_STEPS':  return { ...state, currentFlow: { ...state.currentFlow, steps: action.steps } };
    default:               return state;
  }
}

interface FlowContextValue {
  state: FlowState;
  addStep: (action: import('../types').ActionType) => void;
  importSteps: (steps: Partial<TestStep>[]) => void;
  updateStep: (id: string, patch: Partial<TestStep>) => void;
  removeStep: (id: string) => void;
  moveStep: (from: number, to: number) => void;
  duplicateStep: (id: string) => void;
  toggleStep: (id: string) => void;
  selectStep: (id: string | null) => void;
  updateFlow: (patch: Partial<TestFlow>) => void;
  newFlow: () => void;
  saveFlow: () => void;
  loadFlow: (id: string) => void;
  deleteFlow: (id: string) => void;
  generateTest: () => void;
  runTest: () => void;
  setOptions: (opts: Partial<GeneratorOptions>) => void;
  clearSteps: () => void;
  reorderSteps: (steps: TestStep[]) => void;
  showToast: (message: string, kind?: 'success' | 'error' | 'info') => void;
  exportJson: () => void;
  selectedStep: TestStep | null;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    currentFlow: newFlow(),
    savedFlows: [],
    selectedStepId: null,
    generatedCode: '',
    generatorOptions: DEFAULT_OPTIONS,
    isSaving: false,
    isGenerating: false,
    toast: null,
  });

  const { postMessage } = useVSCode();

  useVSCodeListener('FLOW_SAVED', () => {
    dispatch({ type: 'SET_SAVING', val: false });
    dispatch({ type: 'SHOW_TOAST', message: 'Flow saved!', kind: 'success' });
  });

  useVSCodeListener('FLOWS_LIST', (payload) => {
    dispatch({ type: 'SET_FLOWS', flows: payload as FlowSummary[] });
  });

  useVSCodeListener('FLOW_LOADED', (payload) => {
    dispatch({ type: 'SET_FLOW', flow: payload as TestFlow });
    dispatch({ type: 'SHOW_TOAST', message: 'Flow loaded!', kind: 'info' });
  });

  useVSCodeListener('TEST_GENERATED', (payload) => {
    const p = payload as { code: string; path: string };
    dispatch({ type: 'SET_GENERATED', code: p.code });
    dispatch({ type: 'SET_GENERATING', val: false });
    dispatch({ type: 'SHOW_TOAST', message: `Test generated: ${p.path}`, kind: 'success' });
  });

  useVSCodeListener('FLOW_DELETED', (payload) => {
    const { flowId } = payload as { flowId: string };
    dispatch({ type: 'SET_FLOWS', flows: state.savedFlows.filter(f => f.id !== flowId) });
    dispatch({ type: 'SHOW_TOAST', message: 'Flow deleted', kind: 'info' });
  });

  useVSCodeListener('ERROR', (payload) => {
    dispatch({ type: 'SET_SAVING', val: false });
    dispatch({ type: 'SET_GENERATING', val: false });
    dispatch({ type: 'SHOW_TOAST', message: `Error: ${payload}`, kind: 'error' });
  });

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 3500);
    return () => clearTimeout(t);
  }, [state.toast]);

  useEffect(() => { postMessage('GET_FLOWS'); }, []);

  const ACTION_LABELS: Record<string, string> = {
    visit: 'Visit URL', click: 'Click Element', fill: 'Fill Input', select: 'Select Option',
    upload: 'Upload File', wait: 'Wait', assert: 'Assert', popup: 'Handle Popup',
    hover: 'Hover', dblclick: 'Double Click', rightclick: 'Right Click', check: 'Check',
    uncheck: 'Uncheck', focus: 'Focus', blur: 'Blur', press: 'Press Key', type: 'Type Text',
    clear: 'Clear Input', drag: 'Drag & Drop', scroll: 'Scroll', screenshot: 'Screenshot',
    evaluate: 'Evaluate JS', frame: 'Frame Action', newpage: 'New Page', closepage: 'Close Page',
    reload: 'Reload Page', goback: 'Go Back', goforward: 'Go Forward', setviewport: 'Set Viewport',
    cookie: 'Set Cookie', localstorage: 'Set LocalStorage', networkrequest: 'Network Request',
    mockresponse: 'Mock Response',
  };

  const addStep = useCallback((action: import('../types').ActionType) => {
    const step: TestStep = {
      id: uuid(),
      action,
      label: ACTION_LABELS[action] ?? action,
      enabled: true,
      timeout: 5000,
    };
    dispatch({ type: 'ADD_STEP', step });
  }, []);

  const importSteps = useCallback((steps: Partial<TestStep>[]) => {
    const fullSteps: TestStep[] = steps.map((s, i) => ({
      id: `ai_step_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      action: (s.action ?? 'click') as import('../types').ActionType,
      label: s.label ?? ACTION_LABELS[s.action ?? 'click'] ?? s.action ?? `Step ${i + 1}`,
      enabled: true,
      timeout: 5000,
      selector: s.selector ?? '',
      value: s.value ?? '',
      url: s.url ?? '',
      key: s.key,
      assertType: s.assertType,
      assertSelector: s.assertSelector,
      assertExpected: s.assertExpected,
      comment: s.comment ?? 'AI generated',
    }));
    dispatch({ type: 'IMPORT_STEPS', steps: fullSteps });
  }, []);

  const updateStep = useCallback((id: string, patch: Partial<TestStep>) => {
    dispatch({ type: 'UPDATE_STEP', id, patch });
  }, []);

  const removeStep = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_STEP', id });
  }, []);

  const moveStep = useCallback((from: number, to: number) => {
    dispatch({ type: 'MOVE_STEP', from, to });
  }, []);

  const duplicateStep = useCallback((id: string) => {
    dispatch({ type: 'DUPLICATE_STEP', id });
  }, []);

  const toggleStep = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_STEP', id });
  }, []);

  const selectStep = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_STEP', id });
  }, []);

  const updateFlow = useCallback((patch: Partial<TestFlow>) => {
    dispatch({ type: 'UPDATE_FLOW', patch });
  }, []);

  const handleNewFlow = useCallback(() => {
    dispatch({ type: 'NEW_FLOW' });
  }, []);

  const saveFlow = useCallback(() => {
    dispatch({ type: 'SET_SAVING', val: true });
    postMessage('SAVE_FLOW', state.currentFlow);
  }, [state.currentFlow, postMessage]);

  const loadFlow = useCallback((id: string) => {
    postMessage('LOAD_FLOW', id);
  }, [postMessage]);

  const deleteFlow = useCallback((id: string) => {
    postMessage('DELETE_FLOW', id);
  }, [postMessage]);

  const generateTest = useCallback(() => {
    dispatch({ type: 'SET_GENERATING', val: true });
    postMessage('GENERATE_TEST', { flow: state.currentFlow, options: state.generatorOptions });
  }, [state.currentFlow, state.generatorOptions, postMessage]);

  const runTest = useCallback(() => {
    postMessage('RUN_TEST', state.currentFlow);
  }, [state.currentFlow, postMessage]);

  const setOptions = useCallback((opts: Partial<GeneratorOptions>) => {
    dispatch({ type: 'SET_OPTIONS', opts });
  }, []);

  const clearSteps = useCallback(() => {
    dispatch({ type: 'CLEAR_STEPS' });
  }, []);

  const reorderSteps = useCallback((steps: TestStep[]) => {
    dispatch({ type: 'REORDER_STEPS', steps });
  }, []);

  const showToast = useCallback((message: string, kind: 'success' | 'error' | 'info' = 'info') => {
    dispatch({ type: 'SHOW_TOAST', message, kind });
  }, []);

  const exportJson = useCallback(() => {
    postMessage('EXPORT_JSON', state.currentFlow);
  }, [state.currentFlow, postMessage]);

  const selectedStep = state.currentFlow.steps.find(s => s.id === state.selectedStepId) ?? null;

  return (
    <FlowContext.Provider value={{
      state, addStep, importSteps, updateStep, removeStep, moveStep, duplicateStep,
      toggleStep, selectStep, updateFlow, newFlow: handleNewFlow,
      saveFlow, loadFlow, deleteFlow, generateTest, runTest,
      setOptions, clearSteps, reorderSteps, showToast, exportJson, selectedStep,
    }}>
      {children}
    </FlowContext.Provider>
  );
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow must be used within FlowProvider');
  return ctx;
}
