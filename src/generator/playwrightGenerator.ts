import { TestFlow, TestStep, GeneratorOptions } from '../types';
import { generateAssertionCode } from './assertionBuilder';

export function generatePlaywrightTest(flow: TestFlow, options: GeneratorOptions): string {
  const { includeComments, browserType, headless, slowMo, timeout, retries, screenshotOnFailure, videoOnFailure, useBoundaryValues } = options;
  const enabledSteps = flow.steps.filter(s => s.enabled);
  const safeName = flow.name.replace(/[^a-zA-Z0-9]/g, ' ').trim();
  const baseUrl = flow.baseUrl || 'https://example.com';

  const imports = `import { test, expect, Page, BrowserContext } from '@playwright/test';`;

  const configBlock = `
// ============================================================
// Test: ${flow.name}
// Description: ${flow.description}
// Generated: ${new Date().toISOString()}
// Base URL: ${flow.baseUrl}
// Tags: ${flow.tags.join(', ')}
// ============================================================

test.describe('${safeName}', () => {
  test.setTimeout(${timeout});
  ${retries > 0 ? `test.describe.configure({ retries: ${retries} });` : ''}
`;

  const playwrightConfig = `
// playwright.config.ts snippet (auto-generated reference)
/*
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: {
    browserName: '${browserType}',
    headless: ${headless},
    ${slowMo ? `slowMo: ${slowMo},` : ''}
    baseURL: '${flow.baseUrl}',
    ${screenshotOnFailure ? "screenshot: 'only-on-failure'," : ''}
    ${videoOnFailure ? "video: 'on-first-retry'," : ''}
  },
  retries: ${retries},
});
*/
`;

  const stepCodes = enabledSteps.map(step => generateStepCode(step, includeComments, useBoundaryValues, baseUrl)).join('\n');

  const testBody = `
  test('${safeName} - main flow', async ({ page, context }) => {
${stepCodes}
  });
});
`;

  return [imports, playwrightConfig, configBlock, testBody].join('\n');
}

