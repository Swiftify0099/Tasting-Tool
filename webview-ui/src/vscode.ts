// VSCode API bridge - safely acquires the VS Code API
// Falls back to a mock for standalone browser testing

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

let _vscode: VSCodeAPI | null = null;

function getVSCodeAPI(): VSCodeAPI {
  if (_vscode) return _vscode;

  // In VS Code webview
  if (typeof acquireVsCodeApi === 'function') {
    _vscode = acquireVsCodeApi();
    return _vscode;
  }

  // Browser dev mock
  _vscode = {
    postMessage: (msg: unknown) => {
      console.log('[VSCode Mock] postMessage:', msg);
      const message = msg as { type: string; payload: any };

      // Simulate backend response for GENERATE_TEST in browser dev mode
      if (message.type === 'GENERATE_TEST') {
        const { flow, options } = message.payload ?? {};
        const steps: any[] = flow?.steps ?? [];
        const browser = options?.browserType ?? 'chromium';
        const headless = options?.headless ?? true;
        const timeout = options?.timeout ?? 30000;
        const baseUrl = flow?.baseUrl ?? 'https://example.com';
        const flowName = flow?.name ?? 'Untitled Flow';
        const safeName = flowName.replace(/[^a-zA-Z0-9]/g, '_');

        const stepLines = steps
          .filter((s: any) => s.enabled !== false)
          .map((s: any) => {
            const selector = s.selector ? `'${s.selector}'` : "'[data-testid=\"element\"]'";
            switch (s.action) {
              case 'visit':    return `  await page.goto('${s.value ?? baseUrl}');`;
              case 'click':    return `  await page.click(${selector});`;
              case 'fill':     return `  await page.fill(${selector}, '${s.value ?? ''}');`;
              case 'assert':   return `  await expect(page.locator(${selector})).toBeVisible();`;
              case 'wait':     return `  await page.waitForTimeout(${s.value ?? 1000});`;
              case 'hover':    return `  await page.hover(${selector});`;
              case 'press':    return `  await page.press(${selector}, '${s.value ?? 'Enter'}');`;
              case 'select':   return `  await page.selectOption(${selector}, '${s.value ?? ''}');`;
              case 'check':    return `  await page.check(${selector});`;
              case 'uncheck':  return `  await page.uncheck(${selector});`;
              case 'screenshot': return `  await page.screenshot({ path: 'screenshot.png' });`;
              case 'reload':   return `  await page.reload();`;
              case 'goback':   return `  await page.goBack();`;
              case 'goforward':return `  await page.goForward();`;
              default:         return `  // Step: ${s.label ?? s.action}`;
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
            payload: { success: true, path: 'browser-preview.spec.ts', code }
          }, '*');
        }, 600);
      }

      // Simulate RUN_TEST in browser dev mode
      if (message.type === 'RUN_TEST') {
        const flow = message.payload as any;
        const steps: any[] = flow?.steps ?? [];
        const safeName = (flow?.name ?? 'untitled').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const enabledSteps = steps.filter((s: any) => s.enabled !== false);

        // Fire run log events with staggered timing
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
            delay: 900 + enabledSteps.length * 600 + 300,
            type: 'success',
            message: '✓  All steps passed',
          },
          {
            delay: 900 + enabledSteps.length * 600 + 600,
            type: 'info',
            message: '1 passed (1)',
          },
        ];

        logs.forEach(({ delay, type, message }) => {
          setTimeout(() => {
            window.postMessage({ type: 'TEST_RUN_LOG', payload: { logType: type, message } }, '*');
          }, delay);
        });

        // Final complete event
        setTimeout(() => {
          window.postMessage({ type: 'TEST_RUN_COMPLETE', payload: { passed: true } }, '*');
        }, 900 + enabledSteps.length * 600 + 900);
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
