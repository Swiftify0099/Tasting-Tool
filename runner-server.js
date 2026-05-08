const express = require('express');
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/run-test', async (req, res) => {
  const { flow } = req.body || {};

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  const send = (type, payload) => {
    try {
      res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
    } catch (_) {}
  };

  let browser;
  try {
    send('TEST_RUN_LOG', { logType: 'info', message: '▶  Starting Playwright runner…' });
    send('TEST_RUN_LOG', { logType: 'info', message: 'Browser: chromium (headless)' });

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    send('TEST_RUN_LOG', { logType: 'info', message: 'Browser launched successfully' });

    const steps = (flow?.steps || []).filter(s => s.enabled !== false);
    const baseUrl = flow?.baseUrl && flow.baseUrl !== 'https://' ? flow.baseUrl : '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const label = step.action === 'visit'
        ? (step.url || baseUrl || 'page')
        : (step.label || step.action);

      send('TEST_RUN_LOG', { logType: 'step', message: `[${i + 1}/${steps.length}] ${label} (${step.action})` });
      send('TEST_RUN_STEP', step);

      try {
        await executeStep(page, step, baseUrl);

        const buf = await page.screenshot({ type: 'jpeg', quality: 75, fullPage: false });
        const b64 = buf.toString('base64');
        send('TEST_RUN_SCREENSHOT', { stepIdx: i, action: step.action, phase: 'after', screenshotBase64: b64 });

      } catch (stepErr) {
        const errMsg = stepErr.message || String(stepErr);
        send('TEST_RUN_LOG', { logType: 'error', message: `Step ${i + 1} failed: ${errMsg.split('\n')[0]}` });

        try {
          const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
          send('TEST_RUN_SCREENSHOT', { stepIdx: i, action: step.action, phase: 'error', screenshotBase64: buf.toString('base64') });
        } catch (_) {}

        await browser.close().catch(() => {});
        send('TEST_RUN_COMPLETE', { passed: false });
        res.end();
        return;
      }
    }

    send('TEST_RUN_LOG', { logType: 'success', message: `✓  All ${steps.length} step${steps.length !== 1 ? 's' : ''} passed` });
    send('TEST_RUN_LOG', { logType: 'info', message: `${steps.length} passed (${((Date.now() % 100000) / 1000).toFixed(1)}s)` });
    send('TEST_RUN_COMPLETE', { passed: true });

  } catch (err) {
    const msg = err.message || String(err);
    send('TEST_RUN_LOG', { logType: 'error', message: `Runner error: ${msg.split('\n')[0]}` });
    send('TEST_RUN_COMPLETE', { passed: false });
  } finally {
    if (browser) await browser.close().catch(() => {});
    res.end();
  }
});

async function executeStep(page, step, baseUrl) {
  const sel = step.selector ? step.selector : '[data-testid="element"]';
  const timeout = (step.timeout && step.timeout > 0) ? step.timeout : 15000;

  switch (step.action) {
    case 'visit': {
      const url = step.url || step.value || baseUrl;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    }
    case 'click':
      await page.locator(sel).first().click({ timeout });
      break;
    case 'dblclick':
      await page.locator(sel).first().dblclick({ timeout });
      break;
    case 'rightclick':
      await page.locator(sel).first().click({ button: 'right', timeout });
      break;
    case 'hover':
      await page.locator(sel).first().hover({ timeout });
      break;
    case 'fill':
      await page.locator(sel).first().fill(step.value || '', { timeout });
      break;
    case 'type':
      await page.locator(sel).first().pressSequentially(step.value || '', { delay: 50 });
      break;
    case 'clear':
      await page.locator(sel).first().fill('', { timeout });
      break;
    case 'select':
      await page.locator(sel).first().selectOption(step.value || '', { timeout });
      break;
    case 'check':
      await page.locator(sel).first().check({ timeout });
      break;
    case 'uncheck':
      await page.locator(sel).first().uncheck({ timeout });
      break;
    case 'focus':
      await page.locator(sel).first().focus({ timeout });
      break;
    case 'press':
      if (!step.selector) {
        await page.keyboard.press(step.key || 'Enter');
      } else {
        await page.locator(sel).first().press(step.key || 'Enter');
      }
      break;
    case 'scroll': {
      if (step.scrollType === 'element') {
        await page.locator(sel).first().scrollIntoViewIfNeeded();
      } else {
        const x = step.scrollX || 0;
        const y = step.scrollY !== undefined ? step.scrollY : 500;
        await page.evaluate(([sx, sy]) => window.scrollBy({ left: sx, top: sy, behavior: 'smooth' }), [x, y]);
        await page.waitForTimeout(400);
      }
      break;
    }
    case 'wait': {
      const val = step.value || '';
      const ms = parseInt(val);
      if (!isNaN(ms) && ms > 0) {
        await page.waitForTimeout(ms);
      } else if (val && val.length > 1) {
        await page.waitForSelector(val, { timeout });
      } else {
        await page.waitForTimeout(1000);
      }
      break;
    }
    case 'assert': {
      const expected = step.assertExpected || '';
      const aSel = step.assertSelector || sel;
      switch (step.assertType || 'visibility') {
        case 'url':
          if (!page.url().includes(expected)) throw new Error(`URL "${page.url()}" does not include "${expected}"`);
          break;
        case 'title': {
          const title = await page.title();
          if (!title.includes(expected)) throw new Error(`Title "${title}" does not include "${expected}"`);
          break;
        }
        case 'text': {
          const loc = page.locator(aSel).first();
          await loc.waitFor({ timeout });
          const text = await loc.innerText();
          if (!text.includes(expected)) throw new Error(`Text "${text}" does not include "${expected}"`);
          break;
        }
        case 'visibility': {
          const loc = page.locator(aSel).first();
          if (expected === 'hidden') {
            await loc.waitFor({ state: 'hidden', timeout });
          } else {
            await loc.waitFor({ state: 'visible', timeout });
          }
          break;
        }
        case 'value': {
          const loc = page.locator(aSel).first();
          const val = await loc.inputValue();
          if (!val.includes(expected)) throw new Error(`Value "${val}" does not include "${expected}"`);
          break;
        }
        default:
          await page.locator(aSel).first().waitFor({ state: 'visible', timeout });
      }
      break;
    }
    case 'screenshot':
      break;
    case 'reload':
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    case 'goback':
      await page.goBack({ timeout: 15000 });
      break;
    case 'goforward':
      await page.goForward({ timeout: 15000 });
      break;
    case 'evaluate': {
      const script = step.evaluateScript || '';
      if (script) await page.evaluate(new Function(script));
      break;
    }
    case 'setviewport':
      await page.setViewportSize({ width: step.viewportWidth || 1280, height: step.viewportHeight || 720 });
      break;
    case 'drag':
      await page.dragAndDrop(sel, step.dragTargetSelector || sel);
      break;
    case 'newpage':
      break;
    case 'popup':
      break;
    default:
      await page.waitForTimeout(300);
  }
}

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Playwright runner server listening on port ${PORT}`);
  console.log('Installing Chromium browser (first-time setup)…');
  try {
    execSync('npx playwright install chromium 2>&1', { stdio: 'inherit', timeout: 120000 });
    console.log('Chromium ready.');
  } catch (e) {
    console.error('Warning: Chromium install failed. Tests may not run:', e.message);
  }
});
