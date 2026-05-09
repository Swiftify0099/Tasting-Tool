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

// ── AI Live Tester ────────────────────────────────────────────────────────

async function dismissOverlays(page, send) {
  const selectors = [
    '[id*="cookie"] button', '[class*="cookie"] button',
    '[id*="consent"] button', '[class*="consent"] button',
    'button[aria-label*="Accept"], button[aria-label*="accept"]',
    'button[aria-label*="Close"], button[aria-label*="close"]',
    '[role="dialog"] button[class*="close"]',
    '[role="dialog"] button[aria-label*="close"]',
    'button[class*="dismiss"]', 'button[class*="cookie-close"]',
    'button[id*="onetrust-accept"]', '#onetrust-accept-btn-handler',
    '.fc-cta-consent', '.fc-button-label',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      const visible = await el.isVisible({ timeout: 600 }).catch(() => false);
      if (visible) {
        await el.click({ force: true, timeout: 2000 });
        await page.waitForTimeout(600);
        send('LOG', { level: 'info', message: `  ✓ Dismissed overlay` });
        break;
      }
    } catch (_) {}
  }
}

// ── Robust DOM extraction (main frame via page.evaluate) ──────────────────
async function extractPageDOM(page) {
  return page.evaluate(() => {
    const getSelector = (el) => {
      const dt = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-qa');
      if (dt) return `[data-testid="${dt}"]`;
      if (el.id && /^[a-zA-Z]/.test(el.id)) return `#${el.id}`;
      if (el.getAttribute('name'))         return `[name="${el.getAttribute('name')}"]`;
      if (el.getAttribute('aria-label'))   return `[aria-label="${el.getAttribute('aria-label')}"]`;
      if (el.getAttribute('placeholder'))  return `[placeholder="${el.getAttribute('placeholder')}"]`;
      const tag = el.tagName.toLowerCase();
      const cls = (typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 2).join('.');
      return tag + (cls ? '.' + cls : '');
    };
    const getLabel = (el) => {
      if (el.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) return (lbl.textContent || '').trim().slice(0, 80);
      }
      const wrapped = el.closest('label');
      if (wrapped) return (wrapped.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const prev = el.previousElementSibling;
      if (prev && prev.tagName === 'LABEL') return (prev.textContent || '').trim().slice(0, 80);
      return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '';
    };
    // Looser visibility: just skip display:none (hidden/opacity still often focusable)
    const isVisible = (el) => {
      if (!el.offsetParent && el.tagName !== 'BODY') return false;
      const s = window.getComputedStyle(el);
      return s.display !== 'none';
    };

    const inputs = [];
    document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])').forEach(el => {
      if (!isVisible(el)) return;
      inputs.push({
        selector:     getSelector(el),
        type:         el.type || 'text',
        label:        getLabel(el),
        placeholder:  el.placeholder || '',
        required:     el.required,
        maxLength:    el.maxLength > 0 && el.maxLength < 100000 ? el.maxLength : null,
        minLength:    el.minLength > 0 ? el.minLength : null,
        pattern:      el.getAttribute('pattern') || null,
        autocomplete: el.getAttribute('autocomplete') || el.getAttribute('name') || null,
        name:         el.getAttribute('name') || '',
      });
    });

    const selects = [];
    document.querySelectorAll('select').forEach(el => {
      if (!isVisible(el)) return;
      const options = Array.from(el.options).map(o => ({ value: o.value, text: (o.text || '').trim() })).filter(o => o.value).slice(0, 10);
      selects.push({ selector: getSelector(el), label: getLabel(el), options, name: el.getAttribute('name') || '' });
    });

    const textareas = [];
    document.querySelectorAll('textarea').forEach(el => {
      if (!isVisible(el)) return;
      textareas.push({ selector: getSelector(el), label: getLabel(el), placeholder: el.placeholder || '', name: el.getAttribute('name') || '' });
    });

    const buttons = [];
    document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]').forEach(el => {
      if (!isVisible(el)) return;
      const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!text) return;
      buttons.push({ selector: getSelector(el), text, type: el.getAttribute('type') || 'button' });
    });

    return { inputs, selects, textareas, buttons, title: document.title, url: window.location.href };
  }).catch(() => ({ inputs: [], selects: [], textareas: [], buttons: [], title: '', url: '' }));
}

// ── Playwright-locator fallback (works when page.evaluate returns nothing) ─
async function extractPageDOMFallback(page) {
  const inputs = [], selects = [], textareas = [], buttons = [];

  const safeAttr = async (loc, attr) => (await loc.getAttribute(attr).catch(() => null)) || '';
  const safeText = async (loc) => ((await loc.textContent().catch(() => null)) || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const safeVis  = async (loc) => loc.isVisible({ timeout: 400 }).catch(() => false);

  const buildSel = (id, name, ariaLabel, placeholder, tag, i) => {
    if (id && /^[a-zA-Z]/.test(id)) return `#${id}`;
    if (name)       return `[name="${name}"]`;
    if (ariaLabel)  return `[aria-label="${ariaLabel}"]`;
    if (placeholder) return `[placeholder="${placeholder}"]`;
    return `${tag} >> nth=${i}`;
  };

  // Inputs
  const inputLoc = page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])');
  const iCount   = await inputLoc.count().catch(() => 0);
  for (let i = 0; i < Math.min(iCount, 25); i++) {
    try {
      const el = inputLoc.nth(i);
      if (!await safeVis(el)) continue;
      const type        = await safeAttr(el, 'type') || 'text';
      const id          = await safeAttr(el, 'id');
      const name        = await safeAttr(el, 'name');
      const placeholder = await safeAttr(el, 'placeholder');
      const ariaLabel   = await safeAttr(el, 'aria-label');
      const autocomplete = await safeAttr(el, 'autocomplete') || name;
      const rawMax      = await safeAttr(el, 'maxlength');
      const maxLength   = rawMax && parseInt(rawMax) > 0 && parseInt(rawMax) < 100000 ? parseInt(rawMax) : null;
      const selector    = buildSel(id, name, ariaLabel, placeholder, 'input', i);
      inputs.push({ selector, type, name, label: ariaLabel || placeholder || name || id, placeholder, required: false, maxLength, autocomplete });
    } catch (_) {}
  }

  // Selects
  const selectLoc = page.locator('select');
  const sCount    = await selectLoc.count().catch(() => 0);
  for (let i = 0; i < Math.min(sCount, 10); i++) {
    try {
      const el   = selectLoc.nth(i);
      if (!await safeVis(el)) continue;
      const id   = await safeAttr(el, 'id');
      const name = await safeAttr(el, 'name');
      const al   = await safeAttr(el, 'aria-label');
      const opts = await el.evaluate(s => Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() })).filter(o => o.value).slice(0, 10)).catch(() => []);
      selects.push({ selector: buildSel(id, name, al, '', 'select', i), label: al || name || id, options: opts, name });
    } catch (_) {}
  }

  // Textareas
  const taLoc  = page.locator('textarea');
  const taCount = await taLoc.count().catch(() => 0);
  for (let i = 0; i < Math.min(taCount, 5); i++) {
    try {
      const el          = taLoc.nth(i);
      if (!await safeVis(el)) continue;
      const id          = await safeAttr(el, 'id');
      const name        = await safeAttr(el, 'name');
      const placeholder = await safeAttr(el, 'placeholder');
      const al          = await safeAttr(el, 'aria-label');
      textareas.push({ selector: buildSel(id, name, al, placeholder, 'textarea', i), label: al || placeholder || name || id, placeholder, name });
    } catch (_) {}
  }

  // Buttons
  const btnLoc = page.locator('button, input[type="submit"], input[type="button"], [role="button"]');
  const bCount = await btnLoc.count().catch(() => 0);
  for (let i = 0; i < Math.min(bCount, 20); i++) {
    try {
      const el   = btnLoc.nth(i);
      if (!await safeVis(el)) continue;
      const text = await safeText(el) || await safeAttr(el, 'value') || await safeAttr(el, 'aria-label');
      if (!text) continue;
      const id   = await safeAttr(el, 'id');
      const type = await safeAttr(el, 'type') || 'button';
      const tag  = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => 'button');
      const cls  = await el.evaluate(e => [...e.classList].slice(0, 2).join('.')).catch(() => '');
      const selector = id && /^[a-zA-Z]/.test(id) ? `#${id}` : `${tag}${cls ? '.' + cls : ''} >> nth=${i}`;
      buttons.push({ selector, text, type });
    } catch (_) {}
  }

  return { inputs, selects, textareas, buttons, title: await page.title().catch(() => ''), url: page.url() };
}

