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
            const isRadioOrCheck = tag === 'input' && (type === 'radio' || type === 'checkbox');
            const rawText = isRadioOrCheck && !(el.textContent || '').trim()
              ? (el.value ? `${name || type}: ${el.value}` : name || `${type} input`)
              : (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
            const className = typeof el.className === 'string' ? el.className : '';

            // Skip hidden elements (radio/checkbox are often hidden by custom CSS — keep them)
            if (!isRadioOrCheck) {
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden') return;
            }

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
  let frameLoopActive = false;
  let frameLoopTimer = null;

  const startFrameLoop = (page) => {
    frameLoopActive = true;
    const loop = async () => {
      if (!frameLoopActive) return;
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
        send('TEST_RUN_FRAME', { frameBase64: buf.toString('base64') });
      } catch (_) {}
      if (frameLoopActive) frameLoopTimer = setTimeout(loop, 67);
    };
    loop();
  };

  const stopFrameLoop = () => {
    frameLoopActive = false;
    if (frameLoopTimer) { clearTimeout(frameLoopTimer); frameLoopTimer = null; }
  };

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

    startFrameLoop(page);

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
      } catch (stepErr) {
        const errMsg = stepErr.message || String(stepErr);
        send('TEST_RUN_LOG', { logType: 'error', message: `Step ${i + 1} failed: ${errMsg.split('\n')[0]}` });

        stopFrameLoop();
        try {
          const buf = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
          send('TEST_RUN_SCREENSHOT', { stepIdx: i, action: step.action, phase: 'error', screenshotBase64: buf.toString('base64') });
        } catch (_) {}

        await browser.close().catch(() => {});
        send('TEST_RUN_COMPLETE', { passed: false });
        res.end();
        return;
      }
    }

    stopFrameLoop();
    try {
      const buf = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
      send('TEST_RUN_SCREENSHOT', { stepIdx: steps.length - 1, action: 'complete', phase: 'final', screenshotBase64: buf.toString('base64') });
    } catch (_) {}

    send('TEST_RUN_LOG', { logType: 'success', message: `✓  All ${steps.length} step${steps.length !== 1 ? 's' : ''} passed` });
    send('TEST_RUN_LOG', { logType: 'info', message: `${steps.length} passed (${((Date.now() % 100000) / 1000).toFixed(1)}s)` });
    send('TEST_RUN_COMPLETE', { passed: true });

  } catch (err) {
    const msg = err.message || String(err);
    send('TEST_RUN_LOG', { logType: 'error', message: `Runner error: ${msg.split('\n')[0]}` });
    send('TEST_RUN_COMPLETE', { passed: false });
  } finally {
    stopFrameLoop();
    if (browser) await browser.close().catch(() => {});
    res.end();
  }
});

async function executeStep(page, step, baseUrl) {
  const sel = (step.selector && step.selector.trim()) ? step.selector.trim() : null;
  const timeout = (step.timeout && step.timeout > 0) ? step.timeout : 15000;

  // Actions that need an element selector
  const needsSelector = ['click','dblclick','rightclick','hover','fill','type','clear','select','check','uncheck','focus','blur','upload','assert'];
  if (needsSelector.includes(step.action) && !sel) {
    throw new Error(`Step "${step.label || step.action}" has no selector configured. Open the Builder and set a selector for this step.`);
  }

  switch (step.action) {
    case 'visit': {
      const url = step.url || step.value || baseUrl;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    }
    case 'click': {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'attached', timeout });
      await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      try {
        await loc.click({ timeout });
      } catch (clickErr) {
        // Fallback: force-click bypasses overlay/animation interception
        await loc.click({ force: true, timeout });
      }
      break;
    }
    case 'dblclick': {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'attached', timeout });
      await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      try {
        await loc.dblclick({ timeout });
      } catch (clickErr) {
        await loc.dblclick({ force: true, timeout });
      }
      break;
    }
    case 'rightclick': {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'attached', timeout });
      await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      try {
        await loc.click({ button: 'right', timeout });
      } catch (clickErr) {
        await loc.click({ button: 'right', force: true, timeout });
      }
      break;
    }
    case 'hover':
      await page.locator(sel).first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
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

// ── Live Browser: SSE streaming + REST events ─────────────────────────────
// Sessions map: sessionId → { browser, page, active, loopTimer, navigating, sseRes }
const liveSessions = new Map();

function makeSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// GET /api/live/stream  — opens SSE stream, launches Chromium, starts frame loop
app.get('/api/live/stream', async (req, res) => {
  const sessionId = makeSessionId();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (_) {}
  };

  const session = { browser: null, page: null, active: true, loopTimer: null, navigating: false, sseRes: res };
  liveSessions.set(sessionId, session);

  const captureLoop = async () => {
    if (!session.active || !session.page) return;
    if (!session.navigating) {
      try {
        const buf = await session.page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
        const url = session.page.url();
        sendEvent({ type: 'frame', data: buf.toString('base64'), url: url === 'about:blank' ? '' : url });
      } catch (_) {}
    }
    if (session.active) session.loopTimer = setTimeout(captureLoop, 80);
  };

  const cleanup = async () => {
    session.active = false;
    if (session.loopTimer) clearTimeout(session.loopTimer);
    if (session.browser) await session.browser.close().catch(() => {});
    liveSessions.delete(sessionId);
  };

  req.on('close', cleanup);

  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    };
    if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;

    session.browser = await chromium.launch(launchOptions);
    const context = await session.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    session.page = await context.newPage();
    await session.page.goto('about:blank');

    sendEvent({ type: 'ready', sessionId, url: '' });
    captureLoop();
  } catch (err) {
    sendEvent({ type: 'error', message: `Failed to launch browser: ${err.message}` });
    await cleanup();
    res.end();
  }
});

