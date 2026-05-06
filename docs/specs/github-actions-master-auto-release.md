# GitHub Actions: master 自动构建与发布

## 目标

在 `master` 分支每次 push 后，自动安装依赖、执行 `npm run build`，并创建一个新的 GitHub Release。

## 发布策略

- 触发条件：push 到 `master`
- 构建命令：`npm ci`、自动执行 `patch` 版本递增、`npm run build`
- 发布产物：`manifest.json` + `dist/` 打包成 zip
- 版本命名：直接使用递增后的 `package.json` 版本号作为 release tag
- 版本回写：workflow 会提交 `package.json` 和 `package-lock.json` 到 `master`
- 循环保护：版本提交带 `[skip ci]`，避免 workflow 自触发

## Done Contract

- 仓库存在可执行的 GitHub Actions workflow
- workflow 在 `master` push 时自动递增版本并构建
- workflow 会创建 GitHub Release，并上传 zip 附件
