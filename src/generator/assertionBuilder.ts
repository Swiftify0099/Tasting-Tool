import { TestStep, AssertType } from '../types';

export function generateAssertionCode(step: TestStep): string {
  const timeout = step.timeout ?? 5000;
  const selector = step.assertSelector ?? step.selector ?? '';
  const expected = step.assertExpected ?? '';

  switch (step.assertType as AssertType) {
    case 'url':
      if (expected.includes('*') || expected.includes('.')) {
        return `  await expect(page).toHaveURL(/${escapeRegex(expected)}/);`;
      }
      return `  await expect(page).toHaveURL('${expected}');`;

    case 'title':
      return `  await expect(page).toHaveTitle('${expected}');`;

    case 'text':
      return `  await expect(page.locator('${selector}')).toContainText('${expected}', { timeout: ${timeout} });`;

    case 'visibility':
      if (expected === 'hidden') {
        return `  await expect(page.locator('${selector}')).toBeHidden({ timeout: ${timeout} });`;
      }
      return `  await expect(page.locator('${selector}')).toBeVisible({ timeout: ${timeout} });`;

    case 'enabled':
      if (expected === 'disabled') {
        return `  await expect(page.locator('${selector}')).toBeDisabled({ timeout: ${timeout} });`;
      }
      return `  await expect(page.locator('${selector}')).toBeEnabled({ timeout: ${timeout} });`;

    case 'checked':
      if (expected === 'unchecked') {
        return `  await expect(page.locator('${selector}')).not.toBeChecked({ timeout: ${timeout} });`;
      }
      return `  await expect(page.locator('${selector}')).toBeChecked({ timeout: ${timeout} });`;

    case 'value':
      return `  await expect(page.locator('${selector}')).toHaveValue('${expected}', { timeout: ${timeout} });`;

    case 'attribute': {
      const [attrName, attrVal] = expected.split('=');
      return `  await expect(page.locator('${selector}')).toHaveAttribute('${attrName}', '${attrVal ?? ''}', { timeout: ${timeout} });`;
    }

    case 'count':
      return `  await expect(page.locator('${selector}')).toHaveCount(${parseInt(expected) || 0}, { timeout: ${timeout} });`;

    case 'screenshot':
      return `  await expect(page).toHaveScreenshot('${expected || 'snapshot'}.png');`;

    case 'network':
      return `  // Network assertion: verify response from ${expected}\n  const response = await page.waitForResponse('${expected}');\n  expect(response.status()).toBe(200);`;

    default:
      return `  // Assertion: ${step.assertType} on '${selector}'`;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