// ── Try forms inside top-level iframes ─────────────────────────────────────
async function extractFromIframes(page) {
  const frames = page.frames().filter(f => f !== page.mainFrame());
  for (const frame of frames.slice(0, 5)) {
    try {
      const result = await frame.evaluate(() => {
        const isVis = (el) => { const s = window.getComputedStyle(el); return s.display !== 'none'; };
        const getS  = (el) => {
          if (el.id && /^[a-zA-Z]/.test(el.id)) return `#${el.id}`;
          if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
          if (el.getAttribute('placeholder')) return `[placeholder="${el.getAttribute('placeholder')}"]`;
          return el.tagName.toLowerCase();
        };
        const getL = (el) => el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '';
        const inputs = [], selects = [], textareas = [], buttons = [];
        document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset])').forEach(el => {
          if (!isVis(el)) return;
          inputs.push({ selector: getS(el), type: el.type||'text', label: getL(el), placeholder: el.placeholder||'', required: el.required, maxLength: el.maxLength>0&&el.maxLength<100000?el.maxLength:null, name: el.getAttribute('name')||'', autocomplete: el.getAttribute('autocomplete')||el.getAttribute('name')||'' });
        });
        document.querySelectorAll('select').forEach(el => {
          if (!isVis(el)) return;
          const options = Array.from(el.options).map(o=>({value:o.value,text:o.text.trim()})).filter(o=>o.value).slice(0,10);
          selects.push({ selector: getS(el), label: getL(el), options, name: el.getAttribute('name')||'' });
        });
        document.querySelectorAll('textarea').forEach(el => {
          if (!isVis(el)) return;
          textareas.push({ selector: getS(el), label: getL(el), placeholder: el.placeholder||'', name: el.getAttribute('name')||'' });
        });
        document.querySelectorAll('button, input[type=submit], [role=button]').forEach(el => {
          if (!isVis(el)) return;
          const text = (el.textContent||el.value||el.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,60);
          if (text) buttons.push({ selector: getS(el), text, type: el.getAttribute('type')||'button' });
        });
        return { inputs, selects, textareas, buttons };
      }).catch(() => null);
      if (result && (result.inputs.length > 0 || result.selects.length > 0)) {
        return { ...result, title: await frame.title().catch(() => ''), url: frame.url(), fromIframe: true };
      }
    } catch (_) {}
  }
  return null;
}

async function callClaude(apiKey, model, domData, url) {
  const domSummary = JSON.stringify({
    pageTitle: domData.title, url,
    inputs: domData.inputs,
    selects: domData.selects,
    textareas: domData.textareas,
    submitButtons: domData.buttons.filter(b =>
      b.type === 'submit' ||
      /submit|login|sign.?in|register|send|continue|next|ok|confirm/i.test(b.text)
    ).slice(0, 4),
    allButtons: domData.buttons.slice(0, 6),
  }, null, 2);

  const systemPrompt = `You are an expert QA test automation engineer. Analyze this web page's form structure and generate a comprehensive test plan.

Generate exactly 5 test scenarios:
1. "Valid Submission" (type: "valid") - Fill all fields with realistic correct data and submit
2. "Empty Required Fields" (type: "boundary_empty") - Leave fields empty, attempt submit
3. "Minimum Length Values" (type: "boundary_min") - Fill with single char / minimum boundary data
4. "Maximum Length Values" (type: "boundary_max") - Fill with very long strings near limits
5. "Invalid Format Data" (type: "invalid") - Use wrong formats (bad email, letters in number field, etc.)

For each test scenario, list actions using ONLY these types:
- "focus": focus an element (selector required)
- "fill": fill an input (selector + value required)  
- "select": select a dropdown option (selector + value required)
- "click": click a button or element (selector required)
- "wait": wait milliseconds (value = ms as string, e.g. "1000")
- "check_response": check if page changed after submit (no selector needed)

Rules:
- Use EXACT selectors from the DOM data — do not invent selectors
- For valid test: use realistic data (real email like "test.user@example.com", real name "John Smith", real phone "555-0100", passwords like "SecurePass123!")
- For boundary_min: use single character "a", "1", "a@b.co"  
- For boundary_max: use 200+ character strings for text, repeat a char pattern
- For invalid: bad email (no @), letters in number fields, future dates for DOB etc.
- Always end each scenario with a "wait" (1500ms) then "check_response"
- Skip submit if there is no visible submit button
- Return ONLY valid JSON, no markdown fences, no explanations

Exact JSON structure required:
{
  "tests": [
    {
      "name": "string",
      "type": "valid|boundary_empty|boundary_min|boundary_max|invalid",
      "description": "string",
      "actions": [
        { "type": "focus|fill|select|click|wait|check_response", "selector": "css_or_empty", "value": "string", "description": "string" }
      ]
    }
  ]
}`;

  // Detect provider from model name or key prefix
  const isOpenRouter = model.includes('/') || apiKey.startsWith('sk-or-');
  const isAnthropic  = !isOpenRouter && (apiKey.startsWith('sk-ant-') || model.startsWith('claude-'));

  let raw = '';

  if (isOpenRouter) {
    // ── OpenRouter (OpenAI-compatible) ──────────────────────
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://playwright-test-builder.replit.app',
        'X-Title': 'Playwright Test Builder',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `Page DOM:\n${domSummary}` },
        ],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 300)}`);
    }
    const data = await response.json();
    raw = (data.choices?.[0]?.message?.content ?? '').trim();

  } else if (isAnthropic) {
    // ── Anthropic direct ────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Page DOM:\n${domSummary}` }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
    }
    const data = await response.json();
    raw = (data.content?.[0]?.text ?? '').trim();

  } else {
    throw new Error('Cannot detect API provider. Use an OpenRouter key (sk-or-…) or Anthropic key (sk-ant-…), or pick a model like "anthropic/claude-sonnet-4-5".');
  }

  // Strip markdown fences if present
  raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    throw new Error('AI returned invalid JSON — try again');
  }
}

function makeLocator(page, selector) {
  if (!selector) return null;
  const s = selector.trim();
  // XPath selectors start with / or // — Playwright needs xpath= prefix
  if (s.startsWith('/') || s.startsWith('(')) {
    return page.locator(`xpath=${s}`).first();
  }
  // Text selectors
  if (s.startsWith('text=') || s.startsWith('has-text=')) {
    return page.locator(s).first();
  }
  return page.locator(s).first();
}

