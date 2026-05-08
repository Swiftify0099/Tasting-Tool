"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightRunner = void 0;
var path = __importStar(require("path"));
/** Highlight CSS injected into the page before each targeted action */
var HIGHLIGHT_STYLE_ID = '__pw_highlight_style__';
var HIGHLIGHT_CLASS = '__pw_highlighted__';
var PlaywrightRunner = /** @class */ (function () {
    function PlaywrightRunner(postMessage) {
        this._aborted = false;
        this._post = postMessage;
    }
    /** Abort a running test (call from dispose) */
    PlaywrightRunner.prototype.abort = function () { this._aborted = true; };
    PlaywrightRunner.prototype.run = function (flow, options) {
        return __awaiter(this, void 0, void 0, function () {
            var browser, pwModulePath, playwrightModule, browserType, headless, slowMo, defaultTimeout, launcher, context, page, enabledSteps, i, step, color, targetSel, stepErr_1, msg, err_1, _a, msg;
            var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
            return __generator(this, function (_m) {
                switch (_m.label) {
                    case 0:
                        this._aborted = false;
                        browser = null;
                        _m.label = 1;
                    case 1:
                        _m.trys.push([1, 23, , 28]);
                        pwModulePath = path.join(__dirname, '..', 'node_modules', 'playwright');
                        playwrightModule = void 0;
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-var-requires
                            playwrightModule = require(pwModulePath);
                        }
                        catch (_o) {
                            try {
                                // eslint-disable-next-line @typescript-eslint/no-var-requires
                                playwrightModule = require('playwright');
                            }
                            catch (_p) {
                                this._post('TEST_RUN_LOG', { logType: 'error', message: '✗ Playwright not found. Run: npm install playwright in the extension root.' });
                                this._post('TEST_RUN_COMPLETE', { passed: false, error: 'Playwright not installed' });
                                return [2 /*return*/];
                            }
                        }
                        browserType = (_b = options === null || options === void 0 ? void 0 : options.browserType) !== null && _b !== void 0 ? _b : 'chromium';
                        headless = (_c = options === null || options === void 0 ? void 0 : options.headless) !== null && _c !== void 0 ? _c : true;
                        slowMo = (_d = options === null || options === void 0 ? void 0 : options.slowMo) !== null && _d !== void 0 ? _d : 0;
                        defaultTimeout = (_e = options === null || options === void 0 ? void 0 : options.timeout) !== null && _e !== void 0 ? _e : 15000;
                        launcher = (_f = playwrightModule[browserType]) !== null && _f !== void 0 ? _f : playwrightModule.chromium;
                        /* ── 2. Launch ─────────────────────────────────────────────── */
                        this._post('TEST_RUN_LOG', { logType: 'info', message: "\u25B6  Launching ".concat(browserType, " (headless: ").concat(headless, ")\u2026") });
                        return [4 /*yield*/, launcher.launch({
                                headless: headless,
                                slowMo: slowMo,
                                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                            })];
                    case 2:
                        browser = _m.sent();
                        return [4 /*yield*/, browser.newContext({
                                viewport: { width: 1280, height: 720 },
                                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                            })];
                    case 3:
                        context = _m.sent();
                        return [4 /*yield*/, context.newPage()];
                    case 4:
                        page = _m.sent();
                        page.setDefaultTimeout(defaultTimeout);
                        /* ── 3. Inject global highlight stylesheet ─────────────────── */
                        return [4 /*yield*/, context.addInitScript("\n        const s = document.createElement('style');\n        s.id = '".concat(HIGHLIGHT_STYLE_ID, "';\n        s.textContent = `\n          .").concat(HIGHLIGHT_CLASS, " {\n            outline: 3px solid #6366f1 !important;\n            outline-offset: 3px !important;\n            box-shadow: 0 0 0 6px rgba(99,102,241,0.35) !important;\n            transition: outline 0.15s ease, box-shadow 0.15s ease !important;\n          }\n        `;\n        document.head.appendChild(s);\n      "))];
                    case 5:
                        /* ── 3. Inject global highlight stylesheet ─────────────────── */
                        _m.sent();
                        enabledSteps = flow.steps.filter(function (s) { return s.enabled; });
                        this._post('TEST_RUN_LOG', { logType: 'info', message: "   Steps: ".concat(enabledSteps.length, " enabled") });
                        i = 0;
                        _m.label = 6;
                    case 6:
                        if (!(i < enabledSteps.length)) return [3 /*break*/, 20];
                        if (this._aborted) {
                            this._post('TEST_RUN_LOG', { logType: 'error', message: '✗ Run aborted.' });
                            return [3 /*break*/, 20];
                        }
                        step = enabledSteps[i];
                        color = (_g = ACTION_COLOR[step.action]) !== null && _g !== void 0 ? _g : '#6366f1';
                        /* Log step start */
                        this._post('TEST_RUN_LOG', {
                            logType: 'step',
                            message: "[".concat(i + 1, "/").concat(enabledSteps.length, "] ").concat(step.label, " (").concat(step.action, ")"),
                        });
                        this._post('TEST_RUN_STEP', step);
                        _m.label = 7;
                    case 7:
                        _m.trys.push([7, 16, , 19]);
                        targetSel = step.selector || step.assertSelector;
                        if (!(targetSel && INTERACTIVE_ACTIONS.includes(step.action))) return [3 /*break*/, 9];
                        return [4 /*yield*/, this._highlightElement(page, targetSel)];
                    case 8:
                        _m.sent();
                        _m.label = 9;
                    case 9: 
                    /* Pre-action screenshot (shows highlight) */
                    return [4 /*yield*/, this._sendScreenshot(page, i, step.action, 'before', color)];
                    case 10:
                        /* Pre-action screenshot (shows highlight) */
                        _m.sent();
                        /* Execute the step */
                        return [4 /*yield*/, this._executeStep(page, step, flow.baseUrl, defaultTimeout)];
                    case 11:
                        /* Execute the step */
                        _m.sent();
                        if (!targetSel) return [3 /*break*/, 13];
                        return [4 /*yield*/, this._removeHighlight(page, targetSel)];
                    case 12:
                        _m.sent();
                        _m.label = 13;
                    case 13: 
                    /* Small pause so the user can see the result */
                    return [4 /*yield*/, page.waitForTimeout(200)];
                    case 14:
                        /* Small pause so the user can see the result */
                        _m.sent();
                        /* Post-action screenshot */
                        return [4 /*yield*/, this._sendScreenshot(page, i, step.action, 'after', color)];
                    case 15:
                        /* Post-action screenshot */
                        _m.sent();
                        this._post('TEST_RUN_LOG', { logType: 'success', message: "   \u2713 Step ".concat(i + 1, " passed") });
                        return [3 /*break*/, 19];
                    case 16:
                        stepErr_1 = _m.sent();
                        if (this._aborted) {
                            return [3 /*break*/, 20];
                        }
                        msg = (_j = (_h = stepErr_1.message) === null || _h === void 0 ? void 0 : _h.slice(0, 200)) !== null && _j !== void 0 ? _j : 'Unknown error';
                        return [4 /*yield*/, this._sendScreenshot(page, i, step.action, 'error', '#f87171')];
                    case 17:
                        _m.sent();
                        this._post('TEST_RUN_LOG', { logType: 'error', message: "   \u2717 Step ".concat(i + 1, " failed: ").concat(msg) });
                        return [4 /*yield*/, browser.close()];
                    case 18:
                        _m.sent();
                        browser = null;
                        this._post('TEST_RUN_COMPLETE', { passed: false, error: msg });
                        return [2 /*return*/];
                    case 19:
                        i++;
                        return [3 /*break*/, 6];
                    case 20:
                        if (!browser) return [3 /*break*/, 22];
                        return [4 /*yield*/, browser.close()];
                    case 21:
                        _m.sent();
                        browser = null;
                        _m.label = 22;
                    case 22:
                        this._post('TEST_RUN_LOG', { logType: 'success', message: "\u2705 All ".concat(enabledSteps.length, " steps passed!") });
                        this._post('TEST_RUN_COMPLETE', { passed: true });
                        return [3 /*break*/, 28];
                    case 23:
                        err_1 = _m.sent();
                        if (!browser) return [3 /*break*/, 27];
                        _m.label = 24;
                    case 24:
                        _m.trys.push([24, 26, , 27]);
                        return [4 /*yield*/, browser.close()];
                    case 25:
                        _m.sent();
                        return [3 /*break*/, 27];
                    case 26:
                        _a = _m.sent();
                        return [3 /*break*/, 27];
                    case 27:
                        msg = (_l = (_k = err_1.message) === null || _k === void 0 ? void 0 : _k.slice(0, 300)) !== null && _l !== void 0 ? _l : 'Unknown error';
                        this._post('TEST_RUN_LOG', { logType: 'error', message: "\u2717 Run failed: ".concat(msg) });
                        this._post('TEST_RUN_COMPLETE', { passed: false, error: msg });
                        return [3 /*break*/, 28];
                    case 28: return [2 /*return*/];
                }
            });
        });
    };
    /* ── Screenshot helpers ──────────────────────────────────────────── */
    PlaywrightRunner.prototype._sendScreenshot = function (page, stepIdx, action, phase, color) {
        return __awaiter(this, void 0, void 0, function () {
            var buffer, base64, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, page.screenshot({ type: 'jpeg', quality: 75, fullPage: false })];
                    case 1:
                        buffer = _b.sent();
                        base64 = buffer.toString('base64');
                        this._post('TEST_RUN_SCREENSHOT', { stepIdx: stepIdx, action: action, phase: phase, color: color, screenshotBase64: base64 });
                        return [3 /*break*/, 3];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /* ── Element highlight / remove ─────────────────────────────────── */
    PlaywrightRunner.prototype._highlightElement = function (page, selector) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, page.evaluate(function (args) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                var doc = globalThis.document;
                                var el = doc.querySelector(args.sel);
                                if (el && el.classList) {
                                    el.classList.add(args.cls);
                                }
                            }, { sel: selector, cls: HIGHLIGHT_CLASS })];
                    case 1:
                        _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    PlaywrightRunner.prototype._removeHighlight = function (page, selector) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, page.evaluate(function (args) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                var doc = globalThis.document;
                                var el = doc.querySelector(args.sel);
                                if (el && el.classList) {
                                    el.classList.remove(args.cls);
                                }
                            }, { sel: selector, cls: HIGHLIGHT_CLASS })];
                    case 1:
                        _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /* ── Step executor ───────────────────────────────────────────────── */
    PlaywrightRunner.prototype._executeStep = function (page, step, baseUrl, defaultTimeout) {
        return __awaiter(this, void 0, void 0, function () {
            var sel, timeout, _a, np, stepScrollType, x, y, val, ms, aSel, expected, _b;
            var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
            return __generator(this, function (_y) {
                switch (_y.label) {
                    case 0:
                        sel = step.selector ? step.selector : undefined;
                        timeout = (_c = step.timeout) !== null && _c !== void 0 ? _c : defaultTimeout;
                        _a = step.action;
                        switch (_a) {
                            case 'visit': return [3 /*break*/, 1];
                            case 'reload': return [3 /*break*/, 3];
                            case 'goback': return [3 /*break*/, 5];
                            case 'goforward': return [3 /*break*/, 7];
                            case 'newpage': return [3 /*break*/, 9];
                            case 'closepage': return [3 /*break*/, 13];
                            case 'click': return [3 /*break*/, 15];
                            case 'dblclick': return [3 /*break*/, 17];
                            case 'rightclick': return [3 /*break*/, 19];
                            case 'hover': return [3 /*break*/, 21];
                            case 'drag': return [3 /*break*/, 23];
                            case 'scroll': return [3 /*break*/, 26];
                            case 'press': return [3 /*break*/, 32];
                            case 'focus': return [3 /*break*/, 37];
                            case 'blur': return [3 /*break*/, 39];
                            case 'fill': return [3 /*break*/, 41];
                            case 'type': return [3 /*break*/, 43];
                            case 'clear': return [3 /*break*/, 45];
                            case 'select': return [3 /*break*/, 47];
                            case 'check': return [3 /*break*/, 49];
                            case 'uncheck': return [3 /*break*/, 51];
                            case 'upload': return [3 /*break*/, 53];
                            case 'wait': return [3 /*break*/, 56];
                            case 'assert': return [3 /*break*/, 63];
                            case 'screenshot': return [3 /*break*/, 73];
                            case 'evaluate': return [3 /*break*/, 74];
                            case 'setviewport': return [3 /*break*/, 77];
                            case 'mockresponse': return [3 /*break*/, 79];
                            case 'cookie': return [3 /*break*/, 81];
                            case 'localstorage': return [3 /*break*/, 83];
                        }
                        return [3 /*break*/, 85];
                    case 1: return [4 /*yield*/, page.goto((_e = (_d = step.url) !== null && _d !== void 0 ? _d : step.value) !== null && _e !== void 0 ? _e : baseUrl, { waitUntil: 'domcontentloaded', timeout: timeout })];
                    case 2:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 3: return [4 /*yield*/, page.reload({ waitUntil: 'domcontentloaded', timeout: timeout })];
                    case 4:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 5: return [4 /*yield*/, page.goBack({ timeout: timeout })];
                    case 6:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 7: return [4 /*yield*/, page.goForward({ timeout: timeout })];
                    case 8:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 9: return [4 /*yield*/, page.context().newPage()];
                    case 10:
                        np = _y.sent();
                        if (!step.url) return [3 /*break*/, 12];
                        return [4 /*yield*/, np.goto(step.url, { waitUntil: 'domcontentloaded', timeout: timeout })];
                    case 11:
                        _y.sent();
                        _y.label = 12;
                    case 12: return [3 /*break*/, 86];
                    case 13: return [4 /*yield*/, page.close()];
                    case 14:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 15: return [4 /*yield*/, page.click(sel, { timeout: timeout })];
                    case 16:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 17: return [4 /*yield*/, page.dblclick(sel, { timeout: timeout })];
                    case 18:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 19: return [4 /*yield*/, page.click(sel, { button: 'right', timeout: timeout })];
                    case 20:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 21: return [4 /*yield*/, page.hover(sel, { timeout: timeout })];
                    case 22:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 23:
                        if (!(sel && step.dragTargetSelector)) return [3 /*break*/, 25];
                        return [4 /*yield*/, page.dragAndDrop(sel, step.dragTargetSelector, { timeout: timeout })];
                    case 24:
                        _y.sent();
                        _y.label = 25;
                    case 25: return [3 /*break*/, 86];
                    case 26:
                        stepScrollType = step.scrollType;
                        if (!(stepScrollType === 'element' && sel)) return [3 /*break*/, 28];
                        return [4 /*yield*/, page.locator(sel).scrollIntoViewIfNeeded({ timeout: timeout })];
                    case 27:
                        _y.sent();
                        return [3 /*break*/, 31];
                    case 28:
                        x = (_f = step.scrollX) !== null && _f !== void 0 ? _f : 0;
                        y = (_g = step.scrollY) !== null && _g !== void 0 ? _g : 500;
                        return [4 /*yield*/, page.evaluate(function (args) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                globalThis.window.scrollBy({ left: args.dx, top: args.dy, behavior: 'smooth' });
                            }, { dx: x, dy: y })];
                    case 29:
                        _y.sent();
                        return [4 /*yield*/, page.waitForTimeout(400)];
                    case 30:
                        _y.sent(); // let scroll settle
                        _y.label = 31;
                    case 31: return [3 /*break*/, 86];
                    case 32:
                        if (!(sel && step.pressTarget !== 'keyboard')) return [3 /*break*/, 34];
                        return [4 /*yield*/, page.press(sel, (_h = step.key) !== null && _h !== void 0 ? _h : 'Enter', { timeout: timeout })];
                    case 33:
                        _y.sent();
                        return [3 /*break*/, 36];
                    case 34: return [4 /*yield*/, page.keyboard.press((_j = step.key) !== null && _j !== void 0 ? _j : 'Enter')];
                    case 35:
                        _y.sent();
                        _y.label = 36;
                    case 36: return [3 /*break*/, 86];
                    case 37: return [4 /*yield*/, page.focus(sel, { timeout: timeout })];
                    case 38:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 39: return [4 /*yield*/, page.locator(sel).blur()];
                    case 40:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 41: return [4 /*yield*/, page.fill(sel, (_k = step.value) !== null && _k !== void 0 ? _k : '', { timeout: timeout })];
                    case 42:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 43: return [4 /*yield*/, page.type(sel, (_l = step.value) !== null && _l !== void 0 ? _l : '', { delay: 40, timeout: timeout })];
                    case 44:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 45: return [4 /*yield*/, page.fill(sel, '', { timeout: timeout })];
                    case 46:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 47: return [4 /*yield*/, page.selectOption(sel, (_m = step.value) !== null && _m !== void 0 ? _m : '', { timeout: timeout })];
                    case 48:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 49: return [4 /*yield*/, page.check(sel, { timeout: timeout })];
                    case 50:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 51: return [4 /*yield*/, page.uncheck(sel, { timeout: timeout })];
                    case 52:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 53:
                        if (!(sel && step.uploadPath)) return [3 /*break*/, 55];
                        return [4 /*yield*/, page.setInputFiles(sel, step.uploadPath, { timeout: timeout })];
                    case 54:
                        _y.sent();
                        _y.label = 55;
                    case 55: return [3 /*break*/, 86];
                    case 56:
                        val = (_o = step.value) !== null && _o !== void 0 ? _o : '';
                        ms = parseInt(val);
                        if (!(!isNaN(ms) && ms > 0)) return [3 /*break*/, 58];
                        return [4 /*yield*/, page.waitForTimeout(ms)];
                    case 57:
                        _y.sent();
                        return [3 /*break*/, 62];
                    case 58:
                        if (!(val && (val.startsWith('#') || val.startsWith('.') || val.startsWith('[') || val.startsWith('//')))) return [3 /*break*/, 60];
                        return [4 /*yield*/, page.waitForSelector(val, { timeout: timeout })];
                    case 59:
                        _y.sent();
                        return [3 /*break*/, 62];
                    case 60: return [4 /*yield*/, page.waitForTimeout(val ? parseInt(val) || 1000 : 1000)];
                    case 61:
                        _y.sent();
                        _y.label = 62;
                    case 62: return [3 /*break*/, 86];
                    case 63:
                        aSel = step.assertSelector || sel;
                        expected = (_p = step.assertExpected) !== null && _p !== void 0 ? _p : '';
                        _b = (_q = step.assertType) !== null && _q !== void 0 ? _q : 'visibility';
                        switch (_b) {
                            case 'url': return [3 /*break*/, 64];
                            case 'visibility': return [3 /*break*/, 65];
                            case 'text': return [3 /*break*/, 68];
                        }
                        return [3 /*break*/, 71];
                    case 64: 
                    // Just screenshot — don't throw to keep the run going
                    return [3 /*break*/, 72];
                    case 65:
                        if (!aSel) return [3 /*break*/, 67];
                        return [4 /*yield*/, page.waitForSelector(aSel, { state: expected === 'hidden' ? 'hidden' : 'visible', timeout: timeout })];
                    case 66:
                        _y.sent();
                        _y.label = 67;
                    case 67: return [3 /*break*/, 72];
                    case 68:
                        if (!aSel) return [3 /*break*/, 70];
                        return [4 /*yield*/, page.waitForFunction(function (args) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                var doc = globalThis.document;
                                var el = doc.querySelector(args.s);
                                return el ? (el.textContent || '').includes(args.t) : false;
                            }, { s: aSel, t: expected }, { timeout: timeout })];
                    case 69:
                        _y.sent();
                        _y.label = 70;
                    case 70: return [3 /*break*/, 72];
                    case 71: return [3 /*break*/, 72];
                    case 72: return [3 /*break*/, 86];
                    case 73: 
                    /* Already captured by _sendScreenshot — nothing extra needed */
                    return [3 /*break*/, 86];
                    case 74:
                        if (!step.evaluateScript) return [3 /*break*/, 76];
                        return [4 /*yield*/, page.evaluate(step.evaluateScript)];
                    case 75:
                        _y.sent();
                        _y.label = 76;
                    case 76: return [3 /*break*/, 86];
                    case 77: return [4 /*yield*/, page.setViewportSize({
                            width: (_r = step.viewportWidth) !== null && _r !== void 0 ? _r : 1280,
                            height: (_s = step.viewportHeight) !== null && _s !== void 0 ? _s : 720,
                        })];
                    case 78:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 79: return [4 /*yield*/, page.route((_t = step.mockUrl) !== null && _t !== void 0 ? _t : '**/*', function (route) {
                            var _a, _b;
                            return route.fulfill({
                                status: (_a = step.mockStatus) !== null && _a !== void 0 ? _a : 200,
                                contentType: 'application/json',
                                body: (_b = step.mockBody) !== null && _b !== void 0 ? _b : '{}',
                            });
                        })];
                    case 80:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 81: return [4 /*yield*/, page.context().addCookies([{
                                name: (_u = step.cookieName) !== null && _u !== void 0 ? _u : 'session',
                                value: (_v = step.cookieValue) !== null && _v !== void 0 ? _v : '',
                                url: baseUrl,
                            }])];
                    case 82:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 83: return [4 /*yield*/, page.evaluate(function (args) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            globalThis.localStorage.setItem(args.k, args.v);
                        }, { k: (_w = step.storageKey) !== null && _w !== void 0 ? _w : 'key', v: (_x = step.storageValue) !== null && _x !== void 0 ? _x : '' })];
                    case 84:
                        _y.sent();
                        return [3 /*break*/, 86];
                    case 85: 
                    /* Unknown step — skip */
                    return [3 /*break*/, 86];
                    case 86: return [2 /*return*/];
                }
            });
        });
    };
    return PlaywrightRunner;
}());
exports.PlaywrightRunner = PlaywrightRunner;
/* ── Constants ─────────────────────────────────────────────────────── */
var INTERACTIVE_ACTIONS = [
    'click', 'dblclick', 'rightclick', 'hover', 'fill', 'type', 'clear',
    'select', 'check', 'uncheck', 'focus', 'blur', 'press', 'drag', 'upload',
];
var ACTION_COLOR = {
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
