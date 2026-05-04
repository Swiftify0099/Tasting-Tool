// Shared types between extension and webview

export type ActionType =
  | 'visit'
  | 'click'
  | 'fill'
  | 'select'
  | 'upload'
  | 'wait'
  | 'assert'
  | 'popup'
  | 'hover'
  | 'dblclick'
  | 'rightclick'
  | 'check'
  | 'uncheck'
  | 'focus'
  | 'blur'
  | 'press'
  | 'type'
  | 'clear'
  | 'drag'
  | 'scroll'
  | 'screenshot'
  | 'evaluate'
  | 'frame'
  | 'newpage'
  | 'closepage'
  | 'reload'
  | 'goback'
  | 'goforward'
  | 'setviewport'
  | 'cookie'
  | 'localstorage'
  | 'networkrequest'
  | 'mockresponse';

export type AssertType =
  | 'url'
  | 'title'
  | 'text'
  | 'visibility'
  | 'enabled'
  | 'checked'
  | 'value'
  | 'attribute'
  | 'count'
  | 'screenshot'
  | 'network';

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
  waitForSelector?: boolean;
  waitForNavigation?: boolean;
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
  | 'GENERATE_TEST'
  | 'SAVE_FLOW'
  | 'LOAD_FLOW'
  | 'FLOW_SAVED'
  | 'FLOW_LOADED'
  | 'TEST_GENERATED'
  | 'ERROR'
  | 'OPEN_FILE'
  | 'GET_FLOWS'
  | 'FLOWS_LIST'
  | 'DELETE_FLOW'
  | 'FLOW_DELETED'
  | 'RUN_TEST'
  | 'TEST_RESULT'
  | 'EXPORT_JSON';

export interface VSCodeMessage {
  type: MessageType;
  payload?: unknown;
}

export interface TestResult {
  flowId: string;
  flowName: string;
  passed: boolean;
  duration: number;
  error?: string;
  steps: {
    stepId: string;
    action: string;
    passed: boolean;
    error?: string;
  }[];
}
