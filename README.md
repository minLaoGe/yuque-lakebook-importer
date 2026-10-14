# Yuque Lakebook Importer

将语雀导出的 `.lakebook` 知识库转换成 Obsidian Markdown 笔记。无需语雀 API Token 或 MCP，解析在本机完成。

## 安装

1. 下载 Release 中的 `main.js` 和 `manifest.json`。
2. 在笔记库创建 `.obsidian/plugins/yuque-lakebook-importer/`，将两个文件放进去。
3. 重启 Obsidian，在「设置 → 第三方插件」启用「语雀 Lakebook 导入」。

只支持桌面版 Obsidian 1.5.0 及以上；未提交到官方社区插件目录。

## 使用

1. 在语雀导出知识库为 `.lakebook`。
2. 在 Obsidian 按 `Cmd/Ctrl+P`，运行「导入语雀 .lakebook」。
3. 选择文件，按需开启「下载远程图片」，点击开始导入。
4. 查看 `语雀导入/包名/` 中的笔记、目录及导入报告。

每次导入创建新目录，不覆盖已有笔记。原始文档 JSON 保存在「原始数据」目录，以便后续恢复特殊内容。通过 Obsidian Vault API 创建文件，可让已启用的同步插件接收变更；同步成功仍取决于对应插件和账户配置。

## 功能

- 读取 tar 或 gzip tar 格式的 Lakebook。
- 兼容对象或 JSON 字符串形式的 `meta`，以及 `body_draft` 正文。
- 根据 `tocYml` 的父子关系还原目录。
- 转换常见 HTML 标题、列表、表格、代码块及部分 Lake 卡片。
- HTML/Lake 图片可下载到附件目录，失败保留原链接并记录警告。
- 将匹配导入文档的链接转换为本地链接。

## 限制与隐私

- 画板、数据表、未知卡片、复杂排版、锚点和裁剪效果可能无法完整保留。
- Markdown 原文中的图片暂不自动下载。
- 空正文会生成提示笔记，不代表正文成功转换。
- 解包上限 512 MB，单图片上限 100 MB；大包解析可能占用较多内存。
- 开启图片下载时，会请求导出内容中的 HTTPS 图片地址；不发送 API Token。
- 不上传导出包。发布项目时请勿包含个人 Lakebook、笔记或凭据。
- 首次使用请保留原始导出文件，检查导入报告后再进行批量迁移。

## 开发

```sh
npm ci
npm run build
npm test
```

`src/main.js` 为源代码；`main.js` 为包含依赖的 Obsidian 插件入口。Obsidian 运行时模块保持 external。

## 验证

通过 tar 解包、标题、粗体、表格与 Lake 代码卡片测试。开发过程中使用真实导出包验证了 49 个笔记的生成及非空草稿正文转换；该私有样本不包含在仓库中。图片下载和完整 Obsidian UI 流程尚未完成自动化验证。

## 格式依据

[语雀官方 Lakebook 格式说明](https://www.yuque.com/yuque/developer/lt69uo)

## 许可

MIT

## 1.1.0 — Readable names

Imported notes and folders use their titles. Duplicate names receive numbered suffixes, such as `Title (2)`. Repeated imports create `Book (2)` instead of timestamped folders. Images use sequential names; Yuque slugs remain in frontmatter.

### Installation
Download `main.js` and `manifest.json` from the latest release. Place them in `.obsidian/plugins/yuque-lakebook-importer/`, restart Obsidian, and enable the plugin.

### Usage
Run “导入语雀 .lakebook” in the command palette, select an exported archive, and start importing. Check the import report for unsupported content. Desktop only.
