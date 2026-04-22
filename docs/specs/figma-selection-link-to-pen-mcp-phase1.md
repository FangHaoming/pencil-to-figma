# Figma Selection Link -> `.pen` MCP Phase 1

## 0. Meta

- Task: `figma-selection-link-to-pen-mcp-phase1`
- Phase: `Plan`
- Approval Status: `Draft, Ready for Plan Approved`
- Goal: 基于 Figma selection link，通过本地 `bridge + MCP` 导出目标节点为 `.pen`
- Primary Path: `link -> parse(fileKey,nodeId) -> bridge match session -> plugin exportNodeById -> return/save .pen`

## 1. Context Sources

- 当前仓库：`pencil-to-figma`
- 现有导出链路：
  - `src/plugin/main.ts`
  - `src/plugin/export/pipeline.ts`
  - `src/plugin/export/node-to-element.ts`
- 现有消息协议：
  - `src/shared/messages.ts`
- 现有插件配置：
  - `manifest.json`
- Figma 官方文档：
  - `Plugin Manifest`
  - `Making Network Requests`

## 2. Goal

构建一个本地可用的 MCP 工作流，使 Cursor 可以调用：

`export_pen_from_figma_selection_link(link, outputPath?, includeAssets?)`

并完成以下动作：

1. 解析 Figma selection link
2. 提取 `fileKey` 与 `nodeId`
3. 通过本地 bridge 找到匹配 `fileKey` 的在线插件实例
4. 让插件按 `nodeId` 导出 `.pen`
5. 将 `.pen` JSON 返回给 Cursor，或写入工作区文件

补充调用提示词：`用figma mcp获取设计稿`

## 3. In Scope

- 根据 selection link 导出单个节点
- 只支持目标 Figma 文件已打开
- 只支持桥接插件已在线
- 支持返回 `.pen` JSON
- 支持可选 `includeAssets`
- 支持可选 `outputPath`

## 4. Out of Scope

- 自动打开 Figma 文件
- 自动切换到目标页面
- 纯无插件的远程 Figma API 导出
- `.pen -> Figma` 导入
- 多插件实例的高级调度策略
- 大文件/大图片分块传输优化
- 完整 monorepo 重构

## 5. Resolved Decisions

### 5.1 fileKey 获取

- 结论：插件侧可以拿到当前 Figma 文件的 `fileKey`
- 影响：Phase 1 可以按 `fileKey` 精确匹配 bridge session

### 5.2 manifest 网络访问

- 结论：Figma 官方文档确认 `networkAccess` 支持 `http` / `https` / `ws` / `wss`
- 结论：Figma 官方文档确认 `devAllowedDomains` 可用于本地/开发服务器
- 结论：`localhost` 在文档中属于支持范围
- 决策：Phase 1 使用本地 WebSocket bridge 方案

## 6. Architecture

### 6.1 Components

- MCP Server
  - 对 Cursor 暴露工具
  - 解析 selection link
  - 调用 bridge
- Local Bridge
  - 管理插件会话
  - 转发导出任务
  - 跟踪请求状态
- Figma Plugin UI
  - 连接 bridge
  - 在 bridge 与主线程之间转发消息
- Figma Plugin Main
  - 执行 `exportNodeById`
  - 调用现有 `.pen` 导出逻辑

### 6.2 Flow

`Cursor -> MCP -> Bridge -> Plugin UI -> Plugin Main -> ExportBundle -> Bridge -> MCP -> Cursor`

## 7. Manifest Baseline

开发态建议配置：

```json
{
  "networkAccess": {
    "allowedDomains": ["none"],
    "devAllowedDomains": [
      "http://localhost:3210",
      "ws://localhost:3210"
    ]
  }
}
```

说明：

- Phase 1 固定 bridge 端口为 `3210`
- 若实测 `ws://localhost:3210` 在 Figma 环境存在限制，则退回到基于 `http://localhost:3210` 的实际可用方案，再同步更新本 spec

## 8. Stable Data Contracts

### 8.1 `src/shared/figma-link.ts`

```ts
export type ParsedFigmaSelectionLink = {
  url: string;
  fileKey: string;
  nodeId: string;
  pageId?: string;
  originalNodeId?: string;
};

export type ParseFigmaLinkResult =
  | { ok: true; value: ParsedFigmaSelectionLink }
  | { ok: false; error: string };
```

