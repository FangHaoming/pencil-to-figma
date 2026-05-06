# Export `.pen` Only UI And Plugin Rename

## Phase

Review

## Approval Status

Plan Approved

## Spec Path

`docs/specs/export-pen-only-ui-and-plugin-rename.md`

## Goal

将当前插件 UI 简化为只保留导出 `.pen` 的单一页面，移除导入 `.pen` 的入口与交互链路，并同步修改插件名称；在此基础上，继续彻底清理 `src/plugin/import/` 及相关历史导入代码、测试与孤儿类型，使仓库实现与产品定位一致。

补充需求：导出时按将要导出的文件数量显示进度，让用户能看到当前导出进展，而不是只显示固定的“正在导出...”。

## In Scope

- 将 `src/ui/App.svelte` 从“导入 / 导出”双标签页改为单页导出界面
- 移除本次 UI 流程中不再需要的导入相关状态、事件处理、消息分支与文案
- 清理 `src/shared/messages.ts`、`src/plugin/main.ts` 中与 UI 导入流程绑定的消息类型和处理逻辑
- 修改插件展示名称及相关可见文案
- 删除 `src/plugin/import/pipeline.ts`
- 删除仅覆盖历史导入逻辑的测试
- 删除只被历史导入链路使用、现已无引用的共享类型
- 在导出打包与下载阶段，按文件总数显示进度

## Out Of Scope

- 不改动 `.pen` 导出数据结构
- 不调整 bridge / mcp 新增能力
- 不对导出算法做功能增强
- 不重写历史设计文档的大段章节，仅做必要的代码侧一致性清理

## Context Sources

- `manifest.json`
- `ui.html`
- `src/ui/App.svelte`
- `src/plugin/main.ts`
- `src/shared/messages.ts`
- `src/shared/pen.ts`
- `README.md`

## Codemap Used

- None

## Research Findings

- 当前 UI 主体原本在 `src/ui/App.svelte`，包含 `import` / `export` 两个 tab；导入 UI 占据了大部分状态和模板逻辑。
- `src/shared/messages.ts` 里原本声明了 `ready-to-place`、`import-pen`、`place-import` 等仅服务导入流程的消息。
- `src/plugin/main.ts` 原本同时承载导入与导出逻辑；其中导出能力可独立运行，导入消息分支可以与 UI 简化一起裁剪。
- 插件名称当前已统一到 `manifest.json`、`ui.html`、`README.md`、运行日志文案等主要可见位置。
- 仓库当前已有较多未提交改动，执行时只触碰了本次需求相关文件，未干扰 bridge / mcp 工作。
- 在第二轮清理前，`src/plugin/import/` 下只剩 `pipeline.ts` 一个文件，运行时代码中已无任何引用。
- `tests/import-pipeline.test.ts` 是历史导入链路唯一剩余测试，已与实现一起删除。
- `src/shared/pen.ts` 中的 `PenAnalysis` 仅被历史导入链路使用，已移除。
- 历史主设计文档中的 `.pen -> Figma` 章节、旧消息协议与“双向转换”叙事已同步清理，当前文档定位已与导出专用产品形态一致。
- 当前导出按钮只显示固定的“正在导出...”，但 UI 已能拿到 `assets.length`，因此可以按 `.pen` 文件 1 个加图片资源数计算总文件数。
- 现有打包逻辑在 `downloadExportPackage()` 内部顺序处理 zip entries，适合在同一函数里逐项回调进度，不需要改插件主线程消息协议。
- 用户复测发现现有进度只覆盖 UI 端 zip 打包阶段，因此在主线程的 `.pen` 结构生成和图片资源导出阶段仍会出现“长时间无反馈，最后一闪而过”的问题。
- 更合适的方案是由主线程持续上报“节点转换 + 图片资源导出”的联合进度，UI 端再补充 zip 打包阶段进度，形成完整链路反馈。

## Open Questions

- None

## Risks

- 删除历史导入测试后，仓库不再保留 `.pen -> Figma` 的自动化校验；若未来重新恢复导入能力，需要重新补测。
- 历史导入相关信息现在主要只存在于本 spec 的变更记录中；若未来恢复导入能力，需要重新补充设计文档。
- 如果只更新按钮文字、不更新状态提示，用户仍可能看不清当前已处理到第几个文件；需要统一按钮和状态文案。

## Plan