async function executeAIAction(page, action, send) {
  const timeout = 8000;
  if (action.description) {
    send('LOG', { level: 'info', message: `    ↳ ${action.description}` });
  }
  switch (action.type) {
    case 'focus': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await loc.focus({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(350);
      break;
    }
    case 'fill': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await loc.focus({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(250);
      await loc.fill(action.value || '', { timeout });
      await page.waitForTimeout(200);
      break;
    }
    case 'click': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      try { await loc.click({ timeout }); }
      catch { await loc.click({ force: true, timeout }); }
      break;
    }
    case 'select': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await loc.selectOption(action.value || '', { timeout }).catch(async () => {
        await loc.selectOption({ index: 1 }, { timeout }).catch(() => {});
      });
      break;
    }
    case 'wait': {
      const ms = parseInt(action.value || '1000');
      await page.waitForTimeout(isNaN(ms) ? 1000 : Math.min(ms, 5000));
      break;
    }
    case 'check_response': {
      await page.waitForTimeout(800);
      break;
    }
    default:
      await page.waitForTimeout(200);
  }
}

app.post('/api/ai-live-test', async (req, res) => {
  const { url, apiKey, model = 'claude-sonnet-4-5' } = req.body || {};
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }
  if (!apiKey) { res.status(400).json({ error: 'apiKey is required' }); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  const send = (type, payload) => {
    try { res.write(`data: ${JSON.stringify({ type, payload })}\n\n`); } catch (_) {}
  };

  let browser = null;
  let frameActive = false;
  let frameTimer = null;

  const startFrames = (page) => {
    frameActive = true;
    const loop = async () => {
      if (!frameActive) return;
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
        send('FRAME', { frameBase64: buf.toString('base64') });
      } catch (_) {}
      if (frameActive) frameTimer = setTimeout(loop, 80);
    };
    loop();
  };

  const stopFrames = () => {
    frameActive = false;
    if (frameTimer) { clearTimeout(frameTimer); frameTimer = null; }
  };

  try {
    send('LOG', { level: 'info', message: '🤖 Claude AI Live Tester starting…' });
    send('LOG', { level: 'info', message: `   Model: ${model}` });
    send('LOG', { level: 'info', message: `   Target: ${url}` });

    const launchOpts = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    };
    if (CHROMIUM_PATH) launchOpts.executablePath = CHROMIUM_PATH;

    browser = await chromium.launch(launchOpts);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    page.on('dialog', async (dialog) => {
      send('LOG', { level: 'info', message: `  📋 Auto-dismissed dialog: "${dialog.message().slice(0, 60)}"` });
      await dialog.dismiss().catch(() => {});
    });

    send('LOG', { level: 'success', message: '✓ Browser launched' });
    startFrames(page);

    send('LOG', { level: 'info', message: `\n🌐 Navigating to ${url}…` });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    send('LOG', { level: 'success', message: `✓ Page loaded: "${await page.title()}"` });

    send('LOG', { level: 'info', message: '\n🔍 Checking for overlays/popups…' });
    await dismissOverlays(page, send);

    // Extra wait for JS-heavy pages (React, Vue, Angular)
    send('LOG', { level: 'info', message: '\n⏳ Waiting for dynamic content…' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // Scroll down slightly to trigger lazy-rendered elements, then back up
    await page.evaluate(() => window.scrollBy(0, 300)).catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(300);

    send('LOG', { level: 'info', message: '\n🔬 Analyzing page structure…' });
    const dom = await extractPageDOM(page);
    send('LOG', { level: 'info', message: `   Found: ${dom.inputs.length} inputs · ${dom.selects.length} selects · ${dom.textareas.length} textareas · ${dom.buttons.length} buttons` });
    send('DOM_SUMMARY', { inputs: dom.inputs.length, selects: dom.selects.length, textareas: dom.textareas.length, buttons: dom.buttons.length });

    send('LOG', { level: 'info', message: `\n🧠 Sending to Claude (${model}) for analysis…` });
    const plan = await callClaude(apiKey, model, dom, url);
    const tests = plan.tests || [];
    send('LOG', { level: 'success', message: `✓ Claude generated ${tests.length} test scenario(s)` });
    send('TEST_PLAN', { tests: tests.map((t, i) => ({ index: i, name: t.name, type: t.type, description: t.description, status: 'pending' })) });

    let passed = 0, failed = 0;

    for (let ti = 0; ti < tests.length; ti++) {
      const test = tests[ti];
      send('LOG', { level: 'step', message: `\n━━ Scenario ${ti + 1}/${tests.length}: ${test.name} ━━` });
      send('TEST_STATUS', { index: ti, status: 'running' });

      try {
        const curUrl = page.url();
        if (ti > 0 && curUrl !== url) {
          send('LOG', { level: 'info', message: `  ↺ Returning to ${url}…` });
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(1500);
          await dismissOverlays(page, send);
        }

        for (const action of (test.actions || [])) {
          await executeAIAction(page, action, send);
        }

        send('LOG', { level: 'success', message: `  ✅ Passed` });
        send('TEST_STATUS', { index: ti, status: 'passed' });
        passed++;
      } catch (err) {
        const msg = (err.message || String(err)).split('\n')[0].slice(0, 120);
        send('LOG', { level: 'error', message: `  ❌ Failed: ${msg}` });
        send('TEST_STATUS', { index: ti, status: 'failed', error: msg });
        failed++;
      }
    }

    stopFrames();
    send('LOG', { level: passed === tests.length && tests.length > 0 ? 'success' : 'error',
      message: `\n🏁 Complete — ${passed} passed · ${failed} failed · ${tests.length} total` });
    send('COMPLETE', { passed, failed, total: tests.length });

  } catch (err) {
    stopFrames();
    const msg = (err.message || String(err)).split('\n')[0].slice(0, 200);
    send('LOG', { level: 'error', message: `\n💥 Fatal error: ${msg}` });
    send('COMPLETE', { passed: 0, failed: 0, total: 0, error: msg });
  } finally {
    stopFrames();
    if (browser) await browser.close().catch(() => {});
    res.end();
  }
});

// ── Smart Tester (no AI required) ────────────────────────────────────────

function detectFieldType(field) {
  const type = (field.type || '').toLowerCase();
  const combined = [field.name, field.label, field.placeholder, field.autocomplete]
    .join(' ').toLowerCase().replace(/[-_]/g, ' ');

  if (type === 'email' || /\bemail\b/.test(combined)) return 'email';
  if (type === 'password' || /password|passw/.test(combined)) return 'password';
  if (type === 'tel' || /phone|mobile|cell|\btel\b/.test(combined)) return 'phone';
  if (type === 'number' || /\bage\b|quantity|amount|\bcount\b|\bnum\b/.test(combined)) return 'number';
  if (type === 'url' || /\burl\b|website|\bsite\b/.test(combined)) return 'url';
  if (type === 'date' || /\bdate\b|birth|dob/.test(combined)) return 'date';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'radio') return 'radio';
  if (/\bname\b|first name|last name|full name|username/.test(combined)) return 'name';
  if (/address|street|city/.test(combined)) return 'address';
  if (/zip|postal/.test(combined)) return 'zip';
  if (/message|comment|description|feedback|note/.test(combined)) return 'message';
  if (/search|query|keyword/.test(combined)) return 'search';
  return 'text';
}

