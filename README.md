# figma to pen

`figma to pen` 是一个 Figma 插件，用来将当前选中的 Figma 节点导出为 `Pencil.dev` 可使用的 `.pen` 文件。

当前仓库已经完成基于 TypeScript 的重构，主线程、UI、导出流水线、节点工厂和关键工具模块都已拆分，并使用 `Vite` 进行构建。

## 功能概览

- 导出当前选中节点为 `.pen`
- 保留组件、实例、层级、Auto Layout、文本、图片、矢量等结构信息
- 导出时附带图片资产，便于回到 Pencil.dev 后继续使用

## 当前能力边界

### 已支持

- Frame / Group / Rectangle / Ellipse / Line / Vector / Text / Ref 实例
- 组件与实例映射
- Auto Layout 基础属性映射
- 文本内容、字号、字重、对齐、行高
- 纯色、图片填充、基础渐变
- 描边、圆角、阴影、不透明度
- `.pen` 变量解析

### 已知限制

- 插件当前仅声明为 `figma` 编辑器插件，不支持 FigJam
- 复杂 SVG 路径中的部分弧线命令会退化为折线近似
- 字体需要 Figma 当前环境可用；不可用时会回退到默认字体
- 渐变虽已进入主链路，但复杂设计稿仍建议结合实际文件回归验证

## 工作流

### 从 Figma 导出 `.pen`

1. 在 Figma 中运行插件，并保持目标节点处于选中状态。
2. 点击导出按钮。
3. 插件会生成 `.pen` 文件；若包含图片资产，会一并打包下载。

## 安装与开发

### 本地开发安装

1. 克隆仓库：

```bash
git clone https://github.com/FangHaoming/pencil-to-figma.git
cd pencil-to-figma
```

1. 安装依赖：

```bash
npm install
```

1. 构建插件产物：

```bash
npm run build
```

1. 在 Figma Desktop 中选择 `Plugins` -> `Development` -> `Import plugin from manifest...`
2. 选择仓库根目录下的 `manifest.json`
3. 运行 `figma to pen`

### 开发命令

- `npm run build`：构建插件主线程和 UI 到 `dist/`
- `npm run dev`：以 watch 模式持续构建
- `npm run typecheck`：执行 TypeScript 类型检查
- `npm test`：运行模块化测试

## 项目结构

```text
pencil-to-figma/
├── dist/                     # 构建输出，manifest 直接引用
├── src/
│   ├── plugin/
│   │   ├── export/          # 导出流水线与 node -> pen 转换
│   │   ├── nodes/           # 各类节点创建与实例处理
│   │   └── utils/           # color / image / layout / svg 等工具
│   ├── shared/              # .pen 类型与 UI/插件消息协议
│   └── ui/                  # 插件 UI 逻辑
├── tests/                   # 核心导出与工具模块测试
├── manifest.json
├── ui.html
├── vite.plugin.config.ts
├── vite.ui.config.ts
└── README.md
```

## 核心实现

### 入口

- `src/plugin/index.ts`：插件入口
- `src/plugin/main.ts`：主线程消息分发与导出调度
- `src/ui/main.ts`：UI 交互、文件读取、导出下载

### 导出链路

- `src/plugin/export/pipeline.ts`
  - 收集当前选区节点
  - 调用节点转换器生成 `.pen`
  - 收集图片资产
- `src/plugin/export/node-to-element.ts`
  - 把 Figma 节点映射回 Pencil 元素

### 节点创建

- `src/plugin/nodes/factory.ts`
- `src/plugin/nodes/create-frame.ts`
- `src/plugin/nodes/create-shape.ts`
- `src/plugin/nodes/create-text.ts`
- `src/plugin/nodes/create-image.ts`
- `src/plugin/nodes/create-vector.ts`
- `src/plugin/nodes/instances.ts`

### 共享类型

- `src/shared/pen.ts`：`.pen` 文档、元素、填充、描边、效果等类型
- `src/shared/messages.ts`：UI 与插件主线程通信协议

## 测试

当前测试已经收口到 `tests/*.test.ts`。

已覆盖模块：

- `tests/color-utils.test.ts`
- `tests/svg-utils.test.ts`
- `tests/node-to-element.test.ts`
- `tests/image-utils.test.ts`

推荐开发自检顺序：

1. `npm test`
2. `npm run typecheck`
3. `npm run build`

## `.pen` 数据示例

```json
{
  "version": "2.7",
  "variables": {
    "primary": "#0066ff"
  },
  "children": [
    {
      "type": "frame",
      "name": "Button",
      "layout": "horizontal",
      "padding": [12, 24],
      "gap": 8,
      "fill": "$primary",
      "cornerRadius": 8,
      "children": [
        {
          "type": "text",
          "content": "Click me",
          "fill": "#ffffff",
          "fontSize": 14,
          "fontWeight": "600"
        }
      ]
    }
  ]
}
```

## 维护说明

- 构建输出由 `manifest.json` 指向 `dist/code.js` 和 `dist/ui.html`
- 插件运行时不会依赖额外服务端
- 如果后续继续扩展导出或重新引入互转能力，优先同步更新：
  - `docs/figma-pencil-互转功能设计.md`

## 相关链接

- [Pencil.dev](https://pencil.dev)
- [Figma Plugin API](https://www.figma.com/plugin-docs/)
