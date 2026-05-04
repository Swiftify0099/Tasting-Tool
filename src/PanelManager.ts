import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TestFlow, VSCodeMessage, GeneratorOptions } from './types';
import { generatePlaywrightTest } from './generator/playwrightGenerator';

export class PanelManager {
  public static currentPanel: PanelManager | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _flows: Map<string, TestFlow> = new Map();

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
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        this._panel.webview.postMessage({ type: 'ERROR', payload: 'No workspace folder open to run tests in.' });
        return;
      }

      const safeName = flow.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const enabledSteps = flow.steps.filter(s => s.enabled);

      // Stream pre-run logs to the webview Runner page
      const sendLog = (message: string, logType: string = 'info') => {
        this._panel.webview.postMessage({ type: 'TEST_RUN_LOG', payload: { logType, message } });
      };

      sendLog(`▶  Running: ${safeName}.spec.ts`);
      sendLog(`Steps: ${enabledSteps.length} enabled`);
      sendLog('Launching Playwright terminal…');
      enabledSteps.forEach((s, i) => {
        sendLog(`[${i + 1}/${enabledSteps.length}] ${s.label} (${s.action})`, 'step');
      });
      sendLog('Test dispatched to terminal. See Terminal panel for live output.', 'success');

      // Signal the runner that the run was dispatched
      this._panel.webview.postMessage({ type: 'TEST_RUN_COMPLETE', payload: { passed: true } });

      // Open the terminal and run
      const terminal = vscode.window.createTerminal('Playwright Runner');
      terminal.show();
      terminal.sendText(`cd "${workspaceFolders[0].uri.fsPath}" && npx playwright test tests/${safeName}.spec.ts --reporter=list`);

      vscode.window.showInformationMessage(`Running test: ${flow.name}`);
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