1. 确认新的插件名称，以及文档同步范围。
2. 重构 `src/ui/App.svelte` 为单页导出 UI，保留导出状态反馈与下载流程。
3. 清理 `src/shared/messages.ts` 中仅服务导入流程的消息类型。
4. 清理 `src/plugin/main.ts` 中不再被 UI 使用的导入消息处理和相关引用。
5. 同步更新插件名称在 `manifest.json`、`ui.html` 与必要文案中的展示。
6. 运行 `typecheck` 与相关测试，检查最近改动文件 lint / type 状态。
7. 删除 `src/plugin/import/pipeline.ts` 历史实现文件。
8. 删除 `tests/import-pipeline.test.ts` 历史测试，并移除 `PenAnalysis` 等孤儿类型。
9. 重新运行 `typecheck`、`npm test`、`npm run build` 验证清理后的仓库状态。
10. 在 `src/ui/App.svelte` 增加导出进度状态，按 `1 + assets.length` 显示当前处理文件数 / 总文件数。
11. 复跑 `typecheck`、`npm test`、`npm run build`，确认进度展示没有引入回归。

## Active Checklist

- [x] 确认新插件名称：`figma to pen`
- [x] 确认文档同步范围：包含 README 与设计文档
- [x] 收到 `Plan Approved`
- [x] 简化 UI 为单页导出
- [x] 清理导入消息与主线程分支
- [x] 同步插件名称与文档
- [x] 完成第一轮验证并回写结果
- [x] 删除 `src/plugin/import/pipeline.ts`
- [x] 删除历史导入测试与孤儿类型
- [x] 完成二次验证并回写结果
- [x] 增加按导出文件数量展示的进度
- [x] 完成三次验证并回写结果
- [x] 补齐主线程导出与图片资源阶段进度
- [x] 完成四次验证并回写结果

## File Changes

- `src/ui/App.svelte`
  - 移除导入页签、上传/拖拽/放置流程、图标抓取逻辑
  - 重构为单页导出 UI，并保留导出状态反馈与下载逻辑
  - 增加按导出文件数量展示的进度状态与按钮文案
- `src/shared/messages.ts`
  - 删除仅服务导入流程的共享消息类型，收敛为导出相关协议
  - 新增主线程到 UI 的 `export-progress` 进度消息
- `src/plugin/main.ts`
  - 删除导入消息处理、导入辅助函数与相关依赖
  - 保留导出命令与快速下载命令
  - 增加导出工作量预估与主线程进度上报
- `src/plugin/export/types.ts`
  - 为导出上下文补充进度快照与回调
- `src/plugin/export/node-to-element.ts`
  - 在节点递归转换时累计节点处理进度
- `src/plugin/utils/image.ts`
  - 在新图片资源真正导出时累计资源进度
- `src/shared/pen.ts`
  - 删除仅被历史导入链路使用的 `PenAnalysis`
- `manifest.json`
  - 插件名称改为 `figma to pen`
- `ui.html`
  - 页面标题改为 `figma to pen`
- `README.md`
  - 改为导出插件定位，移除历史导入目录和导入测试说明
- `docs/figma-pencil-互转功能设计.md`
  - 收口为导出专用设计文档，移除 `.pen -> Figma` 章节、旧消息协议和双向转换叙事
- `docs/pencil-to-figma-architecture.html`
  - 同步插件名称与导出专用架构描述
- 删除 `src/plugin/import/pipeline.ts`
- 删除 `tests/import-pipeline.test.ts`
- 删除空目录 `src/plugin/import/`

## Validation

- 第一轮验证
  - `npm run typecheck` ✅
  - `npm test` ✅
  - `npm run build` ✅
- 第二轮验证
  - `npm run typecheck` ✅
  - `npm test` ✅
  - `npm run build` ✅
- 第三轮验证
  - `npm run typecheck` ✅
  - `npm test` ✅
  - `npm run build` ✅
- 第四轮验证
  - `npm run typecheck` ✅
  - `npm test` ✅
  - `npm run build` ✅

## Review Notes

- 当前用户可见产品形态已收敛为单页导出 `.pen`
- 历史导入运行时代码、测试和孤儿类型均已从仓库中移除
- 主设计文档已收口为导出专用说明；当前残留的导入相关内容主要只存在于本 spec 的变更记录中
- 导出过程中现已按实际导出文件数量显示进度，计数口径为 `.pen` 文件 1 个加有效图片资源数
- 当前导出进度已覆盖主线程的 `.pen` 结构生成、图片资源导出，以及 UI 端 zip 打包三个阶段，不再只停留在最后的打包阶段

## Next Action

向用户汇报完整导出进度链路已完成，并根据需要继续优化视觉表现。