function getTestValues(fieldType, maxLength) {
  const max = (maxLength && maxLength > 0 && maxLength < 9999) ? maxLength : 255;
  const clamp = (n) => Math.min(n, max);

  const defs = {
    email: {
      valid:          'john.doe@testmail.example.com',
      boundary_min:   'a@b.co',
      boundary_max:   'a'.repeat(clamp(180)) + '@ex.com',
      invalid:        'not-an-email-address',
    },
    password: {
      valid:          'SecureP@ss123!',
      boundary_min:   'Ab1!',
      boundary_max:   'Aa1!' + 'x'.repeat(Math.max(0, clamp(120) - 4)),
      invalid:        '123',
    },
    phone: {
      valid:          '+1-555-010-0100',
      boundary_min:   '1',
      boundary_max:   '5'.repeat(clamp(20)),
      invalid:        'abc-xyz-efgh',
    },
    number: {
      valid:          '42',
      boundary_min:   '0',
      boundary_max:   '9'.repeat(Math.min(clamp(10), 9)),
      invalid:        'not-a-number',
    },
    url: {
      valid:          'https://example.com',
      boundary_min:   'x',
      boundary_max:   'https://' + 'a'.repeat(clamp(200)) + '.com',
      invalid:        'not a url',
    },
    date: {
      valid:          '2000-06-15',
      boundary_min:   '1900-01-01',
      boundary_max:   '2099-12-31',
      invalid:        '99/99/9999',
    },
    name: {
      valid:          'John Smith',
      boundary_min:   'A',
      boundary_max:   ('John ').repeat(Math.max(1, Math.floor(clamp(250) / 5))).trim(),
      invalid:        '12345!@#$%',
    },
    address: {
      valid:          '123 Main Street, Apt 4B',
      boundary_min:   'A',
      boundary_max:   ('123 Main St ').repeat(Math.max(1, Math.floor(clamp(240) / 12))).trim(),
      invalid:        '!@#$%^&*()',
    },
    zip: {
      valid:          '10001',
      boundary_min:   '1',
      boundary_max:   '1'.repeat(clamp(10)),
      invalid:        'ABCDE',
    },
    message: {
      valid:          'This is a test message sent for validation purposes. Please ignore.',
      boundary_min:   'A',
      boundary_max:   ('Test message. ').repeat(Math.max(1, Math.floor(clamp(900) / 14))).trim(),
      invalid:        ' ',
    },
    search: {
      valid:          'test search query',
      boundary_min:   'a',
      boundary_max:   'search '.repeat(Math.max(1, Math.floor(clamp(200) / 7))).trim(),
      invalid:        '<>',
    },
    text: {
      valid:          'TestValue',
      boundary_min:   'A',
      boundary_max:   'T'.repeat(clamp(250)),
      invalid:        ' ',
    },
  };
  return defs[fieldType] || defs.text;
}

function buildSmartScenarios(dom) {
  const SCENARIO_DEFS = [
    { name: 'Valid Submission',       type: 'valid',          valueKey: 'valid',        desc: 'Fill all fields with correct realistic data and submit' },
    { name: 'Empty Required Fields',  type: 'boundary_empty', valueKey: null,           desc: 'Leave all fields empty and attempt to submit' },
    { name: 'Minimum Boundary',       type: 'boundary_min',   valueKey: 'boundary_min', desc: 'Fill fields with minimum-length / smallest valid values' },
    { name: 'Maximum Boundary',       type: 'boundary_max',   valueKey: 'boundary_max', desc: 'Fill fields with maximum-length values near limits' },
    { name: 'Invalid Format Data',    type: 'invalid',        valueKey: 'invalid',      desc: 'Fill fields with wrong-format data to trigger validation' },
  ];

  const submitBtn = dom.buttons.find(b =>
    b.type === 'submit' ||
    /submit|login|sign.?in|register|send|continue|save|create|search|next|go|ok|confirm/i.test(b.text)
  ) || dom.buttons[dom.buttons.length - 1];

  return SCENARIO_DEFS.map(def => {
    const actions = [];

    for (const input of dom.inputs) {
      if (input.type === 'checkbox') {
        actions.push({ type: 'highlight_check', selector: input.selector, check: def.valueKey !== null, description: `${def.valueKey !== null ? 'Check' : 'Uncheck'} "${input.label || 'checkbox'}"` });
        continue;
      }
      if (input.type === 'radio') continue; // radios handled by click

      if (def.valueKey === null) {
        // Empty scenario: focus and highlight but don't fill
        actions.push({ type: 'highlight_only', selector: input.selector, description: `Focus "${input.label || input.placeholder || input.type}" (leave empty)` });
      } else {
        const fieldType = detectFieldType(input);
        const values    = getTestValues(fieldType, input.maxLength);
        const value     = values[def.valueKey] || values.valid;
        const shortVal  = value.length > 35 ? value.slice(0, 32) + '…' : value;
        actions.push({ type: 'highlight_fill', selector: input.selector, value, description: `"${input.label || input.placeholder || fieldType}" → "${shortVal}"` });
      }
    }

    for (const sel of dom.selects) {
      if (def.valueKey === null) {
        actions.push({ type: 'highlight_only', selector: sel.selector, description: `Focus "${sel.label || 'select'}" (leave default)` });
      } else {
        const optIdx = def.type === 'boundary_max' || def.type === 'invalid' ? (sel.options.length - 1) : 0;
        const opt    = sel.options[optIdx];
        if (opt) actions.push({ type: 'highlight_select', selector: sel.selector, value: opt.value, description: `Select "${sel.label || 'dropdown'}" → "${opt.text || opt.value}"` });
      }
    }

    for (const ta of dom.textareas) {
      if (def.valueKey === null) {
        actions.push({ type: 'highlight_only', selector: ta.selector, description: `Focus "${ta.label || 'textarea'}" (leave empty)` });
      } else {
        const values = getTestValues('message', null);
        const value  = values[def.valueKey] || values.valid;
        const shortVal = value.length > 35 ? value.slice(0, 32) + '…' : value;
        actions.push({ type: 'highlight_fill', selector: ta.selector, value, description: `Textarea "${ta.label || 'message'}" → "${shortVal}"` });
      }
    }

    if (submitBtn) {
      actions.push({ type: 'highlight_click', selector: submitBtn.selector, color: '#34d399', description: `Click "${submitBtn.text}"` });
    }

    actions.push({ type: 'check_result', description: 'Read page response' });

    return { name: def.name, type: def.type, description: def.desc, actions };
  });
}

