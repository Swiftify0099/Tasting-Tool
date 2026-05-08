"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var PlaywrightRunner_1 = require("./src/PlaywrightRunner");
var flow = {
    id: 'test-flow',
    name: 'Test Flow',
    description: '',
    baseUrl: 'https://example.com',
    createdAt: '',
    updatedAt: '',
    tags: [],
    version: '1',
    steps: [
        { id: '1', action: 'visit', label: 'Visit', url: 'https://example.com', enabled: true },
        { id: '2', action: 'screenshot', label: 'Screenshot', enabled: true }
    ]
};
var runPassed = null;
var postMessage = function (type, payload) {
    console.log('MSG:', type, typeof payload === 'object' ? JSON.stringify(payload).substring(0, 100) : payload);
    if (type === 'TEST_RUN_COMPLETE' && payload && typeof payload === 'object' && 'passed' in payload) {
        runPassed = Boolean(payload.passed);
    }
};
var runner = new PlaywrightRunner_1.PlaywrightRunner(postMessage);
runner.run(flow, { headless: false }).then(function () {
    console.log('Done');
    process.exit(runPassed ? 0 : 1);
}).catch(function (e) {
    console.error(e);
    process.exit(1);
});
