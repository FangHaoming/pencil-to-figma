# Figma Selection Link -> Local Bridge MCP Phase 1

## 0. Meta

- Task: `figma-selection-link-to-local-bridge-mcp-phase1`
- Phase: `Execute`
- Approval Status: `Plan Approved, Implemented Pending Manual Validation`
- Goal: 基于 Figma selection link，通过本地 `plugin UI + bridge + MCP` 获取节点设计信息
- Primary Path: `link -> parse(fileKey,nodeId) -> local mcp -> local bridge -> plugin ui -> plugin main -> return structured result`

## 1. Context Sources

- 当前仓库：`pencil-to-figma`
- 现有插件入口：
  - `src/plugin/main.ts`
  - `src/ui/App.svelte`
  - `manifest.json`
- 现有导出复用点：
  - `src/plugin/export/node-to-element.ts`
  - `src/plugin/utils/image.ts`
- 新增本地能力：
  - `src/shared/figma-link.ts`
  - `src/shared/bridge.ts`
  - `bridge/*`
  - `mcp/*`

## 2. Goal

提供一个本地可用的 MCP 方案，绕过官方 Figma MCP 的读接口调用限制。

Phase 1 核心能力：

1. 解析 Figma selection link
2. 按 `fileKey` 匹配在线插件会话
3. 读取节点 `metadata`
4. 读取节点 `design context`
5. 读取节点 `screenshot`
6. 读取节点 `variable defs`
7. `download image`
8. `export node png`

补充调用提示词：`用figma mcp获取设计稿`

## 3. In Scope

- 本地插件桥接
- 单节点 selection link 工作流
- `get_bridge_status`
- `get_metadata_from_figma_selection_link`
- `get_design_context_from_figma_selection_link`
- `get_screenshot_from_figma_selection_link`
- `get_variable_defs_from_figma_selection_link`
- `download_image_from_figma_selection_link`
- `export_node_png_from_figma_selection_link`

## 4. Out of Scope

- 写回 Figma
- 对齐官方 MCP 全量工具
- 多节点批量抓取
- 自动打开 Figma 文件
- 自动切换到目标页面
- 完整远程无插件方案

## 5. Resolved Decisions

### 5.1 运行形态

- 采用本地桥接模式
- 要求目标 Figma 文件已打开且插件 UI 在线
- bridge 端口默认 `3210`

### 5.2 设计上下文来源

- `design context` 不复刻官方 React + Tailwind 文本
- 不复用 `.pen` / Pencil 导出链路
- 返回更接近 Figma API 字段命名和分层的结构化节点信息
- 主要字段包括 `absoluteBoundingBox`、`absoluteRenderBounds`、`relativeTransform`、`fills`、`strokes`、`effects`、`layout`、`text`、`component`、`variables`、`children`

### 5.3 图片相关能力

- `screenshot` 语义：节点整体 PNG 截图
- `download image` 语义：优先下载节点上的原始 image fill 资源；若节点命中 `.pen` 导出的 rasterize 规则（例如 locked group），则导出整个节点 PNG
- `export node png` 语义：显式把节点导出成 PNG

## 6. Architecture

### 6.1 Components

- Cursor MCP Client
- Local MCP Server
- Local WebSocket Bridge
- Figma Plugin UI
- Figma Plugin Main

### 6.2 Flow

`Cursor -> local MCP -> bridge -> plugin ui -> plugin main -> structured result -> Cursor`

## 7. Stable Contracts

### 7.1 Link Parsing

文件：`src/shared/figma-link.ts`

- 支持 `design` / `file` / `make` / `board` 形式链接
- 支持 `design/.../branch/...` 分支链接
- 规范化 `node-id`：`- -> :`

### 7.2 Bridge Protocol

文件：`src/shared/bridge.ts`

Capabilities:

- `read.metadata`
- `read.designContext`
- `read.screenshot`
- `read.variableDefs`
- `read.downloadImage`

Bridge Commands:

- `bridge.getRuntimeInfo`
- `bridge.read.metadata`
- `bridge.read.designContext`
- `bridge.read.screenshot`
- `bridge.read.variableDefs`
- `bridge.read.downloadImage`

Plugin Events:

- `plugin.hello`
- `plugin.result`
- `plugin.error`
- `plugin.pong`

### 7.3 Tool Names

- `get_bridge_status`
- `get_metadata_from_figma_selection_link`
- `get_design_context_from_figma_selection_link`
- `get_screenshot_from_figma_selection_link`
- `get_variable_defs_from_figma_selection_link`
- `download_image_from_figma_selection_link`
- `export_node_png_from_figma_selection_link`

## 8. Implemented File Changes

### 8.1 New Files

- `src/shared/figma-link.ts`
- `src/shared/bridge.ts`
- `src/plugin/bridge-read.ts`
- `src/ui/bridge-client.ts`
- `bridge/server.ts`
- `bridge/sessions.ts`
- `bridge/tasks.ts`
- `mcp/server.ts`
- `mcp/tools/shared.ts`
- `mcp/tools/get-bridge-status.ts`
- `mcp/tools/get-metadata-from-selection-link.ts`
- `mcp/tools/get-design-context-from-selection-link.ts`
- `mcp/tools/get-screenshot-from-selection-link.ts`
- `mcp/tools/get-variable-defs-from-selection-link.ts`
- `mcp/tools/download-image-from-selection-link.ts`
- `mcp/tools/export-node-png-from-selection-link.ts`
- `tests/figma-link.test.ts`

### 8.2 Updated Files

- `src/shared/messages.ts`
- `src/plugin/main.ts`
- `src/ui/App.svelte`
- `manifest.json`
- `package.json`
- `tsconfig.json`

## 9. Validation Status

### 9.1 Automated Validation

- [x] `npm run typecheck`
- [x] `npm test`

### 9.2 Pending Manual Validation

- [ ] 启动插件并确认 UI 能连上 `ws://localhost:3210`
- [ ] 启动本地 MCP server：`npm run mcp`
- [ ] 在真实 Figma 文件中验证 `plugin.hello`
- [ ] 用真实 selection link 验证 5 个核心工具

## 10. Error Contract

当前固定错误文案：

- `Invalid Figma selection link`
- `Missing node-id in Figma link`
- `No plugin session connected`
- `No plugin session matches fileKey`
- `Plugin capability not supported: <capability>`
- `Plugin task timed out`
- `Plugin returned error: <message>`
- `Node not found or not accessible`

## 11. Active Checklist

- [x] 实现 `src/shared/figma-link.ts`
- [x] 实现 `src/shared/bridge.ts`
- [x] 扩展 `src/shared/messages.ts`
- [x] 在 `src/plugin/main.ts` 接入 bridge command 分发
- [x] 新增 `src/plugin/bridge-read.ts`
- [x] 新增 `src/ui/bridge-client.ts`
- [x] 在 `src/ui/App.svelte` 接入 bridge client
- [x] 实现 `bridge/server.ts`
- [x] 实现 `bridge/sessions.ts`
- [x] 实现 `bridge/tasks.ts`
- [x] 实现 `mcp/server.ts`
- [x] 实现 MCP tools
- [x] 补充 link parsing tests
- [ ] 完成真实 Figma 手工链路验证

## 12. Known Gaps

- `variable defs` 当前基于 `boundVariables` 做 best-effort 提取，不保证覆盖所有变量来源
- `variable defs` 当前会递归子树，并补采 `boundVariables`、`fills`、`strokes`、`effects`、text segments 中的变量引用
- `download image` 当前支持 image fill，并对 locked group 等 rasterize 节点返回整体 PNG；显式节点 PNG 导出走 `export_node_png_from_figma_selection_link`
- 尚未验证 Figma 桌面端/网页端对本地 `ws://localhost:3210` 的实际可用性差异

## 13. Next Action

下一步应进入真实链路验证：

1. 启动 `npm run mcp`
2. 在 Figma 中加载插件
3. 确认 bridge session 上线
4. 用真实 selection link 调用 MCP 工具