// POST /api/live/event  — forward a user interaction to Playwright
app.post('/api/live/event', async (req, res) => {
  const { sessionId, type, ...data } = req.body || {};
  const session = liveSessions.get(sessionId);
  if (!session || !session.page) return res.json({ ok: false, error: 'session not found' });

  const page = session.page;
  try {
    switch (type) {
      case 'navigate': {
        session.navigating = true;
        try {
          await page.goto(data.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (session.sseRes) {
            try { session.sseRes.write(`data: ${JSON.stringify({ type: 'navigated', url: page.url() })}\n\n`); } catch (_) {}
          }
        } catch (e) {
          if (session.sseRes) {
            try { session.sseRes.write(`data: ${JSON.stringify({ type: 'error', message: `Navigation failed: ${e.message.split('\n')[0]}` })}\n\n`); } catch (_) {}
          }
        } finally {
          session.navigating = false;
        }
        break;
      }
      case 'goback':
        try { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
        break;
      case 'goforward':
        try { await page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
        break;
      case 'reload':
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (_) {}
        break;
      case 'click':
        await page.mouse.click(data.x, data.y, { button: data.button || 'left' });
        break;
      case 'dblclick':
        await page.mouse.dblclick(data.x, data.y);
        break;
      case 'mousemove':
        await page.mouse.move(data.x, data.y);
        break;
      case 'keydown':
        await page.keyboard.press(data.key);
        break;
      case 'type':
        await page.keyboard.type(data.text, { delay: 0 });
        break;
      case 'wheel':
        await page.mouse.wheel(data.deltaX || 0, data.deltaY || 0);
        break;
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// POST /api/live/stop  — close a session explicitly
app.post('/api/live/stop', async (req, res) => {
  const { sessionId } = req.body || {};
  const session = liveSessions.get(sessionId);
  if (session) {
    session.active = false;
    if (session.loopTimer) clearTimeout(session.loopTimer);
    if (session.browser) await session.browser.close().catch(() => {});
    liveSessions.delete(sessionId);
  }
  res.json({ ok: true });
});

// ─── Smart Script Generator ─────────────────────────────────────────────────

function genStepId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mkStep(action, label, extras = {}) {
  return { id: genStepId(), action, label, enabled: true, timeout: 30000, ...extras };
}

// extractPageDOM returns { selector, type, label, placeholder, name, ... }
// label = ariaLabel || placeholder || name — use label as the display name
function smartFieldValue(el) {
  const t = (el.type || '').toLowerCase();
  const n = (el.name || el.placeholder || el.label || '').toLowerCase();
  if (t === 'email'  || n.includes('email'))                                 return 'test@example.com';
  if (t === 'password')                                                      return 'TestPass123!';
  if (n.includes('confirm') || n.includes('repeat') || n.includes('re-enter')) return 'TestPass123!';
  if (t === 'tel'    || n.includes('phone') || n.includes('mobile'))        return '+15551234567';
  if (t === 'number' || n.includes('age')   || n.includes('qty'))           return '25';
  if (t === 'url'    || n.includes('website'))                               return 'https://example.com';
  if (t === 'date')                                                          return '2025-01-15';
  if (n.includes('first') && n.includes('name'))                            return 'John';
  if (n.includes('last')  && n.includes('name'))                            return 'Doe';
  if (n.includes('name'))                                                   return 'John Doe';
  if (n.includes('address') || n.includes('street'))                        return '123 Main St';
  if (n.includes('city'))                                                   return 'New York';
  if (n.includes('zip') || n.includes('postal'))                            return '10001';
  if (n.includes('country'))                                                return 'US';
  if (n.includes('company') || n.includes('organization'))                  return 'Acme Corp';
  if (n.includes('message') || n.includes('comment') || n.includes('note') || n.includes('description')) return 'This is a test message for automated testing.';
  if (n.includes('search') || n.includes('query') || n.includes('keyword')) return 'test query';
  if (n.includes('username') || n.includes('user'))                         return 'testuser123';
  if (n.includes('subject') || n.includes('title'))                         return 'Test Subject';
  if (t === 'textarea')                                                      return 'This is a test message for automated testing.';
  return 'Test Value';
}

// extractPageDOM returns { inputs, selects, textareas, buttons, title }
// Each input: { selector, type, label, placeholder, name, ... }
// Each button: { selector, text, type }
// Each select: { selector, label, options, name }
// Each textarea: { selector, label, placeholder, name }
// NOTE: checkboxes are inputs with type==='checkbox'|'radio'; links fetched separately

function elLabel(el) {
  // unified label helper — works for both inputs (label field) and buttons (text field)
  return el.label || el.placeholder || el.name || el.text || '';
}

function detectPageType(inputs, buttons, textareas, pageTitle) {
  const titleLow  = (pageTitle || '').toLowerCase();
  const allBtnTxt = (buttons || []).map(b => b.text || '').join(' ').toLowerCase();
  const allInputs = [...(inputs || []), ...(textareas || [])];

  const passwordFields = (inputs || []).filter(e => e.type === 'password');
  const hasConfirmPwd  = allInputs.some(e => {
    const n = (e.name || e.placeholder || e.label || '').toLowerCase();
    return n.includes('confirm') || n.includes('repeat') || n.includes('re-enter') || n.includes('verify');
  });
  const searchFields = (inputs || []).filter(e => {
    const n = (e.name || e.placeholder || e.label || '').toLowerCase();
    return e.type === 'search' || n.includes('search') || n.includes('query') || n.includes('find');
  });
  const hasContactFields = allInputs.some(e => {
    const n = (e.name || e.placeholder || e.label || '').toLowerCase();
    return n.includes('message') || n.includes('subject') || n.includes('comment');
  });
  const hasPriceIndicators = allBtnTxt.match(/add to cart|buy now|checkout|add to bag|purchase/);

  if ((passwordFields.length > 0 && hasConfirmPwd) || titleLow.match(/register|sign.?up|create.?account/)) return 'signup';
  if (passwordFields.length > 0 || titleLow.match(/login|log.?in|sign.?in|password|authentication/))       return 'login';
  if (hasPriceIndicators || titleLow.match(/\bcart\b|\bshop\b|\bstore\b|\bproduct\b|\bcheckout\b/))        return 'ecommerce';
  if (searchFields.length > 0 && allInputs.length <= 3)                                                    return 'search';
  if (hasContactFields && allInputs.length > 0)                                                            return 'contact';
  if (allInputs.length === 0 && (buttons || []).length > 2)                                                return 'dashboard';
  return 'general';
}

function generateStepsForPage({ pageType, url, pageTitle, inputs, buttons, selects, checkboxes, links, textareas }) {
  // Ensure all arrays are safe
  inputs     = inputs     || [];
  buttons    = buttons    || [];
  selects    = selects    || [];
  checkboxes = checkboxes || [];
  links      = links      || [];
  textareas  = textareas  || [];

  const steps = [];

  // Always start: visit + wait + screenshot + title assert
  steps.push(mkStep('visit',      `Visit: ${url}`,             { url, comment: `Open the ${pageType} page` }));
  steps.push(mkStep('wait',       'Wait: Page ready',          { value: '1500', comment: 'Wait for full page load' }));
  steps.push(mkStep('screenshot', 'Screenshot: Initial state', { comment: 'Capture initial page state' }));
  if (pageTitle) {
    steps.push(mkStep('assert', `Assert: Page title "${pageTitle}"`, { assertType: 'title', assertExpected: pageTitle, comment: 'Verify correct page loaded' }));
  }

  switch (pageType) {

    case 'login': {
      const userField  = inputs.find(e => { const n = (e.name||e.placeholder||e.label||'').toLowerCase(); return e.type==='email'||n.includes('email')||n.includes('user')||n.includes('login')||n.includes('identifier'); });
      const pwdField   = inputs.find(e => e.type === 'password');
      const submitBtn  = buttons.find(e => ['login','log in','sign in','submit','continue','enter'].some(kw => (e.text||'').toLowerCase().includes(kw)));
      const rememberMe = checkboxes.find(e => (e.label||e.placeholder||'').toLowerCase().includes('remember'));

      if (userField)   steps.push(mkStep('fill',  `Fill: ${elLabel(userField)||'Email/Username'}`,  { selector: userField.selector,  value: 'test@example.com', comment: 'Enter valid login credential' }));
      if (pwdField)    steps.push(mkStep('fill',  'Fill: Password',                                  { selector: pwdField.selector,   value: 'TestPass123!',     comment: 'Enter password' }));
      if (rememberMe)  steps.push(mkStep('check', 'Check: Remember me',                              { selector: rememberMe.selector, comment: 'Check remember me option' }));
      steps.push(mkStep('screenshot', 'Screenshot: Before submit', { comment: 'Capture filled form' }));
      if (submitBtn)   steps.push(mkStep('click', `Click: ${submitBtn.text||'Login button'}`,        { selector: submitBtn.selector,  comment: 'Submit login form' }));
      else             steps.push(mkStep('press', 'Press: Enter to submit',                          { key: 'Enter', pressTarget: 'keyboard', comment: 'Submit with Enter key' }));
      steps.push(mkStep('wait',       'Wait: 2s for auth response', { value: '2000', comment: 'Wait for authentication' }));
      steps.push(mkStep('screenshot', 'Screenshot: After login',    { comment: 'Capture post-login state' }));

      // Empty field test
      steps.push(mkStep('visit', `Visit: ${url}`, { url, comment: 'Re-visit for empty field validation test' }));
      if (submitBtn)   steps.push(mkStep('click', `Click: ${submitBtn.text||'Submit'} (empty)`, { selector: submitBtn.selector, comment: 'Submit empty — expect validation errors' }));
      else             steps.push(mkStep('press', 'Press: Enter (empty form)', { key: 'Enter', pressTarget: 'keyboard' }));
      steps.push(mkStep('screenshot', 'Screenshot: Empty field validation', { comment: 'Verify validation errors shown' }));

      // Wrong credentials test
      steps.push(mkStep('visit', `Visit: ${url}`, { url, comment: 'Re-visit for wrong-credentials test' }));
      if (userField)   steps.push(mkStep('fill', 'Fill: Wrong email',    { selector: userField.selector, value: 'wrong@example.com', comment: 'Enter invalid credential' }));
      if (pwdField)    steps.push(mkStep('fill', 'Fill: Wrong password', { selector: pwdField.selector,  value: 'WrongPass999!',      comment: 'Enter wrong password' }));
      if (submitBtn)   steps.push(mkStep('click', `Click: ${submitBtn.text||'Submit'} (invalid)`, { selector: submitBtn.selector, comment: 'Submit with wrong credentials' }));
      steps.push(mkStep('wait',       'Wait: 2s', { value: '2000' }));
      steps.push(mkStep('screenshot', 'Screenshot: Error state', { comment: 'Verify error message is displayed' }));
      break;
    }

    case 'signup': {
      const pwdFields  = inputs.filter(e => e.type === 'password');
      const emailField = inputs.find(e => e.type==='email' || (e.name||e.placeholder||e.label||'').toLowerCase().includes('email'));
      const nameField  = inputs.find(e => { const n=(e.name||e.placeholder||e.label||'').toLowerCase(); return n.includes('name') && !n.includes('user') && e.type!=='password'; });
      const submitBtn  = buttons.find(e => ['register','sign up','signup','create','join','submit'].some(kw => (e.text||'').toLowerCase().includes(kw)));
      const terms      = checkboxes.find(e => (e.label||e.placeholder||'').toLowerCase().match(/term|agree|consent/));

      if (nameField)    steps.push(mkStep('fill', `Fill: ${elLabel(nameField)||'Full Name'}`, { selector: nameField.selector, value: 'John Doe', comment: 'Enter full name' }));
      inputs.filter(e => e !== nameField && e !== emailField && e.type !== 'password' && e.type !== 'checkbox' && e.type !== 'radio').forEach(e => {
        steps.push(mkStep('fill', `Fill: ${elLabel(e)||'Field'}`, { selector: e.selector, value: smartFieldValue(e), comment: `Fill: ${e.name||e.placeholder||'field'}` }));
      });
      if (emailField)   steps.push(mkStep('fill', `Fill: ${elLabel(emailField)||'Email'}`, { selector: emailField.selector, value: 'newuser@example.com', comment: 'Enter email address' }));
      if (pwdFields[0]) steps.push(mkStep('fill', 'Fill: Password',         { selector: pwdFields[0].selector, value: 'SecurePass123!', comment: 'Enter password' }));
      if (pwdFields[1]) steps.push(mkStep('fill', 'Fill: Confirm Password', { selector: pwdFields[1].selector, value: 'SecurePass123!', comment: 'Confirm password matches' }));
      selects.forEach(e  => steps.push(mkStep('select', `Select: ${elLabel(e)||'Dropdown'}`, { selector: e.selector, value: '', comment: 'Select from dropdown' })));
      if (terms)        steps.push(mkStep('check', 'Check: Terms & Conditions', { selector: terms.selector, comment: 'Accept terms' }));
      steps.push(mkStep('screenshot', 'Screenshot: Before register', {}));
      if (submitBtn)    steps.push(mkStep('click', `Click: ${submitBtn.text||'Register'}`, { selector: submitBtn.selector, comment: 'Submit registration' }));
      steps.push(mkStep('wait',       'Wait: 2s', { value: '2000' }));
      steps.push(mkStep('screenshot', 'Screenshot: After signup', { comment: 'Verify success/redirect' }));
      break;
    }

    case 'search': {
      const searchField = inputs.find(e => e.type==='search' || (e.name||e.placeholder||e.label||'').toLowerCase().match(/search|find|query|keyword/));
      const searchBtn   = buttons.find(e => (e.text||'').toLowerCase().match(/search|find|^go$|submit/));
      if (searchField) {
        steps.push(mkStep('fill', `Fill: "${smartFieldValue(searchField)}" in search`, { selector: searchField.selector, value: smartFieldValue(searchField), comment: 'Enter search query' }));
        if (searchBtn)  steps.push(mkStep('click', `Click: ${searchBtn.text||'Search'}`, { selector: searchBtn.selector, comment: 'Submit search' }));
        else            steps.push(mkStep('press', 'Press: Enter to search', { key: 'Enter', pressTarget: 'keyboard', comment: 'Submit with Enter' }));
        steps.push(mkStep('wait',       'Wait: 2s for results', { value: '2000', comment: 'Wait for results' }));
        steps.push(mkStep('screenshot', 'Screenshot: Search results', { comment: 'Verify results displayed' }));
        steps.push(mkStep('visit', `Visit: ${url}`, { url, comment: 'Re-visit for empty search test' }));
        steps.push(mkStep('fill',  'Fill: (empty search)', { selector: searchField.selector, value: '', comment: 'Clear search field' }));
        if (searchBtn)  steps.push(mkStep('click', `Click: ${searchBtn.text||'Search'} (empty)`, { selector: searchBtn.selector }));
        steps.push(mkStep('screenshot', 'Screenshot: Empty search', {}));
      }
      break;
    }

    case 'contact': {
      [...inputs.filter(e => e.type !== 'checkbox' && e.type !== 'radio'), ...textareas].slice(0, 12).forEach(e => {
        steps.push(mkStep('fill', `Fill: ${elLabel(e)||'Field'}`, { selector: e.selector, value: smartFieldValue(e), comment: `Fill: ${e.name||e.placeholder||'field'}` }));
      });
      selects.forEach(e    => steps.push(mkStep('select', `Select: ${elLabel(e)||'Dropdown'}`, { selector: e.selector, value: '', comment: 'Select option' })));
      checkboxes.forEach(e => steps.push(mkStep('check',  `Check: ${elLabel(e)||'Checkbox'}`,  { selector: e.selector, comment: 'Check checkbox' })));
      steps.push(mkStep('screenshot', 'Screenshot: Form filled', {}));
      const submitBtn = buttons.find(e => ['send','submit','contact','message','post'].some(kw => (e.text||'').toLowerCase().includes(kw))) || buttons[0];
      if (submitBtn) steps.push(mkStep('click', `Click: ${submitBtn.text||'Submit'}`, { selector: submitBtn.selector, comment: 'Submit contact form' }));
      steps.push(mkStep('wait',       'Wait: 2s', { value: '2000' }));
      steps.push(mkStep('screenshot', 'Screenshot: After submit', { comment: 'Verify confirmation message' }));
      break;
    }

    case 'ecommerce': {
      steps.push(mkStep('scroll', 'Scroll: Browse products', { scrollType: 'page', scrollY: 400, comment: 'Scroll to see products' }));
      steps.push(mkStep('screenshot', 'Screenshot: Products visible', {}));
      const cartBtn     = buttons.find(e => ['add to cart','add to bag','buy now','purchase'].some(kw => (e.text||'').toLowerCase().includes(kw)));
      const checkoutBtn = buttons.find(e => (e.text||'').toLowerCase().includes('checkout'));
      if (cartBtn) {
        steps.push(mkStep('click', `Click: ${cartBtn.text||'Add to Cart'}`, { selector: cartBtn.selector, comment: 'Add product to cart' }));
        steps.push(mkStep('wait',       'Wait: 1s', { value: '1000' }));
        steps.push(mkStep('screenshot', 'Screenshot: After add-to-cart', {}));
      }
      if (checkoutBtn) {
        steps.push(mkStep('click', `Click: ${checkoutBtn.text||'Checkout'}`, { selector: checkoutBtn.selector, comment: 'Proceed to checkout' }));
        steps.push(mkStep('wait',       'Wait: 2s', { value: '2000' }));
        steps.push(mkStep('screenshot', 'Screenshot: Checkout page', {}));
      }
      break;
    }

    case 'dashboard': {
      steps.push(mkStep('scroll', 'Scroll: Browse dashboard', { scrollType: 'page', scrollY: 400, comment: 'Scroll dashboard' }));
      steps.push(mkStep('screenshot', 'Screenshot: Dashboard content', {}));
      links.filter(l => l.text && l.text.length < 50).slice(0, 3).forEach(l => {
        steps.push(mkStep('click',      `Click: ${l.text}`,              { selector: l.selector, comment: `Navigate: ${l.text}` }));
        steps.push(mkStep('wait',       'Wait: 1.5s',                    { value: '1500' }));
        steps.push(mkStep('screenshot', `Screenshot: ${l.text} section`, {}));
        steps.push(mkStep('goback',     'Go Back',                       { comment: 'Return to dashboard' }));
        steps.push(mkStep('wait',       'Wait: 1s',                      { value: '1000' }));
      });
      break;
    }

    default: { // general
      [...inputs.filter(e => e.type !== 'checkbox' && e.type !== 'radio'), ...textareas].slice(0, 10).forEach(e => {
        steps.push(mkStep('fill', `Fill: ${elLabel(e)||'Input'}`, { selector: e.selector, value: smartFieldValue(e), comment: 'Fill input' }));
      });
      selects.slice(0, 5).forEach(e    => steps.push(mkStep('select', `Select: ${elLabel(e)||'Dropdown'}`, { selector: e.selector, value: '', comment: 'Select option' })));
      checkboxes.slice(0, 3).forEach(e => steps.push(mkStep('check',  `Check: ${elLabel(e)||'Checkbox'}`,  { selector: e.selector, comment: 'Check checkbox' })));
      if (inputs.length > 0 || textareas.length > 0) steps.push(mkStep('screenshot', 'Screenshot: Form filled', {}));
      const primaryBtn = buttons.find(b => ['submit','send','save','apply','confirm','continue','next','subscribe','get started','learn more','search'].some(kw => (b.text||'').toLowerCase().includes(kw))) || buttons[0];
      if (primaryBtn) {
        steps.push(mkStep('click', `Click: ${primaryBtn.text||'Button'}`, { selector: primaryBtn.selector, comment: 'Click primary action' }));
        steps.push(mkStep('wait',       'Wait: 2s', { value: '2000' }));
        steps.push(mkStep('screenshot', 'Screenshot: After action', {}));
      }
      steps.push(mkStep('scroll', 'Scroll: Page down', { scrollType: 'page', scrollY: 500, comment: 'Scroll to see more' }));
      steps.push(mkStep('screenshot', 'Screenshot: Scrolled view', {}));
      links.filter(l => l.text && l.text.length < 40).slice(0, 2).forEach(l => {
        steps.push(mkStep('click',      `Click: ${l.text}`,           { selector: l.selector, comment: `Navigate: ${l.text}` }));
        steps.push(mkStep('wait',       'Wait: 1.5s',                 { value: '1500' }));
        steps.push(mkStep('screenshot', `Screenshot: ${l.text} page`, {}));
        steps.push(mkStep('goback',     'Go Back',                    {}));
      });
      break;
    }
  }

  steps.push(mkStep('screenshot', 'Screenshot: Final state', { comment: 'Capture final page state' }));
  return steps;
}

// POST /api/generate-script  — visit URL, detect page type, stream TestStep[] via SSE
app.post('/api/generate-script', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (type, payload) => {
    try { res.write(`data: ${JSON.stringify({ type, payload })}\n\n`); } catch (_) {}
  };

  let browser;
  try {
    send('PROGRESS', { message: '🚀 Launching browser…' });

    const launchOpts = {
      headless: true,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-blink-features=AutomationControlled'],
    };
    if (CHROMIUM_PATH) launchOpts.executablePath = CHROMIUM_PATH;
    browser = await chromium.launch(launchOpts);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    await page.route('**/*.{mp4,webm,mp3,woff,woff2,ttf,eot}', r => r.abort().catch(() => {}));

    send('PROGRESS', { message: `📡 Navigating to ${url}…` });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Screenshot #1
    const shot1 = await page.screenshot({ type: 'jpeg', quality: 75 }).catch(() => null);
    if (shot1) send('SCREENSHOT', { frameBase64: shot1.toString('base64') });

    send('PROGRESS', { message: '🔍 Extracting DOM elements…' });

    // extractPageDOM returns { inputs, selects, textareas, buttons, title, url }
    let domResult = await extractPageDOM(page);
    if (!domResult || (!domResult.inputs?.length && !domResult.buttons?.length)) {
      domResult = await extractPageDOMFallback(page);
    }

    // Safe-destructure (both helpers return same shape)
    const inputs    = Array.isArray(domResult?.inputs)    ? domResult.inputs    : [];
    const selects   = Array.isArray(domResult?.selects)   ? domResult.selects   : [];
    const textareas = Array.isArray(domResult?.textareas) ? domResult.textareas : [];
    const buttons   = Array.isArray(domResult?.buttons)   ? domResult.buttons   : [];
    const pageTitle = domResult?.title || await page.title().catch(() => '');

    // Separate checkboxes/radios from regular inputs
    const checkboxes   = inputs.filter(e => e.type === 'checkbox' || e.type === 'radio');
    const regularInputs = inputs.filter(e => e.type !== 'checkbox' && e.type !== 'radio');

    // Grab top navigation links separately (not returned by extractPageDOM)
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .filter(a => {
          const s = window.getComputedStyle(a);
          return s.display !== 'none' && s.visibility !== 'hidden';
        })
        .map(a => {
          const text = (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ').slice(0, 60);
          const href = a.getAttribute('href') || '';
          const id   = a.id;
          const al   = a.getAttribute('aria-label');
          const selector = id ? `#${id}` : al ? `[aria-label="${al}"]` : text ? `text="${text.slice(0,40)}"` : 'a';
          return { selector, text, href };
        })
        .filter(l => l.text && l.href && !l.href.startsWith('javascript') && !l.href.startsWith('mailto') && !l.href.startsWith('#'))
        .slice(0, 10);
    }).catch(() => []);

    const totalCount = inputs.length + buttons.length + selects.length + textareas.length;
    send('PROGRESS', { message: `📊 Found ${totalCount} elements — analyzing page…` });

    const pageType = detectPageType(regularInputs, buttons, textareas, pageTitle);

    send('PAGE_INFO', {
      pageType,
      pageTitle,
      elementCounts: {
        inputs:  regularInputs.length + textareas.length,
        buttons: buttons.length,
        selects: selects.length,
        links:   links.length,
      },
    });
    send('PROGRESS', { message: `📋 Page type: "${pageType}" — generating steps…` });

    const steps = generateStepsForPage({
      pageType, url, pageTitle,
      inputs: regularInputs, buttons, selects, checkboxes, links, textareas,
    });

    // Stream steps one-by-one for live animation
    for (const step of steps) {
      send('STEP_ADDED', { step });
      await page.waitForTimeout(80);
    }

    // Final screenshot
    const shot2 = await page.screenshot({ type: 'jpeg', quality: 75 }).catch(() => null);
    if (shot2) send('SCREENSHOT', { frameBase64: shot2.toString('base64') });

    send('COMPLETE', { steps, pageType, pageTitle, elementCounts: { inputs: regularInputs.length, buttons: buttons.length } });

  } catch (err) {
    send('ERROR', { message: err.message || String(err) });
  } finally {
    if (browser) await browser.close().catch(() => {});
    res.end();
  }
});

// ── AI Autonomous Test Engine ──────────────────────────────────────────────
const AI_API_URL = 'https://specifically-task-dryer-supervisor.trycloudflare.com/generate';

async function callAI(payload) {
  try {
    const res = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('AI API error:', err.message);
    return null;
  }
}

async function extractDOMForAI(page) {
  try {
    return await page.evaluate(() => {
      const els = [...document.querySelectorAll('input,button,a,textarea,select,[role="button"],[role="link"]')];
      return els.slice(0, 80).map(el => ({
        tag:         el.tagName.toLowerCase(),
        text:        (el.innerText || el.textContent || '').trim().slice(0, 100),
        placeholder: el.getAttribute('placeholder') || '',
        type:        el.getAttribute('type') || '',
        name:        el.getAttribute('name') || '',
        id:          el.id || '',
        href:        el.getAttribute('href') || '',
        ariaLabel:   el.getAttribute('aria-label') || '',
        dataTestId:  el.getAttribute('data-testid') || '',
        selector:    el.id ? `#${el.id}` : el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : null,
      }));
    });
  } catch (_) { return []; }
}

async function executeAIAction(page, action, credentials) {
  const timeout = 12000;
  const tool = action.tool || action.type || '';
  const sel  = action.selector || '';

  // Auto-fill credentials if action references them by placeholder patterns
  let text = action.text || action.value || '';
  if (credentials) {
    if (/email|username|user|login/i.test(sel + action.placeholder + '') && !text) text = credentials.username;
    if (/password|pass|pwd/i.test(sel + action.placeholder + '') && !text) text = credentials.password;
  }

  switch (tool) {
    case 'type': case 'fill': case 'input':
      await page.locator(sel).first().fill(text, { timeout });
      break;
    case 'click': case 'press': case 'tap':
      await page.locator(sel).first().click({ timeout });
      break;
    case 'dblclick':
      await page.locator(sel).first().dblclick({ timeout });
      break;
    case 'hover':
      await page.locator(sel).first().hover({ timeout });
      break;
    case 'select':
      await page.locator(sel).first().selectOption(text, { timeout });
      break;
    case 'check':
      await page.locator(sel).first().check({ timeout });
      break;
    case 'navigate': case 'goto': case 'visit':
      await page.goto(action.url || sel, { waitUntil: 'domcontentloaded', timeout: 30000 });
      break;
    case 'wait': case 'sleep':
      await page.waitForTimeout(action.ms || action.duration || 1000);
      break;
    case 'scroll':
      await page.evaluate((y) => window.scrollBy(0, y), action.y || 300);
      break;
    case 'clear':
      await page.locator(sel).first().fill('', { timeout });
      break;
    default:
      if (sel) await page.locator(sel).first().click({ timeout });
  }

  // Wait for any navigation or network to settle
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
}

async function runAssertion(page, assertion) {
  const { selector, expected } = assertion;
  if (!selector) return true;
  try {
    if (expected === 'visible') {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 5000 });
    } else if (expected === 'hidden') {
      await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 5000 });
    } else if (expected) {
      const text = await page.locator(selector).first().innerText({ timeout: 5000 });
      if (!text.includes(expected)) throw new Error(`Expected "${expected}" but got "${text}"`);
    }
    return true;
  } catch (err) {
    return false;
  }
}

app.post('/api/ai-test/run', async (req, res) => {
  const {
    url: startUrl,
    goal = 'Test full website',
    credentials = null,
    maxPages = 8,
    maxSteps = 40,
  } = req.body || {};

  if (!startUrl) return res.status(400).json({ error: 'url is required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  const send = (type, payload = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, payload })}\n\n`); } catch (_) {}
  };

  // ── Session state ──
  const visitedPages   = new Set();
  const queue          = [startUrl];
  const testedComponents = {};
  const allScreenshots = [];
  const issues         = [];
  const discoveredSet  = new Set([startUrl]);
  let passed = 0, failed = 0, assertPassed = 0, assertFailed = 0;
  let stepCount = 0;
  let browser;

  try {
    send('LOG', { level: 'info', msg: '▶  Launching Chromium…' });

    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    };
    if (CHROMIUM_PATH) launchOptions.executablePath = CHROMIUM_PATH;

    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    send('LOG', { level: 'success', msg: 'Browser launched' });

    // ── Main autonomous loop ──
    while (queue.length > 0 && visitedPages.size < maxPages && stepCount < maxSteps) {
      const currentUrl = queue.shift();
      if (visitedPages.has(currentUrl)) continue;
      visitedPages.add(currentUrl);

      send('PAGE_START', { url: currentUrl, queueSize: queue.length, visited: visitedPages.size });
      send('LOG', { level: 'step', msg: `📄 Testing page: ${currentUrl}` });

      // Navigate
      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(800);
      } catch (e) {
        send('LOG', { level: 'error', msg: `Navigation failed: ${e.message.split('\n')[0]}` });
        issues.push({ page: currentUrl, issue: `Navigation failed: ${e.message.split('\n')[0]}` });
        continue;
      }

      const pageTitle = await page.title().catch(() => '');
      send('LOG', { level: 'info', msg: `  Title: "${pageTitle}" — extracting DOM…` });

      // Screenshot of initial page state
      const initShot = await page.screenshot({ type: 'jpeg', quality: 65 }).catch(() => null);
      if (initShot) {
        const s = { data: initShot.toString('base64'), url: page.url(), label: 'Page loaded', passed: true };
        allScreenshots.push(s);
        send('SCREENSHOT', s);
      }

      // Extract DOM
      const dom = await extractDOMForAI(page);
      send('DOM_EXTRACTED', { url: page.url(), count: dom.length });
      send('LOG', { level: 'info', msg: `  Extracted ${dom.length} interactive elements` });

      // Build AI payload
      const aiPayload = {
        goal,
        currentUrl: page.url(),
        pageTitle,
        visitedPages: [...visitedPages],
        queue: [...queue].slice(0, 10),
        dom,
        credentials: credentials ? { username: credentials.username, hasPassword: !!credentials.password } : null,
      };

      send('AI_THINKING', { url: page.url() });
      send('LOG', { level: 'info', msg: '  🤖 Asking AI to analyze page…' });

      const aiResult = await callAI(aiPayload);

      if (!aiResult) {
        send('LOG', { level: 'error', msg: '  AI API unreachable — skipping page' });
        issues.push({ page: currentUrl, issue: 'AI API did not respond' });
        continue;
      }

      // Parse AI response (it returns { success, response } where response is a JSON string)
      let aiData = { actions: [], assertions: [], discoveredRoutes: [], suggestions: [] };
      try {
        const raw = typeof aiResult.response === 'string' ? aiResult.response : JSON.stringify(aiResult.response || aiResult);
        // Strip markdown code fences if AI wraps it
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        aiData = JSON.parse(cleaned);
      } catch (_) {
        // Try extracting JSON object from the string
        try {
          const match = (aiResult.response || '').match(/\{[\s\S]*\}/);
          if (match) aiData = JSON.parse(match[0]);
        } catch (_) {}
      }

      const actionCount = (aiData.actions || []).length;
      const routeCount  = (aiData.discoveredRoutes || []).length;
      send('AI_RESPONSE', { actions: actionCount, routes: routeCount, assertions: (aiData.assertions||[]).length });
      send('LOG', { level: 'success', msg: `  AI returned ${actionCount} action(s), ${routeCount} route(s)` });

      // ── Execute actions ──
      for (const action of (aiData.actions || [])) {
        if (stepCount >= maxSteps) break;
        stepCount++;

        const actionLabel = `${action.tool || action.type} → ${action.selector || action.url || ''}`;
        send('ACTION_EXEC', { action, stepCount });
        send('LOG', { level: 'step', msg: `  [${stepCount}] ${actionLabel}` });

        const urlBefore = page.url();
        try {
          await executeAIAction(page, action, credentials);
          passed++;
          testedComponents[action.selector || action.tool] = true;

          const urlAfter = page.url();
          const shot = await page.screenshot({ type: 'jpeg', quality: 65 }).catch(() => null);
          if (shot) {
            const s = { data: shot.toString('base64'), url: urlAfter, label: actionLabel, passed: true };
            allScreenshots.push(s);
            send('SCREENSHOT', s);
          }

          if (urlAfter !== urlBefore && !visitedPages.has(urlAfter) && !discoveredSet.has(urlAfter)) {
            queue.push(urlAfter);
            discoveredSet.add(urlAfter);
            send('ROUTE_FOUND', { url: urlAfter, from: urlBefore });
            send('LOG', { level: 'info', msg: `  🔍 New route discovered: ${urlAfter}` });
          }

          send('ACTION_PASS', { action, stepCount, url: urlAfter });
        } catch (err) {
          failed++;
          const errMsg = err.message.split('\n')[0];
          send('ACTION_FAIL', { action, stepCount, error: errMsg });
          send('LOG', { level: 'error', msg: `  ✗ Failed: ${errMsg}` });
          issues.push({ page: currentUrl, action: actionLabel, issue: errMsg });

          const errShot = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
          if (errShot) {
            const s = { data: errShot.toString('base64'), url: page.url(), label: `Error: ${actionLabel}`, passed: false };
            allScreenshots.push(s);
            send('SCREENSHOT', s);
          }
        }
      }

      // ── Run assertions ──
      for (const assertion of (aiData.assertions || [])) {
        const ok = await runAssertion(page, assertion);
        if (ok) { assertPassed++; send('LOG', { level: 'success', msg: `  ✓ Assert passed: ${assertion.selector}` }); }
        else     { assertFailed++; send('LOG', { level: 'error',   msg: `  ✗ Assert failed: ${assertion.selector} (expected ${assertion.expected})` }); issues.push({ page: currentUrl, issue: `Assertion failed: ${assertion.selector}` }); }
      }

      // ── Add discovered routes ──
      for (const route of (aiData.discoveredRoutes || [])) {
        try {
          const full = route.startsWith('http') ? route : new URL(route, currentUrl).href;
          if (!visitedPages.has(full) && !discoveredSet.has(full)) {
            queue.push(full);
            discoveredSet.add(full);
            send('ROUTE_FOUND', { url: full, from: currentUrl });
            send('LOG', { level: 'info', msg: `  🔍 AI discovered route: ${full}` });
          }
        } catch (_) {}
      }

      // ── AI suggestions ──
      for (const suggestion of (aiData.suggestions || [])) {
        send('LOG', { level: 'info', msg: `  💡 Suggestion: ${suggestion}` });
      }

      send('PAGE_DONE', { url: currentUrl });
      send('LOG', { level: 'success', msg: `  ✓ Page done (${(aiData.actions||[]).length} actions ran)\n` });
    }

    // ── Final report ──
    const totalActions = passed + failed;
    const coverage = totalActions > 0 ? Math.round((passed / totalActions) * 100) : 100;
    const report = {
      totalPages: discoveredSet.size,
      testedPages: visitedPages.size,
      totalActions,
      passed,
      failed,
      assertPassed,
      assertFailed,
      coverage: `${coverage}%`,
      visitedPages: [...visitedPages],
      discoveredRoutes: [...discoveredSet],
      issues,
      screenshotCount: allScreenshots.length,
    };

    send('LOG', { level: 'success', msg: `\n✅ Testing complete — ${visitedPages.size} page(s), ${passed}/${totalActions} actions passed, ${coverage}% coverage` });
    send('COMPLETE', report);

  } catch (err) {
    send('LOG', { level: 'error', msg: `Fatal error: ${err.message}` });
    send('ERROR', { message: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
    res.end();
  }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Playwright runner server listening on port ${PORT}`);
  if (CHROMIUM_PATH) {
    console.log('Chromium ready (using system binary).');
  } else {
    console.warn('System Chromium not found — tests may fail if bundled binary has missing libs.');
  }
});
