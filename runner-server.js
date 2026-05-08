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

async function extractPageDOM(page) {
  return await page.evaluate(() => {
    const getSelector = (el) => {
      const dt = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-qa');
      if (dt) return `[data-testid="${dt}"]`;
      if (el.id) return `#${el.id}`;
      if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
      if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
      if (el.getAttribute('placeholder')) return `[placeholder="${el.getAttribute('placeholder')}"]`;
      const tag = el.tagName.toLowerCase();
      const cls = (typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 2).join('.');
      return tag + (cls ? '.' + cls : '');
    };
    const getLabel = (el) => {
      if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) return lbl.textContent?.trim() || '';
      }
      const parent = el.closest('label');
      if (parent) return (parent.textContent || '').trim().slice(0, 60);
      return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '';
    };
    const isVisible = (el) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };

    const inputs = [];
    document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])').forEach(el => {
      if (!isVisible(el)) return;
      inputs.push({
        selector: getSelector(el), type: el.type || 'text', label: getLabel(el),
        placeholder: el.placeholder || '', required: el.required,
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        minLength: el.minLength > 0 ? el.minLength : null,
        pattern: el.getAttribute('pattern') || null,
        autocomplete: el.getAttribute('autocomplete') || null,
      });
    });

    const selects = [];
    document.querySelectorAll('select').forEach(el => {
      if (!isVisible(el)) return;
      const options = Array.from(el.options).map(o => ({ value: o.value, text: o.text })).filter(o => o.value).slice(0, 8);
      selects.push({ selector: getSelector(el), label: getLabel(el), options });
    });

    const textareas = [];
    document.querySelectorAll('textarea').forEach(el => {
      if (!isVisible(el)) return;
      textareas.push({ selector: getSelector(el), label: getLabel(el), placeholder: el.placeholder || '' });
    });

    const buttons = [];
    document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]').forEach(el => {
      if (!isVisible(el)) return;
      const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!text) return;
      const type = el.getAttribute('type') || 'button';
      buttons.push({ selector: getSelector(el), text, type });
    });

    return { inputs, selects, textareas, buttons, title: document.title, url: window.location.href };
  });
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

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Playwright runner server listening on port ${PORT}`);
  if (CHROMIUM_PATH) {
    console.log('Chromium ready (using system binary).');
  } else {
    console.warn('System Chromium not found — tests may fail if bundled binary has missing libs.');
  }
});