async function hlEl(page, selector, color = '#818cf8') {
  await page.evaluate(({ sel, col }) => {
    let el;
    try {
      el = sel.startsWith('/') || sel.startsWith('(')
        ? document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
        : document.querySelector(sel);
    } catch (_) { return; }
    if (!el) return;
    el.dataset.stPrevOutline    = el.style.outline    || '';
    el.dataset.stPrevShadow     = el.style.boxShadow  || '';
    el.dataset.stPrevTransition = el.style.transition || '';
    el.style.transition  = 'outline 0.15s, box-shadow 0.15s';
    el.style.outline     = `3px solid ${col}`;
    el.style.boxShadow   = `0 0 0 5px ${col}33, 0 0 20px ${col}66`;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, { sel: selector, col: color }).catch(() => {});
}

async function unhlEl(page, selector) {
  await page.evaluate((sel) => {
    let el;
    try {
      el = sel.startsWith('/') || sel.startsWith('(')
        ? document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
        : document.querySelector(sel);
    } catch (_) { return; }
    if (!el) return;
    el.style.outline    = el.dataset.stPrevOutline    || '';
    el.style.boxShadow  = el.dataset.stPrevShadow     || '';
    el.style.transition = el.dataset.stPrevTransition || '';
  }, selector).catch(() => {});
}

async function executeSmartAction(page, action, send) {
  const T = 8000;
  send('LOG', { level: 'info', message: `    ↳ ${action.description}` });

  switch (action.type) {
    case 'highlight_only': {
      if (!action.selector) break;
      await hlEl(page, action.selector, '#64748b');
      await page.waitForTimeout(550);
      await unhlEl(page, action.selector);
      break;
    }
    case 'highlight_fill': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await hlEl(page, action.selector, '#818cf8');
      await page.waitForTimeout(350);
      await loc.focus({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(200);
      // Clear first then fill so old content is replaced
      await loc.fill('', { timeout: T }).catch(() => {});
      await loc.fill(action.value || '', { timeout: T });
      await page.waitForTimeout(250);
      await unhlEl(page, action.selector);
      break;
    }
    case 'highlight_select': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await hlEl(page, action.selector, '#f59e0b');
      await page.waitForTimeout(300);
      await loc.selectOption(action.value || '', { timeout: T }).catch(async () => {
        await loc.selectOption({ index: 1 }, { timeout: T }).catch(() => {});
      });
      await page.waitForTimeout(250);
      await unhlEl(page, action.selector);
      break;
    }
    case 'highlight_check': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await hlEl(page, action.selector, '#34d399');
      await page.waitForTimeout(300);
      if (action.check) {
        await loc.check({ timeout: T }).catch(() => {});
      } else {
        await loc.uncheck({ timeout: T }).catch(() => {});
      }
      await page.waitForTimeout(200);
      await unhlEl(page, action.selector);
      break;
    }
    case 'highlight_click': {
      if (!action.selector) break;
      const loc = makeLocator(page, action.selector);
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await hlEl(page, action.selector, action.color || '#818cf8');
      await page.waitForTimeout(450);
      await unhlEl(page, action.selector);
      try { await loc.click({ timeout: T }); }
      catch { await loc.click({ force: true, timeout: T }); }
      break;
    }
    case 'check_result': {
      await page.waitForTimeout(1800);
      const info = await page.evaluate(() => {
        const text = (s) => { try { const e = document.querySelector(s); return e ? e.textContent.trim().slice(0, 80) : ''; } catch { return ''; } };
        const has  = (s) => { try { const e = document.querySelector(s); return !!(e && e.offsetParent !== null); } catch { return false; } };
        const successMsg = text('[class*="success"],[class*="thank"],[role="alert"],[class*="alert"]');
        const hasSuccess = has('[class*="success"],[class*="thank-you"]');
        const hasError   = has('[class*="error"],[aria-invalid="true"],[class*="invalid"],[class*="alert-danger"]');
        return { successMsg, hasSuccess, hasError, url: window.location.href, title: document.title };
      }).catch(() => ({ hasSuccess: false, hasError: false, url: '', title: '' }));

      if (info.hasSuccess) {
        send('LOG', { level: 'success', message: `    ✅ Success — page shows confirmation${info.successMsg ? ': "' + info.successMsg + '"' : ''}` });
      } else if (info.hasError) {
        send('LOG', { level: 'warn',    message: `    ⚠  Validation errors shown (expected for boundary/invalid tests)` });
      } else {
        send('LOG', { level: 'info',    message: `    ℹ  Page responded — no explicit success/error element detected` });
      }
      break;
    }
    default:
      await page.waitForTimeout(200);
  }
}

