# Playwright Test Builder — VS Code Extension

A powerful **visual Playwright test builder** for VS Code. Build, configure, and generate TypeScript Playwright test scripts without writing a single line of code.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧰 **Visual Toolbox** | 33 Playwright actions organized by category |
| 🖼️ **Canvas Builder** | Drag & drop steps, reorder, duplicate, disable |
| ⚙️ **Properties Panel** | Dynamic fields per action type |
| 💾 **Flow Storage** | Save/load JSON flows in your workspace |
| ⚡ **Code Generator** | Auto-generate TypeScript `*.spec.ts` files |
| 📊 **Boundary Value Analysis** | Auto-generate BVA test cases for inputs |
| ✅ **Assertion Support** | URL, title, text, visibility, value, attribute, count, screenshot, network |
| 🖥️ **Test Runner** | Run tests directly in VS Code terminal |
| 🔀 **Page Routing** | Home → Builder → Generator → Runner → History → Settings |

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 18
- VS Code ≥ 1.85

### Install & Run

```bash
# Install all dependencies
npm install
cd webview-ui && npm install

# Build everything
cd ..
npx tsc -p tsconfig.json        # Compile extension
cd webview-ui && npm run build  # Build React UI

# Or watch mode (2 terminals)
# Terminal 1:
npx tsc -p tsconfig.json --watch
# Terminal 2:
cd webview-ui && npm run dev
```

### Open in VS Code
1. Open this folder in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new window: `Ctrl+Shift+P` → **"Open Playwright Test Builder"**
4. Or click the `$(play) Playwright Builder` status bar item

---

## 📄 Pages & Routing

| Route | Page | Description |
|---|---|---|
| `/home` | **Home** | Dashboard with quick actions & feature cards |
| `/builder` | **Builder** | 3-panel: Toolbox + Canvas + Properties |
| `/generator` | **Generator** | Syntax-highlighted code preview + copy/run |
| `/runner` | **Runner** | Terminal-style logs + test execution |
| `/history` | **History** | Saved flows — search, load, delete |
| `/settings` | **Settings** | Browser config, generator options, flow metadata |

---

## 🔧 Supported Actions (33 total)

### Navigation
`visit` · `reload` · `goback` · `goforward` · `newpage` · `closepage`

### Interaction
`click` · `dblclick` · `rightclick` · `hover` · `drag` · `scroll` · `popup` · `press` · `focus` · `blur`

### Input
`fill` · `type` · `clear` · `select` · `check` · `uncheck` · `upload`

### Assertion
`assert` · `screenshot`

### Advanced
`wait` · `evaluate` · `frame` · `setviewport`

### Network
`networkrequest` · `mockresponse` · `cookie` · `localstorage`

---

## 📐 Assertion Types

`url` · `title` · `text` · `visibility` · `enabled` · `checked` · `value` · `attribute` · `count` · `screenshot` · `network`

---

## 📁 Project Structure

```
Tasting-Tool/
├── src/                          # Extension TypeScript
│   ├── extension.ts              # Activation, commands, status bar
│   ├── PanelManager.ts           # Webview lifecycle + message handling
│   ├── types/index.ts            # Shared types
│   └── generator/
│       ├── playwrightGenerator.ts # Code generator (all 33 actions)
│       ├── boundaryAnalysis.ts    # BVA for 7 field types
│       └── assertionBuilder.ts    # 11 assertion types
├── webview-ui/                   # React + Tailwind UI
│   └── src/
│       ├── context/FlowContext.tsx # Global state + VSCode messaging
│       ├── hooks/useVSCode.ts      # Typed pub/sub message hook
│       ├── router/AppRouter.tsx    # HashRouter with 6 routes
│       ├── pages/                  # HomePage, BuilderPage, GeneratorPage,
│       │                           # RunnerPage, HistoryPage, SettingsPage
│       └── components/             # Layout, Toolbox, Canvas, StepCard,
│                                   # PropertiesPanel, Toast
├── dist/                         # Compiled extension JS
└── tests/                        # Generated Playwright specs go here
```

---

## 💬 Message Passing

| Direction | Messages |
|---|---|
| UI → Extension | `SAVE_FLOW`, `LOAD_FLOW`, `GENERATE_TEST`, `RUN_TEST`, `GET_FLOWS`, `DELETE_FLOW`, `EXPORT_JSON` |
| Extension → UI | `FLOW_SAVED`, `FLOW_LOADED`, `FLOWS_LIST`, `TEST_GENERATED`, `FLOW_DELETED`, `ERROR` |

---

## 🧪 Boundary Value Analysis

When enabled in Settings, `fill` steps automatically generate test cases for:
- `text` — empty, min, max, SQL injection, XSS, unicode
- `number` — min-1, min, min+1, typical, max-1, max, max+1
- `email` — valid, invalid format variants
- `password` — strength, length, character class variants
- `phone` — valid, too short, too long, letters
- `date` — today, yesterday, tomorrow, leap day, far past/future
- `url` — http, https, no-protocol, localhost, very long