### 8.2 `src/shared/bridge.ts`

```ts
import type { PenAsset, PenDocument } from './pen';

export type PluginCapability =
  | 'export.nodeById'
  | 'export.selection'
  | 'export.page';

export type BridgeCommand =
  | {
      kind: 'bridge.export.nodeById';
      requestId: string;
      timestamp: number;
      payload: {
        nodeId: string;
        includeAssets?: boolean;
      };
    }
  | {
      kind: 'bridge.export.selection';
      requestId: string;
      timestamp: number;
      payload: {
        includeAssets?: boolean;
      };
    }
  | {
      kind: 'bridge.export.page';
      requestId: string;
      timestamp: number;
      payload: {
        includeAssets?: boolean;
      };
    }
  | {
      kind: 'bridge.ping';
      requestId: string;
      timestamp: number;
    };

export type PluginEvent =
  | {
      kind: 'plugin.hello';
      pluginSessionId: string;
      timestamp: number;
      payload: {
        fileKey?: string;
        fileName?: string;
        pageId?: string;
        pageName?: string;
        capabilities: PluginCapability[];
      };
    }
  | {
      kind: 'plugin.result';
      pluginSessionId: string;
      requestId: string;
      timestamp: number;
      payload: {
        data: PenDocument;
        assets: PenAsset[];
      };
    }
  | {
      kind: 'plugin.error';
      pluginSessionId: string;
      requestId: string;
      timestamp: number;
      payload: {
        error: string;
      };
    }
  | {
      kind: 'plugin.pong';
      pluginSessionId: string;
      requestId: string;
      timestamp: number;
    };
```

### 8.3 `src/shared/messages.ts`

Bridge 专用新增协议：

```ts
export type UiToPluginMessage =
  | { type: 'bridge-export-node'; requestId: string; nodeId: string; includeAssets?: boolean }
  | { type: 'bridge-export-selection'; requestId: string; includeAssets?: boolean }
  | { type: 'bridge-export-page'; requestId: string; includeAssets?: boolean }
  | { type: 'bridge-get-runtime-info'; requestId: string }
  // 保留原有消息
  | { type: 'ready-to-place'; data: PenDocument; images?: Record<string, string> | null }
  | { type: 'import-pen'; data: PenDocument; images?: Record<string, string> | null }
  | { type: 'place-import'; data: PenDocument; images?: Record<string, string> | null }
  | { type: 'export-pen' }
  | { type: 'icon-svg-fetched'; nodeId: string; svgPath: string | null; iconName?: string; error?: string }
  | { type: 'close-after-download' }
  | { type: 'close' };

export type PluginToUiMessage =
  | {
      type: 'bridge-export-result';
      requestId: string;
      data: PenDocument;
      assets: PenAsset[];
    }
  | {
      type: 'bridge-export-error';
      requestId: string;
      error: string;
    }
  | {
      type: 'bridge-runtime-info';
      requestId: string;
      fileKey?: string;
      fileName?: string;
      pageId?: string;
      pageName?: string;
      capabilities: Array<'export.nodeById' | 'export.selection' | 'export.page'>;
    };
```

## 9. Final Function Signatures

### 9.1 `src/plugin/export/pipeline.ts`

```ts
import type { ExportBundle } from './types.js';

export type ExportPipelineDeps = {
  convertNodesToPenBundle: (nodes: readonly SceneNode[], includeAssets?: boolean) => Promise<ExportBundle>;
};

export async function exportNodesToPen(
  nodes: readonly SceneNode[],
  deps: ExportPipelineDeps,
  includeAssets = true
): Promise<ExportBundle>;

export async function exportCurrentSelectionToPen(
  deps: ExportPipelineDeps,
  includeAssets = true
): Promise<ExportBundle>;
```

### 9.2 `src/plugin/main.ts`

```ts
import type { ExportBundle } from './export/types.js';

type PluginRuntimeInfo = {
  fileKey?: string;
  fileName?: string;
  pageId?: string;
  pageName?: string;
  capabilities: Array<'export.nodeById' | 'export.selection' | 'export.page'>;
};

function isSceneNode(node: BaseNode | null): node is SceneNode;

function getPluginRuntimeInfo(): PluginRuntimeInfo;

async function convertNodesToPenBundle(
  nodes: readonly SceneNode[],
  includeAssets?: boolean
): Promise<ExportBundle>;

async function exportNodeById(
  nodeId: string,
  includeAssets?: boolean
): Promise<ExportBundle>;

async function exportCurrentSelectionBundle(
  includeAssets?: boolean
): Promise<ExportBundle>;

async function exportCurrentPageBundle(
  includeAssets?: boolean
): Promise<ExportBundle>;
```

