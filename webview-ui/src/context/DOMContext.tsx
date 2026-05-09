import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { DOMElement } from '../types';

interface DOMState {
  elements: DOMElement[];
  extractedUrl: string;
  isExtracting: boolean;
  selectedElement: DOMElement | null;
  error: string | null;
  lastExtractedAt: string | null;
}

type DOMAction =
  | { type: 'SET_EXTRACTING'; url: string }
  | { type: 'SET_ELEMENTS'; elements: DOMElement[]; url: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SELECT_ELEMENT'; element: DOMElement | null }
  | { type: 'CLEAR' };

function reducer(state: DOMState, action: DOMAction): DOMState {
  switch (action.type) {
    case 'SET_EXTRACTING':
      return { ...state, isExtracting: true, error: null, extractedUrl: action.url };
    case 'SET_ELEMENTS':
      return {
        ...state, isExtracting: false, error: null,
        elements: action.elements, extractedUrl: action.url,
        lastExtractedAt: new Date().toISOString(),
      };
    case 'SET_ERROR':
      return { ...state, isExtracting: false, error: action.error };
    case 'SELECT_ELEMENT':
      return { ...state, selectedElement: action.element };
    case 'CLEAR':
      return { ...state, elements: [], selectedElement: null, error: null };
    default:
      return state;
  }
}

interface DOMContextValue {
  domState: DOMState;
  extractDOM: (url: string) => void;
  selectDOMElement: (el: DOMElement | null) => void;
  clearDOM: () => void;
  getElementsForAction: (action: string) => DOMElement[];
}

const DOMContext = createContext<DOMContextValue | null>(null);

export function DOMProvider({ children }: { children: React.ReactNode }) {
  const [domState, dispatch] = useReducer(reducer, {
    elements: [],
    extractedUrl: '',
    isExtracting: false,
    selectedElement: null,
    error: null,
    lastExtractedAt: null,
  });

  const extractDOM = useCallback((url: string) => {
    dispatch({ type: 'SET_EXTRACTING', url });
    fetch('/api/extract-dom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        dispatch({ type: 'SET_ELEMENTS', elements: data.elements, url: data.url || url });
      })
      .catch((err) => {
        dispatch({ type: 'SET_ERROR', error: err.message || String(err) });
      });
  }, []);

  const selectDOMElement = useCallback((el: DOMElement | null) => {
    dispatch({ type: 'SELECT_ELEMENT', element: el });
  }, []);

  const clearDOM = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const getElementsForAction = useCallback((action: string): DOMElement[] => {
    const { elements } = domState;
    if (!elements.length) return [];
    switch (action) {
      case 'click':
      case 'dblclick':
      case 'rightclick':
      case 'hover':
      case 'focus':
      case 'blur':
        return elements.filter(e =>
          ['button', 'link', 'input', 'select', 'checkbox', 'radio', 'textarea', 'other'].includes(e.category)
        );
      case 'fill':
      case 'type':
      case 'clear':
        return elements.filter(e => ['input', 'textarea'].includes(e.category));
      case 'select':
        return elements.filter(e => e.category === 'select');
      case 'check':
      case 'uncheck':
        return elements.filter(e => ['checkbox', 'radio'].includes(e.category));
      case 'drag':
      case 'upload':
        return elements.filter(e => ['input', 'button', 'other'].includes(e.category));
      default:
        return elements;
    }
  }, [domState]);

  return (
    <DOMContext.Provider value={{ domState, extractDOM, selectDOMElement, clearDOM, getElementsForAction }}>
      {children}
    </DOMContext.Provider>
  );
}

export function useDOM(): DOMContextValue {
  const ctx = useContext(DOMContext);
  if (!ctx) throw new Error('useDOM must be used within DOMProvider');
  return ctx;
}
