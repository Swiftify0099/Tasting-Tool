const express = require('express');
const { chromium } = require('playwright');
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findSystemChromium() {
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const which = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null', { encoding: 'utf8' }).trim();
    if (which) return which;
  } catch (_) {}
  try {
    const nixResult = execSync(
      'find /nix/store -maxdepth 3 -name "chromium" -path "*/bin/chromium" 2>/dev/null | grep -v "\\.drv" | head -1',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    if (nixResult) return nixResult;
  } catch (_) {}
  return null;
}

const CHROMIUM_PATH = findSystemChromium();
console.log('System Chromium path:', CHROMIUM_PATH || '(not found, will use playwright bundled)');

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

app.post('/api/extract-dom', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    };
    if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;

    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Give JS a moment to render dynamic content
    await page.waitForTimeout(1500);

    const elements = await page.evaluate(() => {
      const results = [];
      const seen = new WeakSet();
      let uid = 0;

      const SELECTORS = [
        'button', 'input', 'select', 'textarea', 'a[href]',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
        '[role="textbox"]', '[role="combobox"]', '[role="menuitem"]',
        'form', '[data-testid]', '[data-cy]', '[data-qa]',
      ];

      const getXPath = (el) => {
        if (el.id) return `//*[@id="${el.id}"]`;
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1) {
          let idx = 1;
          let sib = node.previousSibling;
          while (sib) {
            if (sib.nodeType === 1 && sib.tagName === node.tagName) idx++;
            sib = sib.previousSibling;
          }
          parts.unshift(node.tagName.toLowerCase() + '[' + idx + ']');
          node = node.parentElement;
        }
        return '/' + parts.join('/');
      };

      SELECTORS.forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el => {
            if (seen.has(el)) return;
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

            // Skip hidden elements
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return;

            let selector = '';
            let quality = 'poor';
            if (dataTestId)    { selector = `[data-testid="${dataTestId}"]`; quality = 'excellent'; }
            else if (elId)     { selector = `#${elId}`;                      quality = 'good'; }
            else if (name)     { selector = `[name="${name}"]`;              quality = 'good'; }
            else if (ariaLabel){ selector = `[aria-label="${ariaLabel}"]`;   quality = 'fair'; }
            else if (placeholder){ selector = `[placeholder="${placeholder}"]`; quality = 'fair'; }
            else if (rawText && (tag === 'button' || tag === 'a') && rawText.length < 50) {
              selector = `text="${rawText}"`; quality = 'fair';
            } else {
              const cls = className.split(' ').filter(Boolean).slice(0, 2).join('.');
              selector = tag + (cls ? '.' + cls : '');
              quality = 'poor';
            }

            let category = 'other';
            if (tag === 'button' || (tag === 'input' && ['button','submit','reset'].includes(type)) || role === 'button') { category = 'button'; }
            else if ((tag === 'input' && type === 'checkbox') || role === 'checkbox') { category = 'checkbox'; }
            else if ((tag === 'input' && type === 'radio')    || role === 'radio')    { category = 'radio'; }
            else if (tag === 'input'    || role === 'textbox')  { category = 'input'; }
            else if (tag === 'select'   || role === 'combobox') { category = 'select'; }
            else if (tag === 'textarea')                        { category = 'textarea'; }
            else if (tag === 'a')                               { category = 'link'; }
            else if (tag === 'form')                            { category = 'form'; }

            results.push({
              uid: String(++uid), tag, type, elementId: elId, name, ariaLabel,
              placeholder, dataTestId, text: rawText, selector,
              xpath: getXPath(el), role, className, href, category, selectorQuality: quality,
            });
          });
        } catch (_) {}
      });

      return results;
    });

    await browser.close();
    res.json({ elements, url });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: err.message || String(err) });
  }
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

    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    };
    if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;

    browser = await chromium.launch(launchOptions);

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
  if (CHROMIUM_PATH) {
    console.log('Chromium ready (using system binary).');
  } else {
    console.warn('System Chromium not found — tests may fail if bundled binary has missing libs.');
  }
});