`figma.ui.onmessage` 在 bridge 模式只处理：

- `bridge-export-node`
- `bridge-export-selection`
- `bridge-export-page`
- `bridge-get-runtime-info`

bridge 模式只返回：

- `bridge-export-result`
- `bridge-export-error`
- `bridge-runtime-info`

### 9.3 `src/ui/bridge-client.ts`

```ts
import type { BridgeCommand, PluginEvent } from '../shared/bridge';

export type BridgeClientOptions = {
  url: string;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onCommand?: (command: BridgeCommand) => void;
};

export type BridgeClient = {
  connect(): void;
  disconnect(): void;
  send(event: PluginEvent): void;
  isConnected(): boolean;
};

export function createBridgeClient(options: BridgeClientOptions): BridgeClient;
```

### 9.4 `bridge/sessions.ts`

```ts
import type { PluginCapability } from '../src/shared/bridge';

export type PluginSession = {
  pluginSessionId: string;
  fileKey?: string;
  fileName?: string;
  pageId?: string;
  pageName?: string;
  capabilities: PluginCapability[];
  connectedAt: number;
  lastSeenAt: number;
  status: 'idle' | 'busy';
};

export function registerSession(session: PluginSession): void;
export function updateSession(sessionId: string, patch: Partial<PluginSession>): void;
export function touchSession(sessionId: string): void;
export function removeSession(sessionId: string): void;
export function listSessions(): PluginSession[];
export function findSessionByFileKey(fileKey: string): PluginSession | null;
export function findAnyCapableSession(capability: PluginCapability): PluginSession | null;
```

### 9.5 `bridge/tasks.ts`

```ts
export type TaskResult<T> = Promise<T>;

export function createTask<T>(requestId: string, timeoutMs: number): TaskResult<T>;
export function resolveTask<T>(requestId: string, value: T): void;
export function rejectTask(requestId: string, error: Error): void;
export function hasTask(requestId: string): boolean;
```

### 9.6 `bridge/server.ts`

```ts
import type { PenAsset, PenDocument } from '../src/shared/pen';
import type { PluginSession } from './sessions';

export type ExportNodeByIdArgs = {
  fileKey: string;
  nodeId: string;
  includeAssets?: boolean;
  timeoutMs?: number;
};

export type BridgeExportResult = {
  data: PenDocument;
  assets: PenAsset[];
};

export type BridgeStatus = {
  connected: boolean;
  sessions: PluginSession[];
};

export type BridgeServer = {
  start(): Promise<void>;
  stop(): Promise<void>;
  exportNodeById(args: ExportNodeByIdArgs): Promise<BridgeExportResult>;
  getStatus(): BridgeStatus;
};

export function createBridgeServer(args: {
  port: number;
}): BridgeServer;
```

固定错误文案：

- `No plugin session connected`
- `No plugin session matches fileKey`
- `Plugin task timed out`
- `Plugin returned error: <message>`
- `Plugin capability not supported: export.nodeById`

### 9.7 `mcp/tools/export-from-selection-link.ts`

```ts
import type { PenAsset, PenDocument } from '../../src/shared/pen';
import type { ParsedFigmaSelectionLink } from '../../src/shared/figma-link';
import type { BridgeServer } from '../../bridge/server';

export type ExportFromSelectionLinkArgs = {
  link: string;
  outputPath?: string;
  includeAssets?: boolean;
};

export type ExportFromSelectionLinkResult = {
  ok: boolean;
  fileKey?: string;
  nodeId?: string;
  savedPath?: string;
  data?: PenDocument;
  assets?: PenAsset[];
  error?: string;
};

export function parseFigmaSelectionLink(link: string): ParsedFigmaSelectionLink;

export async function exportPenFromFigmaSelectionLink(
  args: ExportFromSelectionLinkArgs,
  deps: {
    bridge: BridgeServer;
    writeFile?: (path: string, content: string) => Promise<void>;
  }
): Promise<ExportFromSelectionLinkResult>;
```