function generateStepCode(step: TestStep, includeComments: boolean, useBoundaryValues: boolean, baseUrl: string): string {
  const comment = includeComments && step.comment ? `\n    // ${step.comment}` : '';
  const label = includeComments ? `\n    // Step: ${step.label} [${step.action}]` : '';
  const selector = step.selector ?? '';
  const value = step.value ?? '';
  const timeout = step.timeout ?? 5000;

  let code = '';

  switch (step.action) {
    case 'visit':
      code = `    await page.goto('${step.url ?? baseUrl}');`;
      break;

    case 'click':
      code = `    await page.click('${selector}', { timeout: ${timeout} });`;
      break;

    case 'dblclick':
      code = `    await page.dblclick('${selector}', { timeout: ${timeout} });`;
      break;

    case 'rightclick':
      code = `    await page.click('${selector}', { button: 'right', timeout: ${timeout} });`;
      break;

    case 'fill':
      if (useBoundaryValues && step.boundaryValues && step.boundaryValues.length > 0) {
        const tests = step.boundaryValues.map(bv =>
          `    // BVA [${bv.type}]: ${bv.label}\n    await page.fill('${selector}', '${String(bv.value).replace(/'/g, "\\'")}');\n    await page.waitForTimeout(300);`
        ).join('\n');
        code = tests;
      } else {
        code = `    await page.fill('${selector}', '${value.replace(/'/g, "\\'")}', { timeout: ${timeout} });`;
      }
      break;

    case 'type':
      code = `    await page.type('${selector}', '${value.replace(/'/g, "\\'")}', { delay: 50, timeout: ${timeout} });`;
      break;

    case 'clear':
      code = `    await page.fill('${selector}', '', { timeout: ${timeout} });`;
      break;

    case 'select':
      code = `    await page.selectOption('${selector}', '${value}', { timeout: ${timeout} });`;
      break;

    case 'check':
      code = `    await page.check('${selector}', { timeout: ${timeout} });`;
      break;

    case 'uncheck':
      code = `    await page.uncheck('${selector}', { timeout: ${timeout} });`;
      break;

    case 'hover':
      code = `    await page.hover('${selector}', { timeout: ${timeout} });`;
      break;

    case 'focus':
      code = `    await page.focus('${selector}', { timeout: ${timeout} });`;
      break;

    case 'blur':
      code = `    await page.locator('${selector}').blur();`;
      break;

    case 'press':
      code = `    await page.press('${selector}', '${step.key ?? 'Enter'}', { timeout: ${timeout} });`;
      break;

    case 'upload':
      code = `    await page.setInputFiles('${selector}', '${step.uploadPath ?? value}', { timeout: ${timeout} });`;
      break;

    case 'drag':
      code = `    await page.dragAndDrop('${selector}', '${step.dragTargetSelector ?? ''}', { timeout: ${timeout} });`;
      break;

    case 'scroll':
      code = `    await page.evaluate(() => window.scrollTo(${step.scrollX ?? 0}, ${step.scrollY ?? 0}));`;
      break;

    case 'wait':
      if (selector) {
        code = `    await page.waitForSelector('${selector}', { state: 'visible', timeout: ${timeout} });`;
      } else if (value && !isNaN(Number(value))) {
        code = `    await page.waitForTimeout(${value});`;
      } else {
        code = `    await page.waitForLoadState('networkidle', { timeout: ${timeout} });`;
      }
      break;

    case 'assert':
      code = `  ${generateAssertionCode(step)}`;
      break;

    case 'popup': {
      const popupAction = value || 'click';
      code = `    // Handle popup triggered by ${step.label}
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: ${timeout} }),
      page.${popupAction}('${selector}'),
    ]);
    await popup.waitForLoadState();
    // Perform actions on popup...
    // await popup.fill('#field', 'value');
    await popup.close();`;
      break;
    }

    case 'screenshot':
      code = `    await page.screenshot({ path: '${value || 'screenshot'}.png', fullPage: true });`;
      break;

    case 'evaluate':
      code = `    const result = await page.evaluate(() => {\n      ${step.evaluateScript ?? '// JS expression'}\n    });\n    console.log('Evaluate result:', result);`;
      break;

    case 'frame':
      code = `    const frame = page.frameLocator('${step.frameSelector ?? selector}');\n    await frame.locator('${value}').click({ timeout: ${timeout} });`;
      break;

    case 'newpage':
      code = `    const newPage = await context.newPage();\n    await newPage.goto('${step.url ?? ''}');`;
      break;

    case 'closepage':
      code = `    await page.close();`;
      break;

    case 'reload':
      code = `    await page.reload({ waitUntil: 'networkidle', timeout: ${timeout} });`;
      break;

    case 'goback':
      code = `    await page.goBack({ waitUntil: 'networkidle', timeout: ${timeout} });`;
      break;

    case 'goforward':
      code = `    await page.goForward({ waitUntil: 'networkidle', timeout: ${timeout} });`;
      break;

    case 'setviewport':
      code = `    await page.setViewportSize({ width: ${step.viewportWidth ?? 1280}, height: ${step.viewportHeight ?? 720} });`;
      break;

    case 'cookie':
      code = `    await context.addCookies([{ name: '${step.cookieName ?? 'session'}', value: '${step.cookieValue ?? value}', domain: 'localhost', path: '/' }]);`;
      break;

    case 'localstorage':
      code = `    await page.evaluate(() => localStorage.setItem('${step.storageKey ?? 'key'}', '${step.storageValue ?? value}'));`;
      break;

    case 'networkrequest':
      code = `    const [response] = await Promise.all([\n      page.waitForResponse(resp => resp.url().includes('${value}') && resp.status() === 200),\n      page.click('${selector}'),\n    ]);\n    console.log('Network response:', response.status());`;
      break;

    case 'mockresponse':
      code = `    await page.route('${step.mockUrl ?? value}', async route => {\n      await route.fulfill({\n        status: ${step.mockStatus ?? 200},\n        contentType: 'application/json',\n        body: JSON.stringify(${step.mockBody ?? '{}'}),\n      });\n    });`;
      break;

    default:
      code = `    // Unknown action: ${step.action}`;
  }

  return `${label}${comment}\n${code}`;
}

