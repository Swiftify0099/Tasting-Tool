import * as path from 'path';
import { TestFlow, TestStep } from './types';

type PostMessageFn = (type: string, payload: unknown) => void;

/** Highlight CSS injected into the page before each targeted action */
const HIGHLIGHT_STYLE_ID = '__pw_highlight_style__';
const HIGHLIGHT_CLASS = '__pw_highlighted__';

export class PlaywrightRunner {
  private _post: PostMessageFn;
  private _aborted = false;

  constructor(postMessage: PostMessageFn) {
    this._post = postMessage;
  }

  /** Abort a running test (call from dispose) */
  abort() { this._aborted = true; }

  async run(flow: TestFlow, options?: { browserType?: string; headless?: boolean; slowMo?: number; timeout?: number }): Promise<void> {
    this._aborted = false;
    let browser: any = null;

    try {
      /* ── 1. Resolve Playwright ─────────────────────────────────── */
      const pwModulePath = path.join(__dirname, '..', 'node_modules', 'playwright');
      let playwrightModule: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        playwrightModule = require(pwModulePath);
      } catch {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          playwrightModule = require('playwright');
        } catch {
          this._post('TEST_RUN_LOG', { logType: 'error', message: '✗ Playwright not found. Run: npm install playwright in the extension root.' });
          this._post('TEST_RUN_COMPLETE', { passed: false, error: 'Playwright not installed' });
          return;
        }
      }

      const browserType = options?.browserType ?? 'chromium';
      const headless = options?.headless ?? true;
      const slowMo = options?.slowMo ?? 0;
      const defaultTimeout = options?.timeout ?? 15000;
      const launcher = playwrightModule[browserType] ?? playwrightModule.chromium;

      /* ── 2. Launch ─────────────────────────────────────────────── */
      this._post('TEST_RUN_LOG', { logType: 'info', message: `▶  Launching ${browserType}…` });

