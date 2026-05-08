import { useFlow } from '../context/FlowContext';
import { useDOM } from '../context/DOMContext';
import { TestStep, AssertType, DOMElement } from '../types';
import { Settings2, X, Info, Crosshair, ChevronDown, Shield } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ASSERT_TYPES: AssertType[] = ['url','title','text','visibility','enabled','checked','value','attribute','count','screenshot'];
const KEYS = ['Enter','Tab','Escape','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Backspace','Delete','F1','F5','F12'];

export default function PropertiesPanel() {
  const { selectedStep, updateStep, removeStep } = useFlow();
  const { domState, getElementsForAction } = useDOM();
  const navigate = useNavigate();
  const [showDOMPicker, setShowDOMPicker] = useState(false);

  if (!selectedStep) {
    return (
      <div className="flex flex-col h-full bg-surface-900 border-l border-slate-800">
        <div className="section-header flex-shrink-0">
          <span>Properties</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <Settings2 className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-600">Select a step to edit its properties</p>
            {domState.elements.length === 0 && (
              <button
                className="mt-3 text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mx-auto"
                onClick={() => navigate('/dom-inspector')}
              >
                <Crosshair className="w-3 h-3" /> Extract DOM for smart selectors
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const s = selectedStep;
  const upd = (patch: Partial<TestStep>) => updateStep(s.id, patch);

  return (
    <div className="flex flex-col h-full bg-surface-900 border-l border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="section-header flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5 text-brand-400" />
          Properties
        </span>
        <button className="btn-icon p-1" onClick={() => removeStep(s.id)} title="Delete step">
          <X className="w-3.5 h-3.5 text-danger" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">

        {/* Action badge */}
        <div className="flex items-center gap-2 p-2 bg-surface-800 rounded-lg">
          <span className="text-lg">{getIcon(s.action)}</span>
          <div>
            <div className="text-xs font-bold text-white capitalize">{s.action}</div>
            <div className="text-[10px] text-slate-500">{getDesc(s.action)}</div>
          </div>
        </div>

        {/* Label */}
        <Field label="Step Label">
          <input className="input-sm" value={s.label} onChange={e => upd({ label: e.target.value })} />
        </Field>

        {/* Comment */}
        <Field label="Comment">
          <input className="input-sm" placeholder="Optional note…" value={s.comment ?? ''} onChange={e => upd({ comment: e.target.value })} />
        </Field>

        {/* Timeout */}
        <Field label="Timeout (ms)">
          <input type="number" className="input-sm" min={500} max={120000} step={500}
            value={s.timeout ?? 5000} onChange={e => upd({ timeout: parseInt(e.target.value) || 5000 })} />
        </Field>

        {/* ── URL ────────────────────────────────── */}
        {['visit','newpage'].includes(s.action) && (
          <Field label="URL" required>
            <input className="input-sm" placeholder="https://example.com"
              value={s.url ?? ''} onChange={e => upd({ url: e.target.value })} />
          </Field>
        )}

        {/* ── Selector ───────────────────────────── */}
        {needsSelector(s.action) && (
          <Field label="CSS / XPath Selector" required>
            <input className="input-sm font-mono" placeholder="#id, .class, [data-testid='x']"
              value={s.selector ?? ''} onChange={e => upd({ selector: e.target.value })} />
            <p className="text-[10px] text-slate-600 mt-0.5">Supports CSS selectors, XPath, text= and role=</p>
            {/* DOM Element Picker */}
            {domState.elements.length > 0 ? (
              <div className="mt-1.5">
                <button
                  className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${
                    showDOMPicker ? 'text-cyan-400' : 'text-slate-500 hover:text-cyan-400'
                  }`}
                  onClick={() => setShowDOMPicker(v => !v)}
                >
                  <Crosshair className="w-3 h-3" />
                  {showDOMPicker ? 'Hide' : 'Pick from DOM'}
                  <span className="px-1 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px]">
                    {getElementsForAction(s.action).length}
                  </span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showDOMPicker ? 'rotate-180' : ''}`} />
                </button>
                {showDOMPicker && (
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-surface-950 space-y-px">
                    {getElementsForAction(s.action).length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-slate-600">No matching elements for this action</div>
                    ) : getElementsForAction(s.action).map((el: DOMElement) => (
                      <button
                        key={el.uid}
                        className="w-full text-left px-2 py-1.5 hover:bg-surface-800 transition-colors group"
                        onClick={() => { upd({ selector: el.selector }); setShowDOMPicker(false); }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-slate-500 uppercase w-10 flex-shrink-0">{el.tag}</span>
                          <span className="text-[11px] text-slate-300 truncate flex-1">
                            {el.text || el.ariaLabel || el.placeholder || el.name || el.elementId || el.selector}
                          </span>
                          {el.selectorQuality === 'excellent' && <Shield className="w-2.5 h-2.5 text-green-400 flex-shrink-0" />}
                        </div>
                        <div className="text-[9px] font-mono text-slate-600 truncate pl-11 group-hover:text-slate-400">{el.selector}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                className="mt-1 text-[10px] text-slate-600 hover:text-cyan-400 flex items-center gap-1 transition-colors"
                onClick={() => navigate('/dom-inspector')}
              >
                <Crosshair className="w-3 h-3" /> Extract DOM for smart picker
              </button>
            )}
          </Field>
        )}

        {/* ── Value ──────────────────────────────── */}
        {['fill','type','select','wait','networkrequest'].includes(s.action) && (
          <Field label={
            s.action === 'wait'           ? 'Wait Time (ms) or Selector' :
            s.action === 'select'         ? 'Option Value' :
            s.action === 'networkrequest' ? 'URL Pattern (partial or glob)' :
            'Value'
          } required>
            <input className="input-sm"
              placeholder={
                s.action === 'wait'           ? '1000  or  #element' :
                s.action === 'networkrequest' ? '**/api/users or /search' :
                s.action === 'select'         ? 'option-value' : ''
              }
              value={s.value ?? ''} onChange={e => upd({ value: e.target.value })} />
            {s.action === 'networkrequest' && (
              <p className="text-[10px] text-slate-500 mt-0.5">Waits until a response URL contains this pattern (status 200).</p>
            )}
            {s.action === 'wait' && (
              <p className="text-[10px] text-slate-500 mt-0.5">Number → waitForTimeout. CSS/XPath → waitForSelector.</p>
            )}
          </Field>
        )}

        {/* ── Press Key ─────────────────────────── */}
        {s.action === 'press' && (
          <>
            {/* Target toggle: whole-page keyboard vs element-focused */}
            <Field label="Target">
              <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-semibold">
                <button type="button"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors ${(s.pressTarget ?? 'element') === 'element' ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-slate-400 hover:bg-surface-700'}`}
                  onClick={() => upd({ pressTarget: 'element' })}>
                  🎯 Element
                </button>
                <button type="button"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors ${s.pressTarget === 'keyboard' ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-slate-400 hover:bg-surface-700'}`}
                  onClick={() => upd({ pressTarget: 'keyboard' })}>
                  ⌨️ Whole Page
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {s.pressTarget === 'keyboard'
                  ? 'Sends key globally — like pressing Enter after filling a form.'
                  : 'Sends key to a focused element (requires selector).'}
              </p>
            </Field>
            {(s.pressTarget ?? 'element') === 'element' && (
              <Field label="CSS / XPath Selector" required>
                <input className="input-sm font-mono" placeholder="#id, .class, [data-testid='x']"
                  value={s.selector ?? ''} onChange={e => upd({ selector: e.target.value })} />
              </Field>
            )}
            <Field label="Key" required>
              <select className="select text-xs py-1" value={s.key ?? 'Enter'} onChange={e => upd({ key: e.target.value })}>
                {KEYS.map(k => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <div className="text-[10px] font-mono px-2 py-1.5 bg-surface-800 rounded border border-slate-700 text-slate-400">
              {s.pressTarget === 'keyboard'
                ? `page.keyboard.press('${s.key ?? 'Enter'}')`
                : `page.press('${s.selector || '[selector]'}', '${s.key ?? 'Enter'}')`}
            </div>
          </>
        )}

        {/* ── Upload ────────────────────────────── */}
        {s.action === 'upload' && (
          <Field label="File Path" required>
            <input className="input-sm font-mono" placeholder="/path/to/file.pdf"
              value={s.uploadPath ?? ''} onChange={e => upd({ uploadPath: e.target.value })} />
          </Field>
        )}

        {/* ── Scroll ────────────────────────────── */}
        {s.action === 'scroll' && (() => {
          const scrollY   = s.scrollY ?? 500;
          const isDown    = scrollY >= 0;
          const absY      = Math.abs(scrollY);
          const setDir    = (down: boolean) => upd({ scrollY: down ? absY : -absY });
          const setAbs    = (abs: number)   => upd({ scrollY: isDown ? abs : -abs });
          return (
            <>
              <Field label="Scroll Type">
                <select className="select text-xs py-1" value={s.scrollType ?? 'page'}
                  onChange={e => upd({ scrollType: e.target.value as 'page' | 'element' })}>
                  <option value="page">Page Scroll (pixels)</option>
                  <option value="element">Scroll Element into View</option>
                </select>
              </Field>

              {(s.scrollType ?? 'page') === 'page' ? (
                <>
                  {/* Direction toggle */}
                  <Field label="Direction">
                    <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-semibold">
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors ${isDown ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-slate-400 hover:bg-surface-700'}`}
                        onClick={() => setDir(true)}
                      >
                        <span>↓</span> Scroll Down
                      </button>
                      <button
                        type="button"
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors ${!isDown ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-slate-400 hover:bg-surface-700'}`}
                        onClick={() => setDir(false)}
                      >
                        <span>↑</span> Scroll Up
                      </button>
                    </div>
                  </Field>

                  {/* Preset amounts */}
                  <Field label="Quick Presets">
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { label: 'Small',     px: 300  },
                        { label: 'Medium',    px: 500  },
                        { label: 'Large',     px: 800  },
                        { label: 'Full Page', px: 1080 },
                      ].map(p => (
                        <button
                          key={p.px}
                          type="button"
                          onClick={() => setAbs(p.px)}
                          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                            absY === p.px
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-surface-800 border-slate-700 text-slate-400 hover:border-indigo-500 hover:text-white'
                          }`}
                        >
                          {p.label}
                          <span className="ml-1 opacity-60">{p.px}px</span>
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* Custom pixel inputs */}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Scroll X (px)">
                      <input type="number" className="input-sm" placeholder="0"
                        value={s.scrollX ?? 0}
                        onChange={e => { const v = parseInt(e.target.value); upd({ scrollX: isNaN(v) ? 0 : v }); }} />
                    </Field>
                    <Field label={`Scroll Y (${isDown ? '+' : '−'}px)`}>
                      <input type="number" className="input-sm" placeholder="500"
                        value={absY}
                        min={0}
                        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0) setAbs(v); }} />
                    </Field>
                  </div>

                  <Field label="Behavior">
                    <select className="select text-xs py-1" value={s.scrollBehavior ?? 'smooth'}
                      onChange={e => upd({ scrollBehavior: e.target.value as 'smooth' | 'auto' })}>
                      <option value="smooth">Smooth</option>
                      <option value="auto">Instant</option>
                    </select>
                  </Field>

                  {/* Live summary */}
                  <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-mono ${isDown ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
                    <span className="text-base">{isDown ? '↓' : '↑'}</span>
                    <span>
                      {isDown ? 'Scroll down' : 'Scroll up'} <strong>{absY}px</strong>
                      {(s.scrollX ?? 0) !== 0 && <> · right <strong>{s.scrollX}px</strong></>}
                      {' '}· {s.scrollBehavior ?? 'smooth'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Element Selector" required>
                    <input className="input-sm font-mono" placeholder="#footer, .section, [data-id='x']"
                      value={s.selector ?? ''} onChange={e => upd({ selector: e.target.value })} />
                  </Field>
                  <p className="text-[10px] text-slate-500 -mt-1">Scrolls the page until this element is visible.</p>
                </>
              )}
            </>
          );
        })()}

        {/* ── Viewport ──────────────────────────── */}
        {s.action === 'setviewport' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width">
              <input type="number" className="input-sm" value={s.viewportWidth ?? 1280} onChange={e => upd({ viewportWidth: parseInt(e.target.value) || 1280 })} />
            </Field>
            <Field label="Height">
              <input type="number" className="input-sm" value={s.viewportHeight ?? 720} onChange={e => upd({ viewportHeight: parseInt(e.target.value) || 720 })} />
            </Field>
          </div>
        )}

        {/* ── Drag ──────────────────────────────── */}
        {s.action === 'drag' && (
          <Field label="Target Selector" required>
            <input className="input-sm font-mono" placeholder="#drop-zone"
              value={s.dragTargetSelector ?? ''} onChange={e => upd({ dragTargetSelector: e.target.value })} />
          </Field>
        )}

        {/* ── Frame ─────────────────────────────── */}
        {s.action === 'frame' && (
          <>
            <Field label="Frame Selector" required>
              <input className="input-sm font-mono" placeholder="iframe, iframe[name='myframe']"
                value={s.frameSelector ?? ''} onChange={e => upd({ frameSelector: e.target.value })} />
              <p className="text-[10px] text-slate-500 mt-0.5">CSS selector targeting the &lt;iframe&gt; element.</p>
            </Field>
            <Field label="Frame Action">
              <select className="select text-xs py-1" value={s.frameAction ?? 'click'}
                onChange={e => upd({ frameAction: e.target.value as any })}>
                <option value="click">Click</option>
                <option value="fill">Fill / Type</option>
                <option value="type">Type (key events)</option>
                <option value="check">Check checkbox</option>
                <option value="uncheck">Uncheck checkbox</option>
              </select>
            </Field>
            <Field label="Element Selector inside Frame" required>
              <input className="input-sm font-mono" placeholder="#submit-btn, input[name='email']"
                value={s.value ?? ''} onChange={e => upd({ value: e.target.value })} />
            </Field>
            {['fill','type'].includes(s.frameAction ?? 'click') && (
              <Field label="Content to Enter" required>
                <input className="input-sm" placeholder="Text to fill / type…"
                  value={s.frameContent ?? ''} onChange={e => upd({ frameContent: e.target.value })} />
              </Field>
            )}
            <div className="text-[10px] font-mono px-2 py-1.5 bg-surface-800 rounded border border-slate-700 text-slate-400 break-all">
              {`frame.locator('${s.value || '[selector]'}').${s.frameAction ?? 'click'}(${['fill','type'].includes(s.frameAction ?? '') ? `'${s.frameContent ?? ''}'` : ''})`}
            </div>
          </>
        )}

        {/* ── Evaluate ──────────────────────────── */}
        {s.action === 'evaluate' && (
          <Field label="JavaScript Expression">
            <textarea className="textarea h-20 font-mono text-[10px]" placeholder="return document.title;"
              value={s.evaluateScript ?? ''} onChange={e => upd({ evaluateScript: e.target.value })} />
          </Field>
        )}

        {/* ── Cookie ────────────────────────────── */}
        {s.action === 'cookie' && (
          <>
            <Field label="Cookie Name" required>
              <input className="input-sm" value={s.cookieName ?? ''} onChange={e => upd({ cookieName: e.target.value })} />
            </Field>
            <Field label="Cookie Value">
              <input className="input-sm" value={s.cookieValue ?? ''} onChange={e => upd({ cookieValue: e.target.value })} />
            </Field>
          </>
        )}

        {/* ── LocalStorage ──────────────────────── */}
        {s.action === 'localstorage' && (
          <>
            <Field label="Key" required>
              <input className="input-sm font-mono" value={s.storageKey ?? ''} onChange={e => upd({ storageKey: e.target.value })} />
            </Field>
            <Field label="Value">
              <input className="input-sm" value={s.storageValue ?? ''} onChange={e => upd({ storageValue: e.target.value })} />
            </Field>
          </>
        )}

        {/* ── Mock Response ─────────────────────── */}
        {s.action === 'mockresponse' && (
          <>
            <Field label="URL Pattern" required>
              <input className="input-sm font-mono" placeholder="**/api/users"
                value={s.mockUrl ?? ''} onChange={e => upd({ mockUrl: e.target.value })} />
            </Field>
            <Field label="Status Code">
              <input type="number" className="input-sm" value={s.mockStatus ?? 200} onChange={e => upd({ mockStatus: parseInt(e.target.value) || 200 })} />
            </Field>
            <Field label="Response Body (JSON)">
              <textarea className="textarea h-20 text-[10px]" placeholder='{"key": "value"}'
                value={s.mockBody ?? ''} onChange={e => upd({ mockBody: e.target.value })} />
            </Field>
          </>
        )}

        {/* ── Assert ────────────────────────────── */}
        {s.action === 'assert' && (
          <>
            <Field label="Assert Type" required>
              <select className="select text-xs py-1" value={s.assertType ?? 'visibility'}
                onChange={e => upd({ assertType: e.target.value as AssertType })}>
                {ASSERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            {!['url','title','screenshot'].includes(s.assertType ?? '') && (
              <Field label="Selector">
                <input className="input-sm font-mono" placeholder="#element"
                  value={s.assertSelector ?? ''} onChange={e => upd({ assertSelector: e.target.value })} />
              </Field>
            )}

            <Field label={
              s.assertType === 'visibility' ? 'Expected (visible / hidden)' :
              s.assertType === 'enabled'    ? 'Expected (enabled / disabled)' :
              s.assertType === 'checked'    ? 'Expected (checked / unchecked)' :
              s.assertType === 'attribute'  ? 'name=value' :
              'Expected Value'
            }>
              <input className="input-sm" placeholder={
                s.assertType === 'url'        ? 'https://example.com/path' :
                s.assertType === 'visibility' ? 'visible' :
                s.assertType === 'text'       ? 'Hello World' :
                s.assertType === 'count'      ? '3' :
                s.assertType === 'attribute'  ? 'aria-label=Submit' :
                ''
              }
                value={s.assertExpected ?? ''} onChange={e => upd({ assertExpected: e.target.value })} />
            </Field>
          </>
        )}

        {/* ── Popup ─────────────────────────────── */}
        {s.action === 'popup' && (
          <>
            <Field label="Trigger Selector" required>
              <input className="input-sm font-mono" placeholder="#open-popup-btn"
                value={s.selector ?? ''} onChange={e => upd({ selector: e.target.value })} />
            </Field>
            <Field label="Trigger Action">
              <select className="select text-xs py-1" value={s.value ?? 'click'}
                onChange={e => upd({ value: e.target.value })}>
                <option value="click">click</option>
                <option value="dblclick">dblclick</option>
                <option value="hover">hover</option>
              </select>
            </Field>
          </>
        )}

        {/* Enabled toggle */}
        <div className="flex items-center justify-between p-2 bg-surface-800 rounded-lg">
          <span className="text-xs text-slate-300 font-medium">Step Enabled</span>
          <button
            onClick={() => upd({ enabled: !s.enabled })}
            className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${s.enabled ? 'bg-brand-600' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>

      </div>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function needsSelector(action: string): boolean {
  return !['visit','wait','reload','goback','goforward','newpage','closepage','setviewport',
    'screenshot','evaluate','scroll','cookie','localstorage','mockresponse',
    'popup','frame','networkrequest','press'].includes(action);
}

function getIcon(action: string): string {
  const m: Record<string,string> = {
    visit:'🌐',click:'👆',fill:'✏️',select:'📋',upload:'📎',wait:'⏳',assert:'✅',popup:'🪟',
    hover:'🫱',dblclick:'👆',rightclick:'🖱️',check:'☑️',uncheck:'⬜',focus:'🎯',blur:'💨',
    press:'⌨️',type:'📝',clear:'🗑️',drag:'✋',scroll:'↕️',screenshot:'📸',evaluate:'⚡',
    frame:'🖼️',newpage:'📄',closepage:'❌',reload:'🔄',goback:'⬅️',goforward:'➡️',
    setviewport:'📐',cookie:'🍪',localstorage:'💾',networkrequest:'📡',mockresponse:'🎭',
  };
  return m[action] ?? '⚙️';
}

function getDesc(action: string): string {
  const d: Record<string,string> = {
    visit:'Navigate to a URL', click:'Click an element', fill:'Fill an input field',
    select:'Select a dropdown option', upload:'Upload a file', wait:'Wait for time/element',
    assert:'Assert page/element state', popup:'Handle popup window', hover:'Hover over element',
    dblclick:'Double-click element', rightclick:'Right-click element', check:'Check a checkbox',
    uncheck:'Uncheck a checkbox', focus:'Focus an element', blur:'Blur an element',
    press:'Press a keyboard key', type:'Type text with events', clear:'Clear input field',
    drag:'Drag and drop element', scroll:'Scroll page', screenshot:'Take a screenshot',
    evaluate:'Execute JavaScript', frame:'Interact in iframe', newpage:'Open new tab',
    closepage:'Close page', reload:'Reload page', goback:'Go back', goforward:'Go forward',
    setviewport:'Set viewport size', cookie:'Set browser cookie', localstorage:'Set localStorage',
    networkrequest:'Wait for network request', mockresponse:'Mock API response',
  };
  return d[action] ?? 'Configure this action';
}