app.post('/api/smart-test', async (req, res) => {
  const { url } = req.body || {};
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  const send = (type, payload) => {
    try { res.write(`data: ${JSON.stringify({ type, payload })}\n\n`); } catch (_) {}
  };

  let browser   = null;
  let frameOn   = false;
  let frameTimer = null;

  const startFrames = (page) => {
    frameOn = true;
    const loop = async () => {
      if (!frameOn) return;
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
        send('FRAME', { frameBase64: buf.toString('base64') });
      } catch (_) {}
      if (frameOn) frameTimer = setTimeout(loop, 75);
    };
    loop();
  };

  const stopFrames = () => {
    frameOn = false;
    if (frameTimer) { clearTimeout(frameTimer); frameTimer = null; }
  };

  try {
    send('LOG', { level: 'info', message: '🔬 Smart Tester — no API key required' });
    send('LOG', { level: 'info', message: `   Target: ${url}` });

    const launchOpts = {
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--allow-running-insecure-content',
        '--disable-web-security',
        '--lang=en-US,en',
        '--window-size=1280,720',
      ],
    };
    if (CHROMIUM_PATH) launchOpts.executablePath = CHROMIUM_PATH;

    browser = await chromium.launch(launchOpts);
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      acceptDownloads: false,
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });

    // ── Stealth: spoof automation signals before any page script runs ───────
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
      const origQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
      if (origQuery) {
        window.navigator.permissions.query = (p) =>
          p.name === 'notifications' ? Promise.resolve({ state: 'denied' }) : origQuery(p);
      }
    });

    const page = await ctx.newPage();

    // Auto-dismiss JS dialogs
    page.on('dialog', async (d) => {
      send('LOG', { level: 'info', message: `  📋 Auto-dismissed dialog: "${d.message().slice(0, 60)}"` });
      await d.dismiss().catch(() => {});
    });

    // Block heavy assets that slow things down and aren't needed for form detection
    await page.route('**/*.{mp4,webm,ogg,wav,mp3,flac,avi,mov,woff,woff2,ttf,otf,eot}', r => r.abort()).catch(() => {});

    send('LOG', { level: 'success', message: '✓ Browser launched (stealth mode)' });
    startFrames(page);

    // ── Navigate ──────────────────────────────────────────────────────────
    send('LOG', { level: 'info', message: `\n🌐 Navigating to ${url}…` });
    let navOk = false;
    for (const strategy of ['domcontentloaded', 'load', 'commit']) {
      try {
        await page.goto(url, { waitUntil: strategy, timeout: 30000 });
        navOk = true;
        break;
      } catch (e) {
        send('LOG', { level: 'warn', message: `  ↻ Retrying navigation (${e.message.split('\n')[0].slice(0, 60)})` });
      }
    }
    if (!navOk) throw new Error('Could not navigate to the page after 3 attempts');

    await page.waitForTimeout(2000);
    const pageTitle = await page.title().catch(() => '');
    send('LOG', { level: 'success', message: `✓ Loaded: "${pageTitle || url}"` });

    // ── Overlay dismissal ─────────────────────────────────────────────────
    send('LOG', { level: 'info', message: '\n🧹 Dismissing popups & overlays…' });
    await dismissOverlays(page, send);

    // ── Wait for dynamic content (SPAs / lazy forms) ──────────────────────
    send('LOG', { level: 'info', message: '\n⏳ Waiting for dynamic content…' });
    // Try networkidle but don't block on it (SPAs often never reach networkidle)
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Progressive scroll to trigger lazy-loaded form fields
    for (const pct of [0.25, 0.5, 0.75, 0]) {
      await page.evaluate((p) => window.scrollTo(0, document.body.scrollHeight * p), pct).catch(() => {});
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(400);

    // ── DOM Extraction — 4-strategy cascade ───────────────────────────────
    send('LOG', { level: 'info', message: '\n🔬 Analyzing form fields…' });
    let dom = await extractPageDOM(page);
    let domSource = 'main-frame evaluate';

    const hasFields = (d) => d && (d.inputs.length > 0 || d.selects.length > 0 || d.textareas.length > 0);

    // Strategy 2: scroll more and retry page.evaluate
    if (!hasFields(dom)) {
      send('LOG', { level: 'info', message: '  ↻ Scrolling deeper and retrying…' });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await page.waitForTimeout(400);
      dom = await extractPageDOM(page);
      domSource = 'main-frame evaluate (retry)';
    }

    // Strategy 3: Playwright locator API (works through shadow DOM, custom elements)
    if (!hasFields(dom)) {
      send('LOG', { level: 'info', message: '  ↻ Trying locator-based extraction (shadow DOM / custom elements)…' });
      dom = await extractPageDOMFallback(page);
      domSource = 'playwright locator API';
    }

    // Strategy 4: search inside iframes
    if (!hasFields(dom)) {
      send('LOG', { level: 'info', message: '  ↻ Checking embedded iframes…' });
      const iframeDom = await extractFromIframes(page);
      if (iframeDom && hasFields(iframeDom)) {
        dom = iframeDom;
        domSource = `iframe (${iframeDom.url})`;
      }
    }

    send('LOG', { level: hasFields(dom) ? 'success' : 'warn',
      message: `   [${domSource}] ${dom.inputs.length} inputs · ${dom.selects.length} selects · ${dom.textareas.length} textareas · ${dom.buttons.length} buttons` });
    send('DOM_SUMMARY', { inputs: dom.inputs.length, selects: dom.selects.length, textareas: dom.textareas.length, buttons: dom.buttons.length });

    if (!hasFields(dom)) {
      send('LOG', { level: 'warn', message: '\n  ⚠ No fillable form fields found — possible reasons:' });
      send('LOG', { level: 'info', message: '     • Page uses bot/CAPTCHA protection (Cloudflare, reCAPTCHA)' });
      send('LOG', { level: 'info', message: '     • Form renders only after user interaction (click a button first?)' });
      send('LOG', { level: 'info', message: '     • Page requires login before showing a form' });
      send('LOG', { level: 'info', message: '     • Try a direct link to a login/signup/contact form page' });
      send('COMPLETE', { passed: 0, failed: 0, total: 0 });
      return;
    }

    send('LOG', { level: 'info', message: '\n📋 Building test scenarios…' });
    const scenarios = buildSmartScenarios(dom);
    send('LOG', { level: 'success', message: `✓ ${scenarios.length} scenarios ready` });
    send('TEST_PLAN', { tests: scenarios.map((s, i) => ({ index: i, name: s.name, type: s.type, description: s.description, status: 'pending' })) });

    let passed = 0, failed = 0;

    for (let ti = 0; ti < scenarios.length; ti++) {
      const scenario = scenarios[ti];
      send('LOG', { level: 'step', message: `\n━━ ${ti + 1}/${scenarios.length}: ${scenario.name} ━━` });
      send('TEST_STATUS', { index: ti, status: 'running' });

      try {
        // Reset page between scenarios
        if (ti > 0) {
          send('LOG', { level: 'info', message: `  ↺ Resetting page…` });
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(1200);
          await dismissOverlays(page, send);
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(500);
        }

        for (const action of scenario.actions) {
          await executeSmartAction(page, action, send);
        }

        send('LOG', { level: 'success', message: `  ✅ Scenario complete` });
        send('TEST_STATUS', { index: ti, status: 'passed' });
        passed++;
      } catch (err) {
        const msg = (err.message || String(err)).split('\n')[0].slice(0, 120);
        send('LOG', { level: 'error', message: `  ❌ Failed: ${msg}` });
        send('TEST_STATUS', { index: ti, status: 'failed', error: msg });
        failed++;
      }
    }

    stopFrames();
    send('LOG', { level: passed === scenarios.length ? 'success' : 'warn',
      message: `\n🏁 Done — ${passed} passed · ${failed} failed · ${scenarios.length} total` });
    send('COMPLETE', { passed, failed, total: scenarios.length });

  } catch (err) {
    stopFrames();
    const msg = (err.message || String(err)).split('\n')[0].slice(0, 200);
    send('LOG', { level: 'error', message: `\n💥 Error: ${msg}` });
    send('COMPLETE', { passed: 0, failed: 0, total: 0, error: msg });
  } finally {
    stopFrames();
    if (browser) await browser.close().catch(() => {});
    res.end();
  }
});

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

function smartFieldValue(el) {
  const t = (el.type || '').toLowerCase();
  const n = (el.name || el.placeholder || el.ariaLabel || '').toLowerCase();
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
  if (el.category === 'textarea')                                           return 'This is a test message for automated testing.';
  return 'Test Value';
}

function detectPageType(elements, pageTitle) {
  const inputs   = elements.filter(e => e.category === 'input' || e.category === 'textarea');
  const titleLow = (pageTitle || '').toLowerCase();
  const allText  = elements.map(e => (e.text || '')).join(' ').toLowerCase();

  const passwordFields = inputs.filter(e => e.type === 'password');
  const hasConfirmPwd  = inputs.some(e => {
    const n = (e.name || e.placeholder || e.ariaLabel || '').toLowerCase();
    return n.includes('confirm') || n.includes('repeat') || n.includes('re-enter') || n.includes('verify');
  });
  const searchFields = inputs.filter(e => {
    const n = (e.name || e.placeholder || e.ariaLabel || '').toLowerCase();
    return e.type === 'search' || n.includes('search') || n.includes('query') || n.includes('find');
  });
  const hasContactFields = inputs.some(e => {
    const n = (e.name || e.placeholder || e.ariaLabel || '').toLowerCase();
    return n.includes('message') || n.includes('subject') || n.includes('comment');
  });
  const hasPriceIndicators = allText.match(/add to cart|buy now|checkout|add to bag|purchase/);

  if ((passwordFields.length > 0 && hasConfirmPwd) || titleLow.match(/register|sign.?up|create.?account/)) return 'signup';
  if (passwordFields.length > 0 || titleLow.match(/login|log.?in|sign.?in|password|authentication/))       return 'login';
  if (hasPriceIndicators || titleLow.match(/\bcart\b|\bshop\b|\bstore\b|\bproduct\b|\bcheckout\b/))        return 'ecommerce';
  if (searchFields.length > 0 && inputs.length <= 3)                                                       return 'search';
  if (hasContactFields && inputs.length > 0)                                                               return 'contact';
  if (inputs.length === 0 && elements.filter(e => e.category === 'button').length > 2)                     return 'dashboard';
  return 'general';
}