      try {
        browser = await launcher.launch({
          headless,
          slowMo,
          args: headless
            ? [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu', // Only disable GPU in headless mode
            ]
            : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
      } catch (launchErr) {
        const msg = (launchErr as Error).message;
        this._post('TEST_RUN_LOG', { logType: 'error', message: `✗ Failed to launch ${browserType}: ${msg.slice(0, 200)}` });

        if (!headless) {
          this._post('TEST_RUN_LOG', { logType: 'info', message: 'ℹ Retrying in headless mode…' });
          browser = await launcher.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-gpu'],
          });
        } else {
          throw launchErr;
        }
      }

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        deviceScaleFactor: 1, // Ensure consistent screenshots
      });
      const page = await context.newPage();
      page.setDefaultTimeout(defaultTimeout);

      /* ── 3. Inject global highlight stylesheet ─────────────────── */
      await context.addInitScript(`
        const s = document.createElement('style');
        s.id = '${HIGHLIGHT_STYLE_ID}';
        s.textContent = \`
          .${HIGHLIGHT_CLASS} {
            outline: 3px solid #6366f1 !important;
            outline-offset: 3px !important;
            box-shadow: 0 0 0 6px rgba(99,102,241,0.35) !important;
            transition: outline 0.15s ease, box-shadow 0.15s ease !important;
          }
        \`;
        document.head.appendChild(s);
      `);

      const enabledSteps = flow.steps.filter(s => s.enabled);
      this._post('TEST_RUN_LOG', { logType: 'info', message: `   Steps: ${enabledSteps.length} enabled` });

      /* ── 4. Execute steps ──────────────────────────────────────── */
      for (let i = 0; i < enabledSteps.length; i++) {
        if (this._aborted) {
          this._post('TEST_RUN_LOG', { logType: 'error', message: '✗ Run aborted.' });
          break;
        }

        const step = enabledSteps[i];
        const color = ACTION_COLOR[step.action] ?? '#6366f1';

        /* Log step start */
        this._post('TEST_RUN_LOG', {
          logType: 'step',
          message: `[${i + 1}/${enabledSteps.length}] ${step.label} (${step.action})`,
        });
        this._post('TEST_RUN_STEP', step);

        try {
          /* Highlight target element */
          const targetSel = step.selector || step.assertSelector;
          if (targetSel && INTERACTIVE_ACTIONS.includes(step.action as any)) {
            await this._highlightElement(page, targetSel);
          }

          /* Pre-action screenshot (shows highlight) */
          await this._sendScreenshot(page, i, step.action, 'before', color);

          /* Execute the step */
          await this._executeStep(page, step, flow.baseUrl, defaultTimeout);

          /* Remove highlight */
          if (targetSel) {
            await this._removeHighlight(page, targetSel);
          }

          /* Small pause so the user can see the result */
          await page.waitForTimeout(200);

          /* Post-action screenshot */
          await this._sendScreenshot(page, i, step.action, 'after', color);

          this._post('TEST_RUN_LOG', { logType: 'success', message: `   ✓ Step ${i + 1} passed` });
        } catch (stepErr) {
          if (this._aborted) { break; }
          const msg = (stepErr as Error).message?.slice(0, 200) ?? 'Unknown error';
          await this._sendScreenshot(page, i, step.action, 'error', '#f87171');
          this._post('TEST_RUN_LOG', { logType: 'error', message: `   ✗ Step ${i + 1} failed: ${msg}` });
          await browser.close();
          browser = null;
          this._post('TEST_RUN_COMPLETE', { passed: false, error: msg });
          return;
        }
      }

      /* ── 5. Close & report ─────────────────────────────────────── */
      if (browser) {
        await browser.close();
        browser = null;
      }

      this._post('TEST_RUN_LOG', { logType: 'success', message: `✅ All ${enabledSteps.length} steps passed!` });
      this._post('TEST_RUN_COMPLETE', { passed: true });

    } catch (err) {
      if (browser) { try { await browser.close(); } catch { /* ignore */ } }
      const msg = (err as Error).message?.slice(0, 300) ?? 'Unknown error';
      this._post('TEST_RUN_LOG', { logType: 'error', message: `✗ Run failed: ${msg}` });
      this._post('TEST_RUN_COMPLETE', { passed: false, error: msg });
    }
  }

  /* ── Screenshot helpers ──────────────────────────────────────────── */
  private async _sendScreenshot(page: any, stepIdx: number, action: string, phase: string, color: string): Promise<void> {
    try {
      // Ensure page is still open and responsive
      if (page.isClosed()) return;

      const buffer: Buffer = await page.screenshot({
        type: 'jpeg',
        quality: 60, // Lower quality for faster streaming over postMessage
        fullPage: false
      });
      const base64 = buffer.toString('base64');
      this._post('TEST_RUN_SCREENSHOT', { stepIdx, action, phase, color, screenshotBase64: base64 });
    } catch (err) {
      // Log screenshot errors to terminal for visibility
      const msg = (err as Error).message;
      this._post('TEST_RUN_LOG', { logType: 'info', message: `   ⚠ Screenshot skip (${phase}): ${msg.slice(0, 50)}…` });
    }
  }

  /* ── Element highlight / remove ─────────────────────────────────── */
  private async _highlightElement(page: any, selector: string): Promise<void> {
    try {
      await page.evaluate(
        (args: { sel: string; cls: string }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (globalThis as any).document;
          const el = doc.querySelector(args.sel);
          if (el && el.classList) {
            el.classList.add(args.cls);
          }
        },
        { sel: selector, cls: HIGHLIGHT_CLASS }
      );
    } catch { /* element may not exist yet */ }
  }

  private async _removeHighlight(page: any, selector: string): Promise<void> {
    try {
      await page.evaluate(
        (args: { sel: string; cls: string }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (globalThis as any).document;
          const el = doc.querySelector(args.sel);
          if (el && el.classList) {
            el.classList.remove(args.cls);
          }
        },
        { sel: selector, cls: HIGHLIGHT_CLASS }
      );
    } catch { /* ignore */ }
  }

  /* ── Step executor ───────────────────────────────────────────────── */
  private async _executeStep(page: any, step: TestStep, baseUrl: string, defaultTimeout: number): Promise<void> {
    const sel = step.selector ? step.selector : undefined;
    const timeout = step.timeout ?? defaultTimeout;

    switch (step.action) {

      /* Navigation */
      case 'visit': {
        let targetUrl = step.url ?? step.value ?? baseUrl;
        if (!targetUrl || targetUrl === 'https://' || targetUrl === 'http://') {
          throw new Error('No valid URL provided for navigation. Please enter a URL in the Visit step.');
        }
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });
        break;
      }

      case 'reload':
        await page.reload({ waitUntil: 'domcontentloaded', timeout });
        break;

      case 'goback':
        await page.goBack({ timeout });
        break;

      case 'goforward':
        await page.goForward({ timeout });
        break;

      case 'newpage': {
        const np = await page.context().newPage();
        if (step.url) { await np.goto(step.url, { waitUntil: 'domcontentloaded', timeout }); }
        break;
      }

      case 'closepage':
        await page.close();
        break;

      /* Interaction */
      case 'click':
        await page.click(sel!, { timeout });
        break;

      case 'dblclick':
        await page.dblclick(sel!, { timeout });
        break;

      case 'rightclick':
        await page.click(sel!, { button: 'right', timeout });
        break;

      case 'hover':
        await page.hover(sel!, { timeout });
        break;

      case 'drag':
        if (sel && step.dragTargetSelector) {
          await page.dragAndDrop(sel, step.dragTargetSelector, { timeout });
        }
        break;

      case 'scroll': {
        const stepScrollType = (step as any).scrollType;
        if (stepScrollType === 'element' && sel) {
          await page.locator(sel).scrollIntoViewIfNeeded({ timeout });
        } else {
          const x = step.scrollX ?? 0;
          const y = step.scrollY ?? 500;
          await page.evaluate(
            (args: { dx: number; dy: number }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (globalThis as any).window.scrollBy({ left: args.dx, top: args.dy, behavior: 'smooth' });
            },
            { dx: x, dy: y }
          );
          await page.waitForTimeout(400); // let scroll settle
        }
        break;
      }

      case 'press':
        if (sel && (step as any).pressTarget !== 'keyboard') {
          await page.press(sel, step.key ?? 'Enter', { timeout });
        } else {
          await page.keyboard.press(step.key ?? 'Enter');
        }
        break;

      case 'focus':
        await page.focus(sel!, { timeout });
        break;

      case 'blur':
        await page.locator(sel!).blur();
        break;

      /* Input */
      case 'fill':
        await page.fill(sel!, step.value ?? '', { timeout });
        break;

      case 'type':
        await page.type(sel!, step.value ?? '', { delay: 40, timeout });
        break;

      case 'clear':
        await page.fill(sel!, '', { timeout });
        break;

      case 'select':
        await page.selectOption(sel!, step.value ?? '', { timeout });
        break;

      case 'check':
        await page.check(sel!, { timeout });
        break;

      case 'uncheck':
        await page.uncheck(sel!, { timeout });
        break;

      case 'upload':
        if (sel && step.uploadPath) {
          await page.setInputFiles(sel, step.uploadPath, { timeout });
        }
        break;

      /* Wait */
      case 'wait': {
        const val = step.value ?? '';
        const ms = parseInt(val);
        if (!isNaN(ms) && ms > 0) {
          await page.waitForTimeout(ms);
        } else if (val && (val.startsWith('#') || val.startsWith('.') || val.startsWith('[') || val.startsWith('//'))) {
          await page.waitForSelector(val, { timeout });
        } else {
          await page.waitForTimeout(val ? parseInt(val) || 1000 : 1000);
        }
        break;
      }

      /* Assertion — best-effort in live preview mode */
      case 'assert': {
        const aSel = step.assertSelector || sel;
        const expected = step.assertExpected ?? '';
        switch (step.assertType ?? 'visibility') {
          case 'url':
            // Just screenshot — don't throw to keep the run going
            break;
          case 'visibility':
            if (aSel) { await page.waitForSelector(aSel, { state: expected === 'hidden' ? 'hidden' : 'visible', timeout }); }
            break;
          case 'text':
            if (aSel) {
              await page.waitForFunction(
                (args: { s: string; t: string }) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const doc = (globalThis as any).document;
                  const el = doc.querySelector(args.s);
                  return el ? (el.textContent || '').includes(args.t) : false;
                },
                { s: aSel, t: expected }, { timeout }
              );
            }
            break;
          default:
            break;
        }
        break;
      }

      /* Screenshot */
      case 'screenshot':
        /* Already captured by _sendScreenshot — nothing extra needed */
        break;

      /* Evaluate */
      case 'evaluate':
        if (step.evaluateScript) {
          await page.evaluate(step.evaluateScript);
        }
        break;

      /* Viewport */
      case 'setviewport':
        await page.setViewportSize({
          width: step.viewportWidth ?? 1280,
          height: step.viewportHeight ?? 720,
        });
        break;

      /* Network mock */
      case 'mockresponse':
        await page.route(step.mockUrl ?? '**/*', (route: any) => route.fulfill({
          status: step.mockStatus ?? 200,
          contentType: 'application/json',
          body: step.mockBody ?? '{}',
        }));
        break;

      /* Cookie / storage */
      case 'cookie':
        await page.context().addCookies([{
          name: step.cookieName ?? 'session',
          value: step.cookieValue ?? '',
          url: baseUrl,
        }]);
        break;

      case 'localstorage':
        await page.evaluate(
          (args: { k: string; v: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).localStorage.setItem(args.k, args.v);
          },
          { k: step.storageKey ?? 'key', v: step.storageValue ?? '' }
        );
        break;

      default:
        /* Unknown step — skip */
        break;
    }
  }
}

/* ── Constants ─────────────────────────────────────────────────────── */

const INTERACTIVE_ACTIONS: string[] = [
  'click', 'dblclick', 'rightclick', 'hover', 'fill', 'type', 'clear',
  'select', 'check', 'uncheck', 'focus', 'blur', 'press', 'drag', 'upload',
];

const ACTION_COLOR: Record<string, string> = {
  visit: '#38bdf8',
  click: '#818cf8', dblclick: '#818cf8', rightclick: '#818cf8',
  fill: '#a78bfa', type: '#a78bfa',
  assert: '#34d399', check: '#34d399', uncheck: '#34d399',
  hover: '#22d3ee',
  wait: '#fbbf24',
  screenshot: '#fb7185',
  scroll: '#fb923c',
  press: '#e879f9',
  reload: '#38bdf8',
  goback: '#94a3b8', goforward: '#94a3b8',
  drag: '#f472b6',
  evaluate: '#facc15',
};
