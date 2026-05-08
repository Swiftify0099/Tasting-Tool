// Webview-side types (mirrors src/types/index.ts)
export type ActionType =
  | 'visit' | 'click' | 'fill' | 'select' | 'upload' | 'wait' | 'assert' | 'popup'
  | 'hover' | 'dblclick' | 'rightclick' | 'check' | 'uncheck' | 'focus' | 'blur'
  | 'press' | 'type' | 'clear' | 'drag' | 'scroll' | 'screenshot' | 'evaluate'
  | 'frame' | 'newpage' | 'closepage' | 'reload' | 'goback' | 'goforward'
  | 'setviewport' | 'cookie' | 'localstorage' | 'networkrequest' | 'mockresponse';

export type AssertType =
  | 'url' | 'title' | 'text' | 'visibility' | 'enabled' | 'checked'
  | 'value' | 'attribute' | 'count' | 'screenshot';

export type DOMCategory =
  | 'button' | 'input' | 'select' | 'link' | 'checkbox'
  | 'radio' | 'textarea' | 'form' | 'other';

export type SelectorQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface DOMElement {
  uid: string;
  tag: string;
  type: string;
  elementId: string;
  name: string;
  ariaLabel: string;
  placeholder: string;
  dataTestId: string;
  text: string;
  selector: string;
  xpath: string;
  role: string;
  className: string;
  href: string;
  category: DOMCategory;
  selectorQuality: SelectorQuality;
  boundaryValues?: BoundaryValue[];
}

export interface BoundaryValue {
  label: string;
  value: string | number;
  type: 'min' | 'max' | 'boundary_min' | 'boundary_max' | 'typical' | 'empty' | 'special';
}

export interface TestStep {
  id: string;
  action: ActionType;
  label: string;
  selector?: string;
  value?: string;
  url?: string;
  key?: string;
  timeout?: number;
  assertType?: AssertType;
  assertExpected?: string;
  assertSelector?: string;
  uploadPath?: string;
  frameSelector?: string;
  scrollX?: number;
  scrollY?: number;
  scrollType?: 'page' | 'element';
  scrollBehavior?: 'smooth' | 'auto';
  cookieName?: string;
  cookieValue?: string;
  storageKey?: string;
  storageValue?: string;
  mockUrl?: string;
  mockStatus?: number;
  mockBody?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  dragTargetSelector?: string;
  evaluateScript?: string;
  pressTarget?: 'element' | 'keyboard';
  frameAction?: 'click' | 'fill' | 'type' | 'check' | 'uncheck';
  frameContent?: string;
  boundaryValues?: BoundaryValue[];
  enabled: boolean;
  comment?: string;
}

export interface TestFlow {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  steps: TestStep[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
  version: string;
}

export interface GeneratorOptions {
  includeComments: boolean;
  useBoundaryValues: boolean;
  testFramework: 'playwright' | 'jest-playwright';
  browserType: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  slowMo?: number;
  timeout: number;
  retries: number;
  screenshotOnFailure: boolean;
  videoOnFailure: boolean;
}

export type MessageType =
  | 'GENERATE_TEST' | 'SAVE_FLOW' | 'LOAD_FLOW' | 'FLOW_SAVED' | 'FLOW_LOADED'
  | 'TEST_GENERATED' | 'ERROR' | 'OPEN_FILE' | 'GET_FLOWS' | 'FLOWS_LIST'
  | 'DELETE_FLOW' | 'FLOW_DELETED' | 'RUN_TEST' | 'TEST_RESULT' | 'EXPORT_JSON'
  | 'TEST_RUN_LOG' | 'TEST_RUN_STEP' | 'TEST_RUN_SCREENSHOT' | 'TEST_RUN_COMPLETE'
  | 'TEST_RUN_FRAME'
  | 'EXTRACT_DOM' | 'DOM_EXTRACTED' | 'DOM_EXTRACT_ERROR' | 'AI_GENERATE_FROM_DOM';

export interface VSCodeMessage { type: MessageType; payload?: unknown; }

export interface FlowSummary {
  id: string; name: string; description: string;
  updatedAt: string; stepCount: number; tags: string[];
}

export interface ToolboxAction {
  action: ActionType;
  label: string;
  icon: string;
  category: 'navigation' | 'interaction' | 'input' | 'assertion' | 'advanced' | 'network';
  description: string;
  color: string;
}
