import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TestFlow, VSCodeMessage, GeneratorOptions } from './types';
import { generatePlaywrightTest } from './generator/playwrightGenerator';
import { PlaywrightRunner } from './PlaywrightRunner';

export class PanelManager {
  public static currentPanel: PanelManager | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _flows: Map<string, TestFlow> = new Map();
  private _currentRunner: PlaywrightRunner | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message: VSCodeMessage) => this._handleMessage(message),
      null,
      this._disposables
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    this._loadExistingFlows();
  }

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (PanelManager.currentPanel) {
      PanelManager.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'playwrightTestBuilder',
      'Playwright Test Builder',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist'),
          vscode.Uri.joinPath(extensionUri, 'resources')
        ],
        retainContextWhenHidden: true
      }
    );

    PanelManager.currentPanel = new PanelManager(panel, extensionUri);
  }

  private async _handleMessage(message: VSCodeMessage): Promise<void> {
    switch (message.type) {
      case 'SAVE_FLOW': {
        const flow = message.payload as TestFlow;
        await this._saveFlow(flow);
        break;
      }
      case 'LOAD_FLOW': {
        const flowId = message.payload as string;
        await this._loadFlow(flowId);
        break;
      }
      case 'GENERATE_TEST': {
        const { flow, options } = message.payload as { flow: TestFlow; options: GeneratorOptions };
        await this._generateTest(flow, options);
        break;
      }
      case 'GET_FLOWS': {
        this._sendFlowsList();
        break;
      }
      case 'DELETE_FLOW': {
        const flowId = message.payload as string;
        await this._deleteFlow(flowId);
        break;
      }
      case 'RUN_TEST': {
        const flow = message.payload as TestFlow;
        await this._runTest(flow);
        break;
      }
      case 'OPEN_FILE': {
        const filePath = message.payload as string;
        await this._openFile(filePath);
        break;
      }
      case 'EXPORT_JSON': {
        const flow = message.payload as TestFlow;
        await this._exportJson(flow);
        break;
      }
      case 'EXTRACT_DOM': {
        const url = message.payload as string;
        await this._extractDOM(url);
        break;
      }
    }
  }

  private async _saveFlow(flow: TestFlow): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        this._panel.webview.postMessage({ type: 'ERROR', payload: 'No workspace folder open.' });
        vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
        return;
      }

      const flowsDir = path.join(workspaceFolders[0].uri.fsPath, '.playwright-builder', 'flows');
      if (!fs.existsSync(flowsDir)) {
        fs.mkdirSync(flowsDir, { recursive: true });
      }

      const filePath = path.join(flowsDir, `${flow.id}.json`);
      flow.updatedAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(flow, null, 2), 'utf8');
      this._flows.set(flow.id, flow);

      this._panel.webview.postMessage({
        type: 'FLOW_SAVED',
        payload: { success: true, flowId: flow.id, path: filePath }
      });

      vscode.window.showInformationMessage(`✅ Flow "${flow.name}" saved successfully!`);
    } catch (err) {
      const error = err as Error;
      this._panel.webview.postMessage({ type: 'ERROR', payload: error.message });
      vscode.window.showErrorMessage(`Failed to save flow: ${error.message}`);
    }
  }

  private async _loadFlow(flowId: string): Promise<void> {
    try {
      const flow = this._flows.get(flowId);
      if (flow) {
        this._panel.webview.postMessage({ type: 'FLOW_LOADED', payload: flow });
      } else {
        this._panel.webview.postMessage({ type: 'ERROR', payload: 'Flow not found' });
      }
    } catch (err) {
      const error = err as Error;
      this._panel.webview.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  private _loadExistingFlows(): void {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const flowsDir = path.join(workspaceFolders[0].uri.fsPath, '.playwright-builder', 'flows');
      if (!fs.existsSync(flowsDir)) return;

      const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.json'));
      files.forEach(file => {
        const content = fs.readFileSync(path.join(flowsDir, file), 'utf8');
        const flow: TestFlow = JSON.parse(content);
        this._flows.set(flow.id, flow);
      });
    } catch (err) {
      console.error('Error loading flows:', err);
    }
  }

  private _sendFlowsList(): void {
    const flows = Array.from(this._flows.values()).map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      updatedAt: f.updatedAt,
      stepCount: f.steps.length,
      tags: f.tags
    }));
    this._panel.webview.postMessage({ type: 'FLOWS_LIST', payload: flows });
  }

  private async _deleteFlow(flowId: string): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        this._panel.webview.postMessage({ type: 'ERROR', payload: 'No workspace folder open.' });
        return;
      }

      const filePath = path.join(
        workspaceFolders[0].uri.fsPath,
        '.playwright-builder',
        'flows',
        `${flowId}.json`
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this._flows.delete(flowId);
      this._panel.webview.postMessage({ type: 'FLOW_DELETED', payload: { flowId } });
      vscode.window.showInformationMessage('Flow deleted.');
    } catch (err) {
      const error = err as Error;
      this._panel.webview.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  private async _generateTest(flow: TestFlow, options: GeneratorOptions): Promise<void> {
    try {
      const testCode = generatePlaywrightTest(flow, options);

      // 1. Immediately send the generated code back to the UI so it can be previewed
      this._panel.webview.postMessage({
        type: 'TEST_GENERATED',
        payload: { success: true, path: 'In-Memory Preview', code: testCode }
      });

      // 2. Try to save it to disk if a workspace is open
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showWarningMessage('No workspace folder open. Code generated in preview only.');
        return;
      }

      const testsDir = path.join(workspaceFolders[0].uri.fsPath, 'tests');
      if (!fs.existsSync(testsDir)) {
        fs.mkdirSync(testsDir, { recursive: true });
      }

      const safeName = flow.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const filePath = path.join(testsDir, `${safeName}.spec.ts`);
      fs.writeFileSync(filePath, testCode, 'utf8');

      // Update the UI with the real file path
      this._panel.webview.postMessage({
        type: 'TEST_GENERATED',
        payload: { success: true, path: filePath, code: testCode }
      });

      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

      vscode.window.showInformationMessage(
        `🎉 Test saved to: tests/${path.basename(filePath)}`
      );
    } catch (err) {
      const error = err as Error;
      this._panel.webview.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  private async _runTest(flow: TestFlow): Promise<void> {
    try {
      /* Abort any previous run */
      if (this._currentRunner) {
        this._currentRunner.abort();
        this._currentRunner = null;
      }

      const options = {
        browserType: 'chromium',
        headless:    false,
        timeout:     15000,
        slowMo:      0,
      };

      const postToWebview = (type: string, payload: unknown) => {
        try {
          this._panel.webview.postMessage({ type, payload });
        } catch { /* panel may have been disposed */ }
      };

      this._currentRunner = new PlaywrightRunner(postToWebview);

      /* Fire-and-forget — runner streams messages as it progresses */
      this._currentRunner.run(flow, options).then(() => {
        this._currentRunner = null;
      }).catch((err: Error) => {
        this._currentRunner = null;
        postToWebview('TEST_RUN_LOG', { logType: 'error', message: `✗ Unexpected error: ${err.message}` });
        postToWebview('TEST_RUN_COMPLETE', { passed: false, error: err.message });
      });

      vscode.window.showInformationMessage(`🚀 Running: ${flow.name} (live preview active)`);
    } catch (err) {
      const error = err as Error;
      this._panel.webview.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  private async _openFile(filePath: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);
    } catch (err) {
      const error = err as Error;
      vscode.window.showErrorMessage(`Cannot open file: ${error.message}`);
    }
  }

  private async _exportJson(flow: TestFlow): Promise<void> {
    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${flow.name.replace(/\s/g, '_')}.json`),
        filters: { 'JSON Files': ['json'] }
      });

      if (uri) {
        fs.writeFileSync(uri.fsPath, JSON.stringify(flow, null, 2), 'utf8');
        vscode.window.showInformationMessage(`Exported to: ${uri.fsPath}`);
      }
    } catch (err) {
      const error = err as Error;
      this._panel.webview.postMessage({ type: 'ERROR', payload: error.message });
    }
  }

  private async _extractDOM(url: string): Promise<void> {
    let browser: any = null;
    try {
      // Resolve playwright from the extension's own node_modules (reliable on Windows)
      const pwModulePath = path.join(__dirname, '..', 'node_modules', 'playwright');
      let chromium: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        chromium = require(pwModulePath).chromium;
      } catch {
        // Fallback: try global playwright
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          chromium = require('playwright').chromium;
        } catch {
          this._panel.webview.postMessage({
            type: 'DOM_EXTRACT_ERROR',
            payload: 'Playwright not found. Run: npm install playwright in the extension directory.'
          });
          vscode.window.showErrorMessage('Playwright not installed. Run npm install playwright in the extension root.');
          return;
        }
      }

      vscode.window.showInformationMessage(`🔍 Extracting DOM from ${url}…`);

      browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch {
        // Try without waitUntil if domcontentloaded times out
        await page.goto(url, { timeout: 30000 });
      }
      // Wait for dynamic content
      await page.waitForTimeout(2000);

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const elements = await page.evaluate((): any[] => {
        const results: any[] = [];
        const seen = new WeakSet<any>();
        const SELECTORS = [
          'button', 'input', 'select', 'textarea', 'a[href]',
          '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
          '[role="textbox"]', '[role="combobox"]', '[role="menuitem"]',
          '[role="option"]', 'form', '[data-testid]', '[data-cy]', '[data-qa]'
        ];
        let uid = 0;

        SELECTORS.forEach((sel: string) => {
          try {
            // eslint-disable-next-line no-undef
            const doc = (globalThis as any).document || (global as any).document;
            doc.querySelectorAll(sel).forEach((el: any) => {
              if (seen.has(el)) { return; }
              seen.add(el);

              const tag: string = el.tagName.toLowerCase();
              const elId: string = el.id || '';
              const name: string = el.getAttribute('name') || '';
              const ariaLabel: string = el.getAttribute('aria-label') || '';
              const placeholder: string = el.getAttribute('placeholder') || '';
              const dataTestId: string = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-qa') || '';
              const role: string = el.getAttribute('role') || tag;
              const href: string = el.getAttribute('href') || '';
              const type: string = el.getAttribute('type') || tag;
              const rawText: string = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
              const className: string = typeof el.className === 'string' ? el.className : '';

              let selector = '';
              let quality = 'poor';
              if (dataTestId) { selector = '[data-testid="' + dataTestId + '"]'; quality = 'excellent'; }
              else if (elId)  { selector = '#' + elId; quality = 'good'; }
              else if (name)  { selector = '[name="' + name + '"]'; quality = 'good'; }
              else if (ariaLabel) { selector = '[aria-label="' + ariaLabel + '"]'; quality = 'fair'; }
              else if (placeholder) { selector = '[placeholder="' + placeholder + '"]'; quality = 'fair'; }
              else if (rawText && (tag === 'button' || tag === 'a') && rawText.length < 50) {
                selector = 'text="' + rawText + '"'; quality = 'fair';
              } else {
                const cls: string = className.split(' ').filter(Boolean).slice(0, 2).join('.');
                selector = tag + (cls ? '.' + cls : '');
                quality = 'poor';
              }

              let category = 'other';
              if (tag === 'button' || (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset')) || role === 'button') {
                category = 'button';
              } else if ((tag === 'input' && type === 'checkbox') || role === 'checkbox') {
                category = 'checkbox';
              } else if ((tag === 'input' && type === 'radio') || role === 'radio') {
                category = 'radio';
              } else if (tag === 'input' || role === 'textbox') {
                category = 'input';
              } else if (tag === 'select' || role === 'combobox') {
                category = 'select';
              } else if (tag === 'textarea') {
                category = 'textarea';
              } else if (tag === 'a') {
                category = 'link';
              } else if (tag === 'form') {
                category = 'form';
              }

              const getXPath = (e: any): string => {
                if (e.id) { return '//*[@id="' + e.id + '"]'; }
                const parts: string[] = [];
                let node: any = e;
                while (node && node.nodeType === 1) {
                  let idx = 1;
                  let sib: any = node.previousSibling;
                  while (sib) {
                    if (sib.nodeType === 1 && sib.tagName === node.tagName) { idx++; }
                    sib = sib.previousSibling;
                  }
                  parts.unshift(node.tagName.toLowerCase() + '[' + idx + ']');
                  node = node.parentNode;
                }
                return '/' + parts.join('/');
              };

              results.push({
                uid: String(++uid),
                tag, type, elementId: elId, name, ariaLabel, placeholder,
                dataTestId, text: rawText, selector, xpath: getXPath(el),
                role, className, href, category, selectorQuality: quality
              });
            });
          } catch { /* skip bad selectors */ }
        });

        return results;
      });

      await browser.close();
      browser = null;

      this._panel.webview.postMessage({ type: 'DOM_EXTRACTED', payload: { elements, url } });
      vscode.window.showInformationMessage(`✅ Extracted ${elements.length} elements from ${url}`);

    } catch (err) {
      if (browser) { try { await browser.close(); } catch { /* ignore */ } }
      const error = err as Error;
      const msg = error.message || 'Unknown error during DOM extraction';
      this._panel.webview.postMessage({ type: 'DOM_EXTRACT_ERROR', payload: msg });
      vscode.window.showErrorMessage(`DOM extraction failed: ${msg.slice(0, 150)}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const webviewDistPath = vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDistPath, 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDistPath, 'assets', 'index.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}" />
  <title>Playwright Test Builder</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    /* Stop any live Playwright run */
    if (this._currentRunner) {
      this._currentRunner.abort();
      this._currentRunner = null;
    }
    PanelManager.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
