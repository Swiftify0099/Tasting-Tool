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
          id: f.id,
          name: f.name,
          description: f.description ?? '',
          updatedAt: f.updatedAt,
          stepCount: f.steps?.length ?? 0,
          tags: f.tags ?? [],
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
        if (flow) {
          setTimeout(() => {
            window.postMessage({ type: 'FLOW_LOADED', payload: flow }, '*');
          }, 150);
        } else {
          setTimeout(() => {
            window.postMessage({ type: 'ERROR', payload: 'Flow not found' }, '*');
          }, 150);
        }
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
        const steps: any[] = flow?.steps ?? [];
        const browser = options?.browserType ?? 'chromium';
        const headless = options?.headless ?? true;
        const timeout = options?.timeout ?? 30000;
        const baseUrl = flow?.baseUrl ?? 'https://example.com';
        const flowName = flow?.name ?? 'Untitled Flow';

        const stepLines = steps
          .filter((s: any) => s.enabled !== false)
          .map((s: any) => {
            const selector = s.selector ? `'${s.selector}'` : "'[data-testid=\"element\"]'";
            switch (s.action) {
              case 'visit':      return `  await page.goto('${s.url ?? s.value ?? baseUrl}');`;
              case 'click':      return `  await page.click(${selector});`;
              case 'fill':       return `  await page.fill(${selector}, '${s.value ?? ''}');`;
              case 'type':       return `  await page.type(${selector}, '${s.value ?? ''}');`;
              case 'assert':     return `  await expect(page.locator(${selector ?? "'body'"})).toBeVisible();`;
              case 'wait':       return `  await page.waitForTimeout(${s.value ?? 1000});`;
              case 'hover':      return `  await page.hover(${selector});`;
              case 'press':      return `  await page.press(${selector}, '${s.key ?? s.value ?? 'Enter'}');`;
              case 'select':     return `  await page.selectOption(${selector}, '${s.value ?? ''}');`;
              case 'check':      return `  await page.check(${selector});`;
              case 'uncheck':    return `  await page.uncheck(${selector});`;
              case 'screenshot': return `  await page.screenshot({ path: 'screenshot.png' });`;
              case 'reload':     return `  await page.reload();`;
              case 'goback':     return `  await page.goBack();`;
              case 'goforward':  return `  await page.goForward();`;
              case 'dblclick':   return `  await page.dblclick(${selector});`;
              case 'clear':      return `  await page.fill(${selector}, '');`;
              case 'focus':      return `  await page.focus(${selector});`;
              case 'scroll':     return `  await page.evaluate(() => window.scrollBy(${s.scrollX ?? 0}, ${s.scrollY ?? 0}));`;
              case 'evaluate':   return `  await page.evaluate(() => { ${s.evaluateScript ?? ''} });`;
              default:           return `  // Step: ${s.label ?? s.action}`;
            }
          })
          .join('\n');

        const code = [
          `import { test, expect } from '@playwright/test';`,
          ``,
          `// Generated from: ${flowName}`,
          `// Browser: ${browser} | Headless: ${headless} | Timeout: ${timeout}ms`,
          ``,
          `test.describe('${flowName}', () => {`,
          `  test('should complete the flow', async ({ page }) => {`,
          `    page.setDefaultTimeout(${timeout});`,
          stepLines || `    // No steps defined`,
          `  });`,
          `});`,
        ].join('\n');

        setTimeout(() => {
          window.postMessage({
            type: 'TEST_GENERATED',
            payload: { success: true, path: `${(flowName).replace(/[^a-zA-Z0-9]/g,'_').toLowerCase()}.spec.ts`, code }
          }, '*');
        }, 600);
      }

      // ── RUN_TEST ───────────────────────────────────────────────
      if (message.type === 'RUN_TEST') {
        const flow = message.payload as any;
        const steps: any[] = flow?.steps ?? [];
        const safeName = (flow?.name ?? 'untitled').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const enabledSteps = steps.filter((s: any) => s.enabled !== false);

        const logs: Array<{ delay: number; type: string; message: string }> = [
          { delay: 100,  type: 'info',    message: `▶  Running: ${safeName}.spec.ts` },
          { delay: 400,  type: 'info',    message: `Browser: chromium (headless)` },
          { delay: 700,  type: 'info',    message: `Launching browser…` },
          ...enabledSteps.map((s: any, i: number) => ({
            delay: 900 + i * 700,
            type: 'step',
            message: `[${i + 1}/${enabledSteps.length}] ${s.label ?? s.action} (${s.action})`,
          })),
          {
            delay: 900 + enabledSteps.length * 700 + 300,
            type: 'success',
            message: '✓  All steps passed',
          },
          {
            delay: 900 + enabledSteps.length * 700 + 600,
            type: 'info',
            message: `1 passed (1)`,
          },
        ];

        logs.forEach(({ delay, type, message }) => {
          setTimeout(() => {
            window.postMessage({ type: 'TEST_RUN_LOG', payload: { logType: type, message } }, '*');
          }, delay);
        });

        setTimeout(() => {
          window.postMessage({ type: 'TEST_RUN_COMPLETE', payload: { passed: true } }, '*');
        }, 900 + enabledSteps.length * 700 + 900);
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
  getState: () => getVSCodeAPI().getState(),
  setState: (state: unknown) => getVSCodeAPI().setState(state),
};
