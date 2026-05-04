import * as vscode from 'vscode';
import { PanelManager } from './PanelManager';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Playwright Test Builder extension is now active!');

  const openCommand = vscode.commands.registerCommand(
    'playwright-test-builder.open',
    () => PanelManager.createOrShow(context.extensionUri)
  );

  const generateFromFileCommand = vscode.commands.registerCommand(
    'playwright-test-builder.generateFromFile',
    async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON Flow Files': ['json'] },
        title: 'Select Playwright Flow JSON'
      });

      if (uri && uri[0]) {
        PanelManager.createOrShow(context.extensionUri);
        // Small delay to ensure panel is ready
        setTimeout(() => {
          if (PanelManager.currentPanel) {
            vscode.window.showInformationMessage('Flow file selected. Loading...');
          }
        }, 500);
      }
    }
  );

  context.subscriptions.push(openCommand, generateFromFileCommand);

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = '$(play) Playwright Builder';
  statusBar.command = 'playwright-test-builder.open';
  statusBar.tooltip = 'Open Playwright Test Builder';
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate(): void {
  console.log('Playwright Test Builder extension deactivated.');
}
