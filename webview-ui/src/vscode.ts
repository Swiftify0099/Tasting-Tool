// VSCode API bridge - safely acquires the VS Code API
// Falls back to a mock for standalone browser testing

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

let _vscode: VSCodeAPI | null = null;

const STORAGE_KEY = 'pw_builder_flows';

function getSavedFlows(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

function setSavedFlows(flows: Record<string, any>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
}

/** Generate correct Playwright code for one step */
function generateStepCode(s: any, baseUrl: string): string {
  const sel     = s.selector ? `'${s.selector}'` : `'[data-testid="element"]'`;
  const aSel    = s.assertSelector ? `'${s.assertSelector}'` : sel;
  const timeout = s.timeout ?? 5000;

  switch (s.action) {

    // ── Navigation ────────────────────────────────────────────────
    case 'visit':
      return `  await page.goto('${s.url ?? s.value ?? baseUrl}');`;

    case 'reload':
      return `  await page.reload();`;

    case 'goback':
      return `  await page.goBack();`;

    case 'goforward':
      return `  await page.goForward();`;

    case 'newpage':
      return [
        `  const newPage = await page.context().newPage();`,
        s.url ? `  await newPage.goto('${s.url}');` : null,
      ].filter(Boolean).join('\n');

    case 'closepage':
      return `  await page.close();`;

    // ── Interaction ───────────────────────────────────────────────
    case 'click':
      return `  await page.click(${sel});`;

    case 'dblclick':
      return `  await page.dblclick(${sel});`;

    case 'rightclick':
      return `  await page.click(${sel}, { button: 'right' });`;

    case 'hover':
      return `  await page.hover(${sel});`;

    case 'drag':
      return `  await page.dragAndDrop(${sel}, '${s.dragTargetSelector ?? s.selector ?? ''}');`;

    case 'scroll': {
      if (s.scrollType === 'element') {
        return `  await page.locator(${sel}).scrollIntoViewIfNeeded();`;
      }
      const x = s.scrollX ?? 0;
      const y = s.scrollY ?? 500;
      const behavior = s.scrollBehavior ?? 'smooth';
      return `  await page.evaluate(() => window.scrollBy({ left: ${x}, top: ${y}, behavior: '${behavior}' }));`;
    }

    case 'popup': {
      const trigger = s.value ?? 'click';
      return [
        `  const [popup] = await Promise.all([`,
        `    page.waitForEvent('popup'),`,
        `    page.${trigger}(${sel}),`,
        `  ]);`,
        `  await popup.waitForLoadState();`,
      ].join('\n');
    }

    case 'press':
      if (s.pressTarget === 'keyboard' || !s.selector) {
        return `  await page.keyboard.press('${s.key ?? 'Enter'}');`;
      }
      return `  await page.press(${sel}, '${s.key ?? 'Enter'}');`;

    case 'focus':
      return `  await page.focus(${sel});`;

    case 'blur':
      return `  await page.locator(${sel}).blur();`;

    // ── Input ─────────────────────────────────────────────────────
    case 'fill':
      return `  await page.fill(${sel}, '${s.value ?? ''}');`;

    case 'type':
      return `  await page.type(${sel}, '${s.value ?? ''}');`;

    case 'clear':
      return `  await page.fill(${sel}, '');`;

    case 'select':
      return `  await page.selectOption(${sel}, '${s.value ?? ''}');`;

    case 'check':
      return `  await page.check(${sel});`;

    case 'uncheck':
      return `  await page.uncheck(${sel});`;

    case 'upload':
      return `  await page.setInputFiles(${sel}, '${s.uploadPath ?? ''}');`;

    // ── Assertion ─────────────────────────────────────────────────
    case 'assert': {
      const expected = s.assertExpected ?? '';
      switch (s.assertType ?? 'visibility') {
        case 'url':
          return `  await expect(page).toHaveURL('${expected}');`;
        case 'title':
          return `  await expect(page).toHaveTitle('${expected}');`;
        case 'text':
          return `  await expect(page.locator(${aSel})).toContainText('${expected}');`;
        case 'visibility':
          return expected === 'hidden'
            ? `  await expect(page.locator(${aSel})).toBeHidden();`
            : `  await expect(page.locator(${aSel})).toBeVisible();`;
        case 'enabled':
          return expected === 'disabled'
            ? `  await expect(page.locator(${aSel})).toBeDisabled();`
            : `  await expect(page.locator(${aSel})).toBeEnabled();`;
        case 'checked':
          return expected === 'unchecked'
            ? `  await expect(page.locator(${aSel})).not.toBeChecked();`
            : `  await expect(page.locator(${aSel})).toBeChecked();`;
        case 'value':
          return `  await expect(page.locator(${aSel})).toHaveValue('${expected}');`;
        case 'attribute': {
          const [attrName, attrVal] = expected.split('=');
          return `  await expect(page.locator(${aSel})).toHaveAttribute('${attrName ?? ''}', '${attrVal ?? ''}');`;
        }
        case 'count':
          return `  await expect(page.locator(${aSel})).toHaveCount(${parseInt(expected) || 1});`;
        case 'screenshot':
          return `  await expect(page).toHaveScreenshot();`;
        default:
          return `  await expect(page.locator(${aSel})).toBeVisible();`;
      }
    }

    case 'screenshot':
      return `  await page.screenshot({ path: 'screenshot.png', fullPage: true });`;

    // ── Advanced ──────────────────────────────────────────────────
    case 'wait': {
      const val = s.value ?? '';
      const ms  = parseInt(val);
      if (!isNaN(ms) && ms > 0) {
        return `  await page.waitForTimeout(${ms});`;
      }
      if (val && (val.startsWith('#') || val.startsWith('.') || val.startsWith('[') || val.startsWith('//'))) {
        return `  await page.waitForSelector('${val}', { timeout: ${timeout} });`;
      }
      return `  await page.waitForTimeout(${val || 1000});`;
    }

    case 'evaluate':
      return `  await page.evaluate(() => { ${s.evaluateScript ?? '/* your JS here */'} });`;

    case 'frame': {
      const frameSel  = s.frameSelector ?? 'iframe';
      const innerSel  = s.value ?? 'button';
      const fAction   = s.frameAction ?? 'click';
      const fContent  = s.frameContent ?? '';
      const frameBase = `  const frame = page.frameLocator('${frameSel}');`;
      switch (fAction) {
        case 'fill':
          return `${frameBase}\n  await frame.locator('${innerSel}').fill('${fContent}');`;
        case 'type':
          return `${frameBase}\n  await frame.locator('${innerSel}').pressSequentially('${fContent}');`;
        case 'check':
          return `${frameBase}\n  await frame.locator('${innerSel}').check();`;
        case 'uncheck':
          return `${frameBase}\n  await frame.locator('${innerSel}').uncheck();`;
        default:
          return `${frameBase}\n  await frame.locator('${innerSel}').click();`;
      }
    }

    case 'setviewport':
      return `  await page.setViewportSize({ width: ${s.viewportWidth ?? 1280}, height: ${s.viewportHeight ?? 720} });`;

    // ── Network ───────────────────────────────────────────────────
    case 'networkrequest': {
      const pattern = s.value ?? '**/api/**';
      return `  await page.waitForResponse(resp => resp.url().includes('${pattern}') && resp.status() === 200, { timeout: ${timeout} });`;
    }

    case 'mockresponse': {
      const body = s.mockBody ? s.mockBody.trim() : '{}';
      return [
        `  await page.route('${s.mockUrl ?? '**/*'}', route => route.fulfill({`,
        `    status: ${s.mockStatus ?? 200},`,
        `    contentType: 'application/json',`,
        `    body: JSON.stringify(${body}),`,
        `  }));`,
      ].join('\n');
    }

    case 'cookie':
      return [
        `  await page.context().addCookies([{`,
        `    name: '${s.cookieName ?? 'session'}',`,
        `    value: '${s.cookieValue ?? ''}',`,
        `    url: '${baseUrl}',`,
        `  }]);`,
      ].join('\n');

    case 'localstorage':
      return `  await page.evaluate(() => localStorage.setItem('${s.storageKey ?? 'key'}', '${s.storageValue ?? ''}'));`;

    default:
      return `  // TODO: ${s.label ?? s.action}`;
  }
}

function getVSCodeAPI(): VSCodeAPI {
  if (_vscode) return _vscode;

  if (typeof acquireVsCodeApi === 'function') {
    _vscode = acquireVsCodeApi();
    return _vscode;
  }

  _vscode = {
    postMessage: (msg: unknown) => {
      console.log('[VSCode Mock] postMessage:', msg);
      const message = msg as { type: string; payload: any };

      // ── SAVE_FLOW ──────────────────────────────────────────────
      if (message.type === 'SAVE_FLOW') {
        const flow = message.payload;
        if (flow?.id) {
          const flows = getSavedFlows();
          flows[flow.id] = { ...flow, updatedAt: new Date().toISOString() };
          setSavedFlows(flows);
          setTimeout(() => {
            window.postMessage({ type: 'FLOW_SAVED', payload: { flowId: flow.id } }, '*');
          }, 200);
        }
      }

      // ── GET_FLOWS ──────────────────────────────────────────────
      if (message.type === 'GET_FLOWS') {
        const flows = getSavedFlows();
        const summaries = Object.values(flows).map((f: any) => ({
          id: f.id, name: f.name, description: f.description ?? '',
          updatedAt: f.updatedAt, stepCount: f.steps?.length ?? 0, tags: f.tags ?? [],
        }));
        setTimeout(() => {
          window.postMessage({ type: 'FLOWS_LIST', payload: summaries }, '*');
        }, 100);
      }

      // ── LOAD_FLOW ──────────────────────────────────────────────
      if (message.type === 'LOAD_FLOW') {
        const id = message.payload as string;
        const flows = getSavedFlows();
        const flow = flows[id];
        setTimeout(() => {
          window.postMessage({
            type: flow ? 'FLOW_LOADED' : 'ERROR',
            payload: flow ?? 'Flow not found',
          }, '*');
        }, 150);
      }

      // ── DELETE_FLOW ────────────────────────────────────────────
      if (message.type === 'DELETE_FLOW') {
        const id = message.payload as string;
        const flows = getSavedFlows();
        delete flows[id];
        setSavedFlows(flows);
        setTimeout(() => {
          window.postMessage({ type: 'FLOW_DELETED', payload: { flowId: id } }, '*');
        }, 150);
      }

      // ── EXPORT_JSON ────────────────────────────────────────────
      if (message.type === 'EXPORT_JSON') {
        const flow = message.payload;
        const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(flow?.name ?? 'flow').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }

      // ── GENERATE_TEST ──────────────────────────────────────────
      if (message.type === 'GENERATE_TEST') {
        const { flow, options } = message.payload ?? {};
        const steps: any[]    = flow?.steps ?? [];
        const browser         = options?.browserType ?? 'chromium';
        const headless        = options?.headless ?? true;
        const timeout         = options?.timeout ?? 30000;
        const retries         = options?.retries ?? 0;
        const baseUrl         = flow?.baseUrl && flow.baseUrl !== 'https://' ? flow.baseUrl : 'https://example.com';
        const flowName        = flow?.name ?? 'Untitled Flow';
        const includeComments = options?.includeComments ?? true;

        const stepLines = steps
          .filter((s: any) => s.enabled !== false)
          .map((s: any) => {
            const code    = generateStepCode(s, baseUrl);
            const comment = includeComments && s.comment ? `  // ${s.comment}\n` : '';
            const label   = includeComments ? `  // Step: ${s.label ?? s.action}\n` : '';
            return `${label}${comment}${code}`;
          })
          .join('\n\n');

        const hasRoute    = steps.some(s => s.action === 'mockresponse');
        const needsExpect = steps.some(s => s.action === 'assert');
        const imports     = [
          `import { test${needsExpect ? ', expect' : ''} } from '@playwright/test';`,
        ].join('\n');

        const code = [
          imports,
          ``,
          `// Generated by Playwright Test Builder`,
          `// Flow: ${flowName}`,
          `// Browser: ${browser} | Headless: ${headless} | Timeout: ${timeout}ms`,
          retries > 0 ? `// Retries: ${retries}` : null,
          ``,
          `test.describe('${flowName}', () => {`,
          `  test.use({ baseURL: '${baseUrl}' });`,
          ``,
          `  test('should complete the flow', async ({ page }) => {`,
          `    page.setDefaultTimeout(${timeout});`,
          ``,
          stepLines || `    // No steps defined`,
          `  });`,
          `});`,
        ].filter(l => l !== null).join('\n');

        setTimeout(() => {
          window.postMessage({
            type: 'TEST_GENERATED',
            payload: {
              success: true,
              path: `${flowName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.spec.ts`,
              code,
            },
          }, '*');
        }, 600);
      }

      // ── RUN_TEST ───────────────────────────────────────────────
      if (message.type === 'RUN_TEST') {
        const flow = message.payload as any;

        const dispatchMsg = (type: string, payload: unknown) => {
          window.postMessage({ type, payload }, '*');
        };

        dispatchMsg('TEST_RUN_LOG', { logType: 'info', message: '▶  Connecting to Playwright runner…' });

        fetch('/api/run-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow }),
        }).then(async (res) => {
          if (!res.ok || !res.body) {
            dispatchMsg('TEST_RUN_LOG', { logType: 'error', message: `Runner returned HTTP ${res.status}` });
            dispatchMsg('TEST_RUN_COMPLETE', { passed: false });
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6)) as { type: string; payload: unknown };
                  dispatchMsg(event.type, event.payload);
                } catch (_) {}
              }
            }
          }
        }).catch((err: Error) => {
          dispatchMsg('TEST_RUN_LOG', {
            logType: 'error',
            message: `Cannot reach runner server: ${err.message}. Make sure the runner server is started.`,
          });
          dispatchMsg('TEST_RUN_COMPLETE', { passed: false });
        });
      }

      // ── EXTRACT_DOM ────────────────────────────────────────────
      if (message.type === 'EXTRACT_DOM') {
        const targetUrl = message.payload as string;

        /** Parse HTML string and extract all interactive elements */
        const extractFromHtml = (html: string): any[] => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const results: any[] = [];
          const seen = new WeakSet<Element>();
          const SELECTORS = [
            'button', 'input', 'select', 'textarea', 'a[href]',
            '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
            '[role="textbox"]', '[role="combobox"]', '[role="menuitem"]',
            'form', '[data-testid]', '[data-cy]', '[data-qa]',
          ];
          let uid = 0;

          SELECTORS.forEach(sel => {
            try {
              doc.querySelectorAll(sel).forEach(el => {
                if (seen.has(el)) { return; }
                seen.add(el);
                const tag = el.tagName.toLowerCase();
                const elId = el.id || '';
                const name = el.getAttribute('name') || '';
                const ariaLabel = el.getAttribute('aria-label') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-qa') || '';
                const role = el.getAttribute('role') || tag;
                const href = el.getAttribute('href') || '';
                const type = el.getAttribute('type') || tag;
                const rawText = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
                const className = typeof el.className === 'string' ? el.className : '';

                let selector = '';
                let quality = 'poor';
                if (dataTestId) { selector = `[data-testid="${dataTestId}"]`; quality = 'excellent'; }
                else if (elId)  { selector = `#${elId}`; quality = 'good'; }
                else if (name)  { selector = `[name="${name}"]`; quality = 'good'; }
                else if (ariaLabel) { selector = `[aria-label="${ariaLabel}"]`; quality = 'fair'; }
                else if (placeholder) { selector = `[placeholder="${placeholder}"]`; quality = 'fair'; }
                else if (rawText && (tag === 'button' || tag === 'a') && rawText.length < 50) {
                  selector = `text="${rawText}"`; quality = 'fair';
                } else {
                  const cls = className.split(' ').filter(Boolean).slice(0, 2).join('.');
                  selector = tag + (cls ? '.' + cls : '');
                  quality = 'poor';
                }

                let category = 'other';
                if (tag === 'button' || (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset')) || role === 'button') { category = 'button'; }
                else if ((tag === 'input' && type === 'checkbox') || role === 'checkbox') { category = 'checkbox'; }
                else if ((tag === 'input' && type === 'radio') || role === 'radio') { category = 'radio'; }
                else if (tag === 'input' || role === 'textbox') { category = 'input'; }
                else if (tag === 'select' || role === 'combobox') { category = 'select'; }
                else if (tag === 'textarea') { category = 'textarea'; }
                else if (tag === 'a') { category = 'link'; }
                else if (tag === 'form') { category = 'form'; }

                // Simple xpath
                const getXPath = (e: Element): string => {
                  if (e.id) { return `//*[@id="${e.id}"]`; }
                  const parts: string[] = [];
                  let node: Element | null = e;
                  while (node && node.nodeType === 1) {
                    let idx = 1;
                    let sib = node.previousSibling;
                    while (sib) {
                      if (sib.nodeType === 1 && (sib as Element).tagName === node.tagName) { idx++; }
                      sib = sib.previousSibling;
                    }
                    parts.unshift(node.tagName.toLowerCase() + '[' + idx + ']');
                    node = node.parentElement;
                  }
                  return '/' + parts.join('/');
                };

                results.push({
                  uid: String(++uid), tag, type, elementId: elId, name, ariaLabel,
                  placeholder, dataTestId, text: rawText, selector,
                  xpath: getXPath(el), role, className, href, category, selectorQuality: quality,
                });
              });
            } catch { /* skip bad selectors */ }
          });

          return results;
        };

        /** Try direct fetch, then CORS proxy fallback */
        const fetchHTML = async (): Promise<string> => {
          // 1. Direct fetch
          try {
            const res = await fetch(targetUrl);
            if (res.ok) { return await res.text(); }
          } catch { /* CORS or network error — try proxy */ }

          // 2. allorigins CORS proxy
          try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            const res = await fetch(proxyUrl);
            if (res.ok) { return await res.text(); }
          } catch { /* proxy failed too */ }

          // 3. corsproxy.io fallback
          const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
          const res = await fetch(proxyUrl2);
          return await res.text();
        };

        fetchHTML()
          .then(html => {
            const elements = extractFromHtml(html);
            window.postMessage({ type: 'DOM_EXTRACTED', payload: { elements, url: targetUrl } }, '*');
          })
          .catch((err: Error) => {
            window.postMessage({
              type: 'DOM_EXTRACT_ERROR',
              payload: `Failed to fetch "${targetUrl}": ${err.message}. Try a URL that allows cross-origin requests, or run the VS Code extension (F5) for full Playwright-based extraction.`,
            }, '*');
          });
      }
    },
    getState: () => null,
    setState: (state: unknown) => {
      console.log('[VSCode Mock] setState:', state);
    },
  };
  return _vscode;
}

export const vscode = {
  postMessage: (message: unknown) => getVSCodeAPI().postMessage(message),
  getState:    () => getVSCodeAPI().getState(),
  setState:    (state: unknown) => getVSCodeAPI().setState(state),
};
