# GitHub Actions: tag 自动构建与发布

## 目标

在推送版本 tag 后，自动安装依赖、执行 `npm run build`，并创建对应的 GitHub Release。

## 发布策略

- 触发条件：push `v*` tag
- 构建命令：`npm ci`、`npm run build`
- 发布产物：`manifest.json` + `dist/` 打包成 zip
- 版本命名：直接使用本次推送的 tag 作为 release tag
- 分支兼容：不再依赖向 `main` 推送版本提交

## Done Contract

- 仓库存在可执行的 GitHub Actions workflow
- workflow 在推送 `v*` tag 时自动构建
- workflow 会创建 GitHub Release，并上传 zip 附件