function generateStepsForPage({ pageType, url, pageTitle, inputs, buttons, selects, checkboxes, links, textareas }) {
  const steps = [];

  // Always start: visit + wait + screenshot + assert
  steps.push(mkStep('visit',      `Visit: ${url}`,                  { url, comment: `Open the ${pageType} page` }));
  steps.push(mkStep('wait',       'Wait: Page ready',               { value: '1500', comment: 'Wait for full page load' }));
  steps.push(mkStep('screenshot', 'Screenshot: Initial state',      { comment: 'Capture initial page state' }));
  if (pageTitle) {
    steps.push(mkStep('assert', `Assert: Page title "${pageTitle}"`, { assertType: 'title', assertExpected: pageTitle, comment: 'Verify correct page loaded' }));
  }

  switch (pageType) {

    case 'login': {
      const userField  = inputs.find(e => { const n=(e.name||e.placeholder||e.ariaLabel||'').toLowerCase(); return e.type==='email'||n.includes('email')||n.includes('user')||n.includes('login')||n.includes('identifier'); });
      const pwdField   = inputs.find(e => e.type === 'password');
      const submitBtn  = buttons.find(e => ['login','log in','sign in','submit','continue','enter'].some(kw => (e.text||'').toLowerCase().includes(kw)));
      const rememberMe = checkboxes.find(e => (e.text||e.ariaLabel||'').toLowerCase().includes('remember'));

      if (userField)   steps.push(mkStep('fill',  `Fill: ${userField.placeholder||userField.name||'Email/Username'}`, { selector: userField.selector, value: 'test@example.com', comment: 'Enter valid login credential' }));
      if (pwdField)    steps.push(mkStep('fill',  'Fill: Password',                                                    { selector: pwdField.selector,  value: 'TestPass123!',     comment: 'Enter password' }));
      if (rememberMe)  steps.push(mkStep('check', 'Check: Remember me',                                                { selector: rememberMe.selector, comment: 'Check remember me option' }));
      steps.push(mkStep('screenshot', 'Screenshot: Before submit', { comment: 'Capture filled form' }));
      if (submitBtn)   steps.push(mkStep('click', `Click: ${submitBtn.text||'Login button'}`,                          { selector: submitBtn.selector, comment: 'Submit login form' }));
      else             steps.push(mkStep('press', 'Press: Enter to submit',                                            { key: 'Enter', pressTarget: 'keyboard', comment: 'Submit with Enter key' }));
      steps.push(mkStep('wait',       'Wait: 2s for auth response',    { value: '2000', comment: 'Wait for authentication' }));
      steps.push(mkStep('screenshot', 'Screenshot: After login',        { comment: 'Capture post-login state' }));

      // Empty field test
      steps.push(mkStep('visit', `Visit: ${url}`, { url, comment: 'Re-visit for empty field validation test' }));
      if (submitBtn)   steps.push(mkStep('click', `Click: ${submitBtn.text||'Submit'} (empty fields)`, { selector: submitBtn.selector, comment: 'Submit empty — expect validation errors' }));
      else             steps.push(mkStep('press', 'Press: Enter (empty)', { key: 'Enter', pressTarget: 'keyboard' }));
      steps.push(mkStep('screenshot', 'Screenshot: Empty field validation', { comment: 'Verify validation error messages shown' }));

      // Invalid credentials test
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
      const emailField = inputs.find(e => e.type==='email' || (e.name||e.placeholder||'').toLowerCase().includes('email'));
      const nameField  = inputs.find(e => { const n=(e.name||e.placeholder||e.ariaLabel||'').toLowerCase(); return n.includes('name') && !n.includes('user') && e.type!=='password'; });
      const submitBtn  = buttons.find(e => ['register','sign up','signup','create','join','submit'].some(kw => (e.text||'').toLowerCase().includes(kw)));
      const terms      = checkboxes.find(e => (e.text||e.ariaLabel||'').toLowerCase().match(/term|agree|consent/));

      if (nameField)   steps.push(mkStep('fill', `Fill: ${nameField.placeholder||nameField.name||'Full Name'}`, { selector: nameField.selector, value: 'John Doe', comment: 'Enter full name' }));
      inputs.filter(e => e !== nameField && e !== emailField && e.type !== 'password').forEach(e => {
        steps.push(mkStep('fill', `Fill: ${e.placeholder||e.name||e.ariaLabel||'Field'}`, { selector: e.selector, value: smartFieldValue(e), comment: `Fill field: ${e.name||e.placeholder||'input'}` }));
      });
      if (emailField)  steps.push(mkStep('fill', `Fill: ${emailField.placeholder||'Email'}`, { selector: emailField.selector, value: 'newuser@example.com', comment: 'Enter email address' }));
      if (pwdFields[0]) steps.push(mkStep('fill', 'Fill: Password',         { selector: pwdFields[0].selector, value: 'SecurePass123!', comment: 'Enter password' }));
      if (pwdFields[1]) steps.push(mkStep('fill', 'Fill: Confirm Password', { selector: pwdFields[1].selector, value: 'SecurePass123!', comment: 'Confirm password matches' }));
      selects.forEach(e => steps.push(mkStep('select', `Select: ${e.name||e.ariaLabel||'Dropdown'}`, { selector: e.selector, value: '', comment: 'Select option from dropdown' })));
      if (terms)       steps.push(mkStep('check', 'Check: Terms & Conditions', { selector: terms.selector, comment: 'Accept terms and conditions' }));
      steps.push(mkStep('screenshot', 'Screenshot: Before register', {}));
      if (submitBtn)   steps.push(mkStep('click', `Click: ${submitBtn.text||'Register'}`, { selector: submitBtn.selector, comment: 'Submit registration form' }));
      steps.push(mkStep('wait', 'Wait: 2s', { value: '2000' }));
      steps.push(mkStep('screenshot', 'Screenshot: After signup', { comment: 'Verify success / redirect' }));
      break;
    }

    case 'search': {
      const searchField = inputs.find(e => e.type==='search' || (e.name||e.placeholder||e.ariaLabel||'').toLowerCase().match(/search|find|query|keyword/));
      const searchBtn   = buttons.find(e => (e.text||e.ariaLabel||'').toLowerCase().match(/search|find|^go$|submit/));
      if (searchField) {
        steps.push(mkStep('fill', `Fill: "${smartFieldValue(searchField)}" in search box`, { selector: searchField.selector, value: smartFieldValue(searchField), comment: 'Enter search query' }));
        if (searchBtn) steps.push(mkStep('click', `Click: ${searchBtn.text||'Search'}`,   { selector: searchBtn.selector, comment: 'Execute search' }));
        else           steps.push(mkStep('press', 'Press: Enter to search',                { key: 'Enter', pressTarget: 'keyboard', comment: 'Submit search with Enter' }));
        steps.push(mkStep('wait',       'Wait: 2s for results', { value: '2000', comment: 'Wait for search results to load' }));
        steps.push(mkStep('screenshot', 'Screenshot: Search results', { comment: 'Verify results are displayed' }));
        // Empty search
        steps.push(mkStep('visit', `Visit: ${url}`, { url, comment: 'Re-visit for empty search test' }));
        steps.push(mkStep('fill',  'Fill: (empty search field)', { selector: searchField.selector, value: '', comment: 'Clear search input' }));
        if (searchBtn) steps.push(mkStep('click', `Click: ${searchBtn.text||'Search'} (empty)`, { selector: searchBtn.selector }));
        steps.push(mkStep('screenshot', 'Screenshot: Empty search behaviour', {}));
      }
      break;
    }

    case 'contact': {
      [...inputs, ...textareas].slice(0, 12).forEach(e => {
        steps.push(mkStep('fill', `Fill: ${e.placeholder||e.name||e.ariaLabel||'Field'}`, { selector: e.selector, value: smartFieldValue(e), comment: `Fill: ${e.name||e.placeholder||'field'}` }));
      });
      selects.forEach(e   => steps.push(mkStep('select', `Select: ${e.name||e.ariaLabel||'Dropdown'}`,   { selector: e.selector, value: '', comment: 'Select an option' })));
      checkboxes.forEach(e => steps.push(mkStep('check', `Check: ${e.text||e.ariaLabel||'Checkbox'}`,    { selector: e.selector, comment: 'Check checkbox' })));
      steps.push(mkStep('screenshot', 'Screenshot: Form filled', {}));
      const submitBtn = buttons.find(e => ['send','submit','contact','message','post'].some(kw => (e.text||'').toLowerCase().includes(kw))) || buttons[0];
      if (submitBtn) steps.push(mkStep('click', `Click: ${submitBtn.text||'Submit'}`, { selector: submitBtn.selector, comment: 'Submit contact form' }));
      steps.push(mkStep('wait',       'Wait: 2s after submit', { value: '2000' }));
      steps.push(mkStep('screenshot', 'Screenshot: After submit', { comment: 'Verify success / confirmation message' }));
      break;
    }

    case 'ecommerce': {
      steps.push(mkStep('scroll', 'Scroll: Browse products', { scrollType: 'page', scrollY: 400, comment: 'Scroll to view products' }));
      steps.push(mkStep('screenshot', 'Screenshot: Products visible', {}));
      const cartBtn     = buttons.find(e => ['add to cart','add to bag','buy now','purchase'].some(kw => (e.text||'').toLowerCase().includes(kw)));
      const checkoutBtn = buttons.find(e => (e.text||'').toLowerCase().includes('checkout'));
      if (cartBtn) {
        steps.push(mkStep('click', `Click: ${cartBtn.text||'Add to Cart'}`, { selector: cartBtn.selector, comment: 'Add product to cart' }));
        steps.push(mkStep('wait', 'Wait: 1s', { value: '1000' }));
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
      steps.push(mkStep('scroll', 'Scroll: Browse dashboard', { scrollType: 'page', scrollY: 400, comment: 'Scroll to see full dashboard' }));
      steps.push(mkStep('screenshot', 'Screenshot: Dashboard content', {}));
      const clickableLinks = links.filter(l => l.text && l.text.length < 50 && !l.href?.startsWith('mailto') && !l.href?.startsWith('javascript')).slice(0, 3);
      clickableLinks.forEach(l => {
        steps.push(mkStep('click',      `Click: ${l.text}`,              { selector: l.selector, comment: `Navigate to: ${l.text}` }));
        steps.push(mkStep('wait',       'Wait: 1.5s',                    { value: '1500' }));
        steps.push(mkStep('screenshot', `Screenshot: ${l.text} section`, {}));
        steps.push(mkStep('goback',     'Go Back',                       { comment: 'Return to dashboard' }));
        steps.push(mkStep('wait',       'Wait: 1s',                      { value: '1000' }));
      });
      break;
    }

    default: { // general
      [...inputs, ...textareas].slice(0, 10).forEach(e => {
        steps.push(mkStep('fill', `Fill: ${e.placeholder||e.name||e.ariaLabel||'Input'}`, { selector: e.selector, value: smartFieldValue(e), comment: 'Fill input field' }));
      });
      selects.slice(0, 5).forEach(e    => steps.push(mkStep('select', `Select: ${e.name||e.ariaLabel||'Dropdown'}`, { selector: e.selector, value: '', comment: 'Select an option' })));
      checkboxes.slice(0, 3).forEach(e => steps.push(mkStep('check',  `Check: ${e.text||e.ariaLabel||'Checkbox'}`,  { selector: e.selector, comment: 'Check checkbox' })));
      if (inputs.length > 0 || textareas.length > 0) steps.push(mkStep('screenshot', 'Screenshot: Form filled', {}));
      const primaryBtns = buttons.filter(b => ['submit','send','save','apply','confirm','continue','next','subscribe','register','search','get started','learn more'].some(kw => (b.text||'').toLowerCase().includes(kw)));
      const targetBtn   = primaryBtns[0] || buttons[0];
      if (targetBtn) {
        steps.push(mkStep('click', `Click: ${targetBtn.text||'Button'}`, { selector: targetBtn.selector, comment: 'Click primary action button' }));
        steps.push(mkStep('wait',       'Wait: 2s after action', { value: '2000' }));
        steps.push(mkStep('screenshot', 'Screenshot: After action',    {}));
      }
      steps.push(mkStep('scroll', 'Scroll: Page down', { scrollType: 'page', scrollY: 500, comment: 'Scroll to see more content' }));
      steps.push(mkStep('screenshot', 'Screenshot: Scrolled view', {}));
      const navLinks = links.filter(l => l.text && l.text.length < 40 && l.href && !l.href.startsWith('javascript') && !l.href.startsWith('mailto') && !l.href.startsWith('#')).slice(0, 2);
      navLinks.forEach(l => {
        steps.push(mkStep('click',      `Click: ${l.text}`,              { selector: l.selector, comment: `Navigate: ${l.text}` }));
        steps.push(mkStep('wait',       'Wait: 1.5s',                    { value: '1500' }));
        steps.push(mkStep('screenshot', `Screenshot: ${l.text} page`,    {}));
        steps.push(mkStep('goback',     'Go Back',                       {}));
      });
      break;
    }
  }

  steps.push(mkStep('screenshot', 'Screenshot: Final state', { comment: 'Capture final page state' }));
  return steps;
}

// POST /api/generate-script  — analyze URL, detect page type, generate TestStep[]
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

    // Screenshot #1 — initial page
    const shot1 = await page.screenshot({ type: 'jpeg', quality: 75 }).catch(() => null);
    if (shot1) send('SCREENSHOT', { frameBase64: shot1.toString('base64') });

    send('PROGRESS', { message: '🔍 Extracting DOM elements…' });

    // Use the existing 4-strategy cascade
    let elements = await extractPageDOM(page);
    if (!elements || elements.length === 0) elements = await extractPageDOMFallback(page);

    const pageTitle = await page.title().catch(() => '');

    send('PROGRESS', { message: `📊 Found ${elements.length} elements — analyzing page structure…` });

    const inputs    = elements.filter(e => e.category === 'input');
    const textareas = elements.filter(e => e.category === 'textarea');
    const buttons   = elements.filter(e => e.category === 'button');
    const selects   = elements.filter(e => e.category === 'select');
    const checkboxes= elements.filter(e => e.category === 'checkbox' || e.category === 'radio');
    const links     = elements.filter(e => e.category === 'link');

    const pageType  = detectPageType(elements, pageTitle);

    send('PAGE_INFO', {
      pageType,
      pageTitle,
      elementCounts: { inputs: inputs.length + textareas.length, buttons: buttons.length, selects: selects.length, links: links.length },
    });

    send('PROGRESS', { message: `📋 Detected: "${pageType}" — generating test steps…` });

    const steps = generateStepsForPage({ pageType, url, pageTitle, inputs, buttons, selects, checkboxes, links, textareas });

    // Stream steps one by one for live animation
    for (const step of steps) {
      send('STEP_ADDED', { step });
      await page.waitForTimeout(80);
    }

    // Final screenshot
    const shot2 = await page.screenshot({ type: 'jpeg', quality: 75 }).catch(() => null);
    if (shot2) send('SCREENSHOT', { frameBase64: shot2.toString('base64') });

    send('COMPLETE', { steps, pageType, pageTitle, elementCounts: { inputs: inputs.length, buttons: buttons.length } });

  } catch (err) {
    send('ERROR', { message: err.message || String(err) });
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
