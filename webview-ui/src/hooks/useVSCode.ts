import { useCallback, useEffect } from 'react';
import { vscode } from '../vscode';
import { VSCodeMessage, MessageType } from '../types';

type Handler = (payload: unknown) => void;

const listeners = new Map<MessageType, Set<Handler>>();

// Global window message listener (set up once)
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as VSCodeMessage;
    if (!msg?.type) return;
    const handlers = listeners.get(msg.type);
    handlers?.forEach(fn => fn(msg.payload));
  });
}

export function useVSCode() {
  const postMessage = useCallback((type: MessageType, payload?: unknown) => {
    vscode.postMessage({ type, payload });
  }, []);

  const on = useCallback((type: MessageType, handler: Handler) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
    return () => listeners.get(type)?.delete(handler);
  }, []);

  const once = useCallback((type: MessageType, handler: Handler) => {
    const wrapped: Handler = (payload) => {
      handler(payload);
      listeners.get(type)?.delete(wrapped);
    };
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(wrapped);
    return () => listeners.get(type)?.delete(wrapped);
  }, []);

  return { postMessage, on, once };
}

export function useVSCodeListener(type: MessageType, handler: Handler, deps: unknown[] = []) {
  const { on } = useVSCode();
  useEffect(() => {
    const unsub = on(type, handler);
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ...deps]);
}
