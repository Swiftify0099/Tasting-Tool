const { generatePlaywrightTest } = require('./dist/generator/playwrightGenerator');

const flow = {
  id: 'smoke',
  name: 'Smoke',
  description: '',
  baseUrl: 'https://example.com',
  createdAt: '',
  updatedAt: '',
  tags: [],
  version: '1',
  steps: [{ id: '1', action: 'visit', label: 'Visit', url: 'https://example.com', enabled: true }],
};

const options = {
  includeComments: true,
  browserType: 'chromium',
  headless: true,
  slowMo: 0,
  timeout: 30000,
  retries: 0,
  screenshotOnFailure: true,
  videoOnFailure: false,
  useBoundaryValues: false,
};

const code = generatePlaywrightTest(flow, options);
if (!code || !code.includes("test.describe('Smoke'")) {
  console.error('Smoke test failed: generated code missing expected describe declaration.');
  process.exit(1);
}

console.log('Smoke test passed.');
