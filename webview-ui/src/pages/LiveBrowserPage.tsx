import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Globe, RefreshCw, ChevronLeft, ChevronRight, X,
  Wifi, WifiOff, Loader, Monitor,
} from 'lucide-react';

const BROWSER_W = 1280;
const BROWSER_H = 720;

export default function LiveBrowserPage() {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const sseRef        = useRef<EventSource | null>(null);
  const sessionIdRef  = useRef<string | null>(null);
  const fpsRef        = useRef(0);
  const fpsTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const imgRef        = useRef(new Image());
  const moveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMove   = useRef<{x:number;y:number} | null>(null);

  const [urlInput,   setUrlInput]   = useState('https://example.com');
  const [currentUrl, setCurrentUrl] = useState('');
  const [connected,  setConnected]  = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [fps,        setFps]        = useState(0);
  const [hasFrame,   setHasFrame]   = useState(false);

  /* ── send a user-interaction event to Playwright ── */
  const sendEvent = useCallback((type: string, data: Record<string, unknown> = {}) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    fetch('/api/live/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type, ...data }),
    }).catch(() => {});
  }, []);

  /* ── draw a JPEG frame onto the canvas ── */
  const drawFrame = useCallback((base64: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = imgRef.current;
    img.onload = () => { ctx.drawImage(img, 0, 0, BROWSER_W, BROWSER_H); setHasFrame(true); };
    img.src = `data:image/jpeg;base64,${base64}`;
    fpsRef.current++;
  }, []);

  /* ── open SSE stream and start session ── */
  const connect = useCallback((initialUrl?: string) => {
    // Tear down existing session
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    if (sessionIdRef.current) {
      fetch('/api/live/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
      sessionIdRef.current = null;
    }

    setConnecting(true);
    setConnected(false);
    setError(null);
    setHasFrame(false);

    const sse = new EventSource('/api/live/stream');
    sseRef.current = sse;

    sse.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          type: string; data?: string; url?: string;
          message?: string; sessionId?: string;
        };

        if (msg.type === 'ready') {
          sessionIdRef.current = msg.sessionId ?? null;
          setConnected(true);
          setConnecting(false);
          setError(null);
          const dest = initialUrl ?? urlInput;
          if (dest) {
            const url = dest.startsWith('http') ? dest : 'https://' + dest;
            sendEvent('navigate', { url });
          }
        } else if (msg.type === 'frame') {
          if (msg.data) drawFrame(msg.data);
          if (msg.url) setCurrentUrl(msg.url);
        } else if (msg.type === 'navigated') {
          if (msg.url) { setCurrentUrl(msg.url); setUrlInput(msg.url); }
        } else if (msg.type === 'error') {
          setError(msg.message ?? 'Unknown error');
        }
      } catch (_) {}
    };

    sse.onerror = () => {
      setError('Connection lost. The Runner Server may have stopped.');
      setConnected(false);
      setConnecting(false);
      sse.close();
      sseRef.current = null;
    };
  }, [urlInput, sendEvent, drawFrame]);

  useEffect(() => {
    connect();
    fpsTimer.current = setInterval(() => { setFps(fpsRef.current); fpsRef.current = 0; }, 1000);
    return () => {
      if (sseRef.current) sseRef.current.close();
      if (sessionIdRef.current) {
        fetch('/api/live/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        }).catch(() => {});
      }
      if (fpsTimer.current) clearInterval(fpsTimer.current);
      if (moveTimer.current) clearTimeout(moveTimer.current);
    };
  }, []);

  const navigate = useCallback(() => {
    let url = urlInput.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = 'https://' + url;
    setUrlInput(url);
    sendEvent('navigate', { url });
  }, [urlInput, sendEvent]);

  /* ── Canvas coordinate mapping ── */
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left)  * (BROWSER_W / r.width)),
      y: Math.round((e.clientY - r.top)   * (BROWSER_H / r.height)),
    };
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!connected) return;
    const { x, y } = getCoords(e);
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    if (e.type === 'dblclick') sendEvent('dblclick', { x, y });
    else sendEvent('click', { x, y, button });
    canvasRef.current?.focus();
  };

  /* Throttled mousemove — flush at most every 50 ms */
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!connected) return;
    const { x, y } = getCoords(e);
    pendingMove.current = { x, y };
    if (!moveTimer.current) {
      moveTimer.current = setTimeout(() => {
        if (pendingMove.current) sendEvent('mousemove', pendingMove.current);
        pendingMove.current = null;
        moveTimer.current = null;
      }, 50);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!connected) return;
    sendEvent('wheel', { deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!connected) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      sendEvent('type', { text: e.key });
    } else {
      const map: Record<string, string> = {
        Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter', Tab: 'Tab',
        Escape: 'Escape', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
        Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
        ' ': 'Space',
      };
      const key = e.ctrlKey ? `Control+${e.key.toLowerCase()}` : map[e.key];
      if (key) sendEvent('keydown', { key });
    }
  };

  const hostname = (() => { try { return new URL(currentUrl).hostname; } catch { return 'no page'; } })();

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="page-header flex-shrink-0 !py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
            connected ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-slate-700/30 border-slate-700/50'
          }`}>
            <Monitor className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Live Browser</h1>
            <p className="text-xs text-slate-500">
              {connecting ? 'Launching Chromium…'
                : connected ? `Live · ${fps} fps · ${hostname}`
                : 'Disconnected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />LIVE
            </span>
          )}
          <button className="btn-secondary text-xs" onClick={() => connect()} disabled={connecting}>
            {connecting
              ? <><Loader className="w-4 h-4 animate-spin" /> Launching…</>
              : <><RefreshCw className="w-4 h-4" /> Reconnect</>}
          </button>
        </div>
      </div>

      {/* ── Browser chrome / URL bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] border-b border-slate-800 flex-shrink-0">
        <button title="Back"    className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 disabled:opacity-30 transition-colors" disabled={!connected} onClick={() => sendEvent('goback')}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button title="Forward" className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 disabled:opacity-30 transition-colors" disabled={!connected} onClick={() => sendEvent('goforward')}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button title="Reload"  className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 disabled:opacity-30 transition-colors" disabled={!connected} onClick={() => sendEvent('reload')}>
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1 flex items-center gap-2 bg-slate-900/80 rounded-lg px-3 py-1.5 border border-slate-700/50 focus-within:border-brand-500/60 transition-colors">
          {connected
            ? <Wifi    className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            : <WifiOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && navigate()}
            onFocus={e => e.target.select()}
            placeholder="Enter a URL and press Enter…"
            className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600 font-mono min-w-0"
          />
          {urlInput && (
            <button onClick={() => setUrlInput('')} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button onClick={navigate} disabled={!connected}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-colors">
          Go
        </button>
      </div>

      {/* ── Error bar ── */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center gap-2 flex-shrink-0">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-200 transition-colors"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Canvas viewport ── */}
      <div className="flex-1 overflow-hidden bg-[#080c12] flex items-center justify-center relative min-h-0">

        {/* Overlay when not connected or no frame yet */}
        {!hasFrame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none">
            {connecting ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <Loader className="w-8 h-8 text-brand-400 animate-spin" />
                </div>
                <p className="text-sm font-semibold text-white">Starting browser…</p>
                <p className="text-xs text-slate-500">Launching real Chromium, please wait</p>
              </>
            ) : !connected ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-slate-700/20 border border-slate-700/40 flex items-center justify-center">
                  <WifiOff className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-sm font-semibold text-white">No session</p>
                <button className="btn-primary pointer-events-auto" onClick={() => connect()}>Connect</button>
              </>
            ) : (
              <>
                <Globe className="w-10 h-10 text-slate-600 animate-pulse" />
                <p className="text-xs text-slate-500">Navigating…</p>
              </>
            )}
          </div>
        )}

        {/* Interaction hint */}
        {connected && hasFrame && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none">
            <span className="text-[10px] text-slate-600 bg-slate-900/80 px-2 py-1 rounded-full border border-slate-800">
              Click canvas · scroll · type to interact
            </span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={BROWSER_W}
          height={BROWSER_H}
          tabIndex={0}
          onClick={handleClick}
          onDoubleClick={handleClick}
          onContextMenu={handleClick}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            cursor: connected ? 'default' : 'not-allowed',
            outline: 'none',
          }}
          className={`transition-opacity duration-500 ${hasFrame ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    </div>
  );
}