### 9.8 `mcp/tools/get-bridge-status.ts`

```ts
import type { BridgeServer } from '../../bridge/server';

export type GetBridgeStatusResult = {
  connected: boolean;
  sessions: Array<{
    pluginSessionId: string;
    fileKey?: string;
    fileName?: string;
    pageId?: string;
    pageName?: string;
    capabilities: string[];
    status: 'idle' | 'busy';
  }>;
};

export async function getBridgeStatus(
  deps: { bridge: BridgeServer }
): Promise<GetBridgeStatusResult>;
```

## 10. File Changes

### 10.1 Existing Files

- `manifest.json`
- `src/shared/messages.ts`
- `src/plugin/main.ts`
- `src/plugin/export/pipeline.ts`
- `src/ui/App.svelte`

### 10.2 New Files

- `src/shared/bridge.ts`
- `src/shared/figma-link.ts`
- `src/ui/bridge-client.ts`
- `bridge/server.ts`
- `bridge/sessions.ts`
- `bridge/tasks.ts`
- `mcp/server.ts`
- `mcp/tools/export-from-selection-link.ts`
- `mcp/tools/get-bridge-status.ts`

## 11. Fixed Behavioral Constraints

### 11.1 Bridge 模式不触发下载

桥接导出只返回结构化结果，不走：

- `download-pen`
- `close-after-download`

### 11.2 `includeAssets` 默认值

- MCP 入口默认 `includeAssets = true`
- 调试阶段允许显式传 `false`

### 11.3 `outputPath`

- 如果提供，写文件
- 如果未提供，直接返回 `data + assets`

### 11.4 文件匹配策略

- Phase 1 必须按 `fileKey` 精确匹配 session
- 不做模糊匹配
- 不做自动切换文件

### 11.5 节点导出范围

- 导出 `nodeId` 对应节点及其子树
- 不自动补兄弟节点
- 不自动导出整页

## 12. Acceptance Criteria

1. `parseFigmaSelectionLink()` 能稳定解析真实 selection link
2. 插件启动后能向 bridge 发 `plugin.hello`
3. bridge 能根据 `fileKey` 找到目标 session
4. `exportNodeById(nodeId)` 能返回 `ExportBundle`
5. MCP 工具能返回 `.pen` JSON
6. `outputPath` 提供时能成功写盘
7. 插件手动导出工作流不受影响
8. manifest 本地网络配置经真实验证可用

## 13. Validation Plan

- 合法 link + 在线插件 -> 成功导出
- 非法 link -> 明确报错
- `fileKey` 不匹配 -> 明确报错
- `nodeId` 不存在 -> 明确报错
- `includeAssets=false` -> 成功
- 现有手动导出流程无回归

## 14. Open Questions

- `ws://localhost:3210` 在 Figma 实际插件环境中的行为是否与文档规则完全一致
- `outputPath` 的默认落盘策略是否需要在 Phase 2 再补标准化目录约定
- 后续是否需要支持一个 `export.selection` 作为调试工具

## 15. Active Checklist

- [ ] 更新 `manifest.json` 开发态网络配置
- [ ] 新增 `src/shared/bridge.ts`
- [ ] 新增 `src/shared/figma-link.ts`
- [ ] 抽出 `exportNodesToPen`
- [ ] 在 `main.ts` 增加 `exportNodeById`
- [ ] 在 `messages.ts` 增加 bridge 专用消息
- [ ] 新增 `src/ui/bridge-client.ts`
- [ ] 在 `App.svelte` 接入 bridge client
- [ ] 实现 `bridge/server.ts`
- [ ] 实现 `bridge/sessions.ts`
- [ ] 实现 `bridge/tasks.ts`
- [ ] 实现 `mcp/tools/export-from-selection-link.ts`
- [ ] 实现 `mcp/tools/get-bridge-status.ts`
- [ ] 完成真实 selection link 验证

## 16. Next Action

等待用户明确批准执行：

`Plan Approved`

收到后进入 Execute，按最小切口顺序实现：

1. `src/plugin/export/pipeline.ts`
2. `src/plugin/main.ts`
3. `src/shared/messages.ts`
4. `src/shared/bridge.ts`
5. `src/shared/figma-link.ts`
6. `src/ui/bridge-client.ts`
7. `src/ui/App.svelte`
8. `bridge/*`
9. `mcp/*`
