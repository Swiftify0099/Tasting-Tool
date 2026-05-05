# Playwright Test Builder

A VS Code extension with a React/Vite webview UI that provides a visual interface for building, configuring, and generating TypeScript Playwright test scripts using a drag-and-drop workflow.

## Project Structure

```
.
├── package.json                # Root config, extension dependencies & build scripts
├── tsconfig.json               # TypeScript config for the extension
├── src/                        # Extension Backend (VS Code Extension API)
│   ├── extension.ts            # Entry point: commands, activation, and status bar
│   ├── PanelManager.ts         # Manages the Webview lifecycle & message routing
│   ├── generator/              # Code generation logic
│   └── types/                  # Shared TypeScript interfaces
├── webview-ui/                 # Frontend React Application (runs standalone in Replit)
│   ├── package.json            # UI-specific dependencies (React, Vite, Tailwind)
│   ├── vite.config.ts          # Vite configuration (host: 0.0.0.0, port: 5000)
│   └── src/
│       ├── main.tsx            # React entry point
│       ├── App.tsx             # Root component with HashRouter
│       ├── context/            # FlowContext for global state
│       ├── pages/              # Views: Home, Builder, Generator, Runner, History, Settings, AI
│       ├── components/         # UI components: Canvas, Toolbox, StepCard, Layout, etc.
│       ├── hooks/              # useVSCode hook for messaging
│       ├── services/           # aiService.ts
│       ├── router/             # AppRouter.tsx
│       ├── types/              # TypeScript interfaces
│       └── vscode.ts           # VS Code API bridge with browser dev mock
└── README.md
```

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, react-router-dom, @dnd-kit
- **Extension**: TypeScript, VS Code Extension API, Playwright
- **Package Manager**: npm

## Running in Replit

The webview UI runs as a standalone web app (browser dev mock simulates the VS Code API). The workflow runs `cd webview-ui && npm run dev` on port 5000.

## Deployment

Configured as a **static** deployment:
- Build: `cd webview-ui && npm run build`
- Public directory: `webview-ui/dist`

## Key Features

- Visual drag-and-drop test flow builder (33 Playwright actions)
- TypeScript Playwright test code generation
- Boundary Value Analysis (BVA) for edge-case test data
- AI-assisted test generation
- Integrated test runner with simulated output
- Flow save/load/export as JSON
