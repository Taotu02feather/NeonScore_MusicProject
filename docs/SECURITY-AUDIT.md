# 安全自查报告 / Security Audit

> 项目：NeonScore Music Project v0.1.0
> 日期：2026-11-15
> 范围：整个仓库（`index.html`、`css/`、`js/`、`scores/`、`tools/`、`editors/`、`docs/`、仓库根目录配置）
> 环境：Windows + Chrome 155（实际浏览器测试）；Node.js 仅用于可选构建脚本
> 性质：代码审查 + 实际浏览器冒烟测试；**不是**第三方渗透测试，未做 fuzzing

## 结论摘要

- 当前没有发现 `eval`、`new Function`、`vm`、`child_process`、远程脚本加载、自动更新、外部 telemetry、凭据硬编码或混淆代码。
- 构建脚本中的 Node `vm` 已移除：`tools/build-*.js` 现在直接 `require()` 浏览器共享模块，并用 `module.exports` 导出，不再“加载并执行本地源码”。
- CSP 已加到 `index.html`，并在 Chrome 中实测：应用加载、MIDI 导入、MusicXML/MXL 导入、WAV 下载、工程 JSON 下载均正常，没有 CSP 拦截。
- 已修复两处历史**可疑**问题：
  1. 导入工程 JSON 的 `track.id` 未校验，曾可能进入 `innerHTML` 的 `data-track` 属性（XSS 面）。
  2. `.mxl` ZIP 解压缺少条目数量和大小上限（压缩炸弹 → 浏览器 OOM/卡死）。
- 这是一个纯浏览器应用，没有 Electron、没有 `src/`、没有 `scripts/`、没有根 `package.json`、没有 npm 依赖、没有安装脚本。
- 本次复测范围仍是 Chrome；未做 fuzzing、Firefox/Safari 和真实恶意样本测试。

## 逐项检查

| 检查项 | 结论 | 位置 | 说明 |
| --- | --- | --- | --- |
| 动态代码执行：`eval` | 安全 | 全仓库检索无匹配 | 运行时和构建脚本都没有 `eval`。 |
| 动态代码执行：`new Function` | 安全 | 全仓库检索无匹配 | 没有字符串转函数。 |
| 动态代码执行：`vm` | 无（已移除） | `tools/build-samples.js:10-18`；`tools/build-touhou-edit.js:9-18`；`js/util.js:180`、`js/theory.js:286`、`js/model.js:618`、`js/midi.js:442`、`js/textscore.js:494` | 构建脚本改为静态 `require("../js/...")` + `module.exports`，不再创建 `vm` 上下文，也不执行读入的源码字符串。浏览器仍通过 `<script>` 加载同一批模块。 |
| 动态 `require` / `import` | 安全 | `index.html:351-362` | 所有 `<script src>` 都是写死的相对路径；没有按文件名/用户输入拼 `require` 或 `import`。 |
| 从网络/文件读入后直接执行 | 安全 | `js/midi.js`、`js/musicxml.js`、`js/textscore.js`、`js/app.js` | MIDI/XML/文本/JSON 只被解析成数据；没有 `eval`、`Function`、`script` 注入。 |
| 子进程：`child_process` / `exec` / `spawn` | 安全 | 全仓库检索无匹配 | 没有子进程调用。`打开 NEONSCORE.bat:3` 只有 `start "" "%~dp0index.html"`，不含用户输入，也不拼接 shell 命令。 |
| 网络请求：`fetch` / `axios` / XHR / WebSocket | 安全 | `js/` 检索无匹配 | 应用运行时不发网络请求；没有上传乐谱、本地路径或 telemetry。`index.html` 只加载本地 CSS/JS。 |
| 下载并执行远程脚本 | 安全 | `index.html:351-362` | 没有远程 `<script>`、没有自动更新、没有从 GitHub/npm 拉取运行时脚本。 |
| 外部链接 | 安全 | `js/app.js:1251`；`README.md`；`scores/README.md:61,64`；`editors/vscode-nst/syntaxes/nst.tmLanguage.json:2` | 仅版权署名链接和 VS Code 语法文件的 `$schema` 标识；`target="_blank"` 带 `rel="noopener"`；应用不会自动请求这些 URL。 |
| 文件系统：浏览器运行时 | 安全 | `js/util.js:111-136`；`js/app.js:1061` | 使用 `FileReader` 读取用户选择的本地文件；下载用 Blob + `<a download>`；不直接写任意路径，不递归删除。单文件导入上限 25MB。 |
| 文件系统：构建脚本 | 安全（受信任本地环境） | `tools/build-samples.js:19-23,135-196`；`tools/build-touhou-edit.js:20-23,43,116-132` | 只读写 `__dirname/..` 下的 `scores/`、`TouhouMid/`；路径是固定常量，不接收用户输入；没有 `rm` / `rmSync` / `rimraf` / 递归删除。 |
| 路径穿越 / 下载文件名 | 安全（已加固） | `js/util.js:161` | `safeFilename()` 去掉 `\ / : * ? " < > \|` 和空白；拒绝 `.` / `..`；下载名不参与服务端路径拼接。 |
| `fs.realpath` 校验 | 安全（当前不需要） | — | 构建脚本不使用用户提供的路径，因此没有 realpath 白名单；如果以后增加“按用户路径写入”，必须补 `path.resolve` + `fs.realpath` + 根目录包含校验。 |
| HTML 注入 / XSS | 安全（原可疑，已修复） | `js/model.js:535,544,548`；`js/app.js:164,1219,1221` | 导入工程 JSON 的 `track.id` / `note.id` 现在只允许 `[A-Za-z0-9_-]{1,80}`；轨道 tab 对 id/color/name 做 escape；示例卡颜色校验为六位 hex。原先恶意 `track.id` 可打断 `data-track="..."` 属性并注入事件处理器。 |
| `innerHTML` 使用 | 安全（已约束） | `js/app.js:124,128,161,203,242,264,286,1155,1221` | 动态用户数据（曲名、轨道名、和弦、示例卡文本）均经过 `escapeHtml` 或 `textContent`；`openModal()` 的 body 只来自内部静态模板；`track.id`/color 已白名单化。 |
| `.mxl` ZIP 解压 / 压缩炸弹 | 安全（原可疑，已修复） | `js/musicxml.js:302-370` | 限制最多 256 条目、单条目 16MB、总解压 48MB；校验中央目录/局部头/数据边界；只解压 `META-INF/container.xml`、`.xml`、`.musicxml`，不解压图片等大条目。 |
| MusicXML `DOMParser` / XXE | 安全 | `js/musicxml.js:39-45` | 用浏览器 `DOMParser` 解析 `application/xml`，不把 XML 插入页面；没有配置外部实体解析，也没有网络请求。 |
| 凭据 / 隐私 | 安全 | `js/`、`index.html` 检索无匹配 | 没有 API key、token、密码、Bearer、`.env`；应用不上传乐谱；构建脚本只打印音符数等统计，不打印敏感路径。 |
| 日志 | 安全 | `js/` 无 `console.log` | 运行时没有控制台日志；构建脚本有统计输出，不包含凭据。 |
| 混淆代码 | 安全 | 全仓库 | 没有 `atob`/`btoa`、大段 base64、压缩/混淆 JS。`scores/library.js` 约 230KB，是 `JSON.stringify` 的可读示例数据；`docs/preview.png` 是图片；`TouhouMid/*.mid` 是二进制 MIDI 源文件。 |
| 来源不明的 `.js` | 安全（本地生成） | `scores/library.js`、`scores/local-library.js` | 两者由本地 `tools/build-*.js` 生成，是 `window.NEON_*_LIBRARY = [...]` 数据；不含远程地址、不动态加载。`editors/vscode-nst/` 只有声明文件、语法 JSON 和片段。 |
| Electron 配置 | 安全（不适用） | 无 `electron/`、`main`、`preload` | 项目不是 Electron 应用；没有 `nodeIntegration`、`contextIsolation`、`webSecurity`、`ipcRenderer` 或 `preload` 暴露面。 |
| 第三方 npm 依赖 | 安全 | 根目录无 `package.json`；`editors/vscode-nst/package.json` | 没有 `dependencies` / `devDependencies`；VSCode 扩展仅声明语言/语法/片段，无 `main`、无安装脚本。 |
| `postinstall` / `preinstall` | 安全 | 全仓库检索无匹配 | 没有任何 npm 生命周期脚本。 |
| 构建配置 / 模板 | 安全（不适用） | 无 `src/`、`scripts/`、`vite.config`、`webpack.config`、`tsconfig` | 纯静态 HTML/CSS/JS，无打包器、无转译器、无 Node 服务器。 |
| CSP | 有（已添加并实测） | `index.html:6` | `default-src 'self' file: blob: data:; script-src 'self' file:; style-src 'self' file: 'unsafe-inline'; img-src 'self' data: blob: file:; media-src 'self' blob: file:; font-src 'self' data: file:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; frame-src 'none'`。用于 file:// 双击场景放行本地脚本，允许 data: favicon 与 blob: 下载；不允许远程脚本/连接。实测无 CSP 拦截。 |

## 发现与处理详情

### 1. 导入工程 JSON 的 track.id 进入 innerHTML（原可疑，已修复）

**发生了什么：** `normalizeSong()` 保留了来自工程 JSON 的任意字符串 `track.id`；`buildTrackTabs()` 把它直接插进：

```html
<div class="track-tab" data-track="${track.id}" ...>
```

**最坏情况：** 构造恶意 `.nsscore.json`，让 `track.id` 包含 `"` 和事件属性，可能在本机应用上下文执行脚本；因为应用通过 `file://` 打开，脚本可读取本地可访问资源并触发下载。

**修复：**

- `js/model.js:535,544`：id 必须是 `[A-Za-z0-9_-]{1,80}`，否则生成新的 `U.uid()`。
- `js/app.js:164`：对 `track.id` / `track.color` 再做 `escapeHtml`。
- `js/model.js:548`：颜色继续只接受 `#rrggbb`。
- `js/app.js:1219`：示例卡颜色也只接受 `#rrggbb`。

**验证：** 用 `id: 'x" onmouseover="alert(1)'` 的恶意工程调用 `normalizeSong()`，返回的 id 被替换为安全 id，页面无异常。

### 2. `.mxl` 解压缺少上限（原可疑，已修复）

**发生了什么：** `readZip()` 先读取中央目录，再对 deflate 条目调用 `DecompressionStream`；原实现只在一个条目解压后检查 `data.length > 8MB`，压缩炸弹可以在检查前就占用大量内存。

**最坏情况：** 打开恶意 `.mxl` 导致浏览器内存耗尽/页面卡死。

**修复：**

- `js/musicxml.js:302-304`：`MAX_ENTRIES=256`、`MAX_ENTRY_BYTES=16MB`、`MAX_TOTAL_BYTES=48MB`。
- `js/musicxml.js:317-356`：中央目录、条目数、声明大小、累计解压大小、局部头和数据的边界检查。
- 只解压容器和 XML / MusicXML 条目，跳过图片等不需要的内容。
- `js/musicxml.js:369`：解压后的二次大小检查。

**验证：** 用 Python `zipfile` 生成一个 deflate 压缩的最小 `.mxl`，在 Chrome 中导入成功（4 小节 / 164 音符）。未做模糊测试；上限参数可在未来根据真实乐谱调整。

### 3. Node `vm` 出现在构建脚本（已移除）

**原问题：** `tools/build-samples.js` 和 `tools/build-touhou-edit.js` 用 `vm` 在 Node 里加载浏览器端模块，以复用示例生成逻辑。`vm` 不是安全边界；如果本地 `js/*.js` 被替换，运行构建脚本会以开发者权限执行。

**处理：**

- 六个共享模块（`util`、`theory`、`presets`、`model`、`midi`、`textscore`）改为同时支持浏览器全局和 CommonJS：
  - 顶部使用 `typeof window !== "undefined" ? window : globalThis`；
  - 底部用 `if (typeof module !== "undefined" && module.exports) module.exports = ...` 导出。
- `tools/build-samples.js:10-18` 和 `tools/build-touhou-edit.js:9-18` 改为静态 `require("../js/...")`，不再 `require("vm")`，不再读入源码字符串执行。
- 浏览器端 `<script>` 加载路径和全局 `window.NS` 行为保持不变。

**原因：** 去掉“可执行任意本地代码”的构建期入口，同时保持示例生成逻辑可复用。

### 4. CSP（已添加并实测）

**处理：** `index.html:6` 增加：

```text
default-src 'self' file: blob: data:;
script-src 'self' file:;
style-src 'self' file: 'unsafe-inline';
img-src 'self' data: blob: file:;
media-src 'self' blob: file:;
font-src 'self' data: file:;
connect-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none';
worker-src 'none';
frame-src 'none';
```

**为什么保留 `file:` 和 `blob:`：** 应用通过 `file://` 双击打开，本地脚本需要 `file:`；WAV/JSON 下载用 Blob URL，需要 `blob:`；favicon 是 `data:`。`script-src` 仍不允许 `data:`/远程源，`connect-src 'none'` 禁止网络连接。

**实测：** 应用正常打开（5 轨 / 362 音符）；MIDI 和 MXL 导入成功；WAV（2,257,964 字节）与工程 JSON（28,249 字节）成功下载；控制台无 CSP 拦截。

## 本次实际改动的代码

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `js/model.js:535,544` | 工程导入的 note/track id 白名单校验 | 阻止 XSS 属性注入 |
| `js/app.js:164` | 轨道 tab 的 id/color escape | 纵深防御 |
| `js/app.js:1219` | 示例卡颜色六位 hex 校验 | 阻止 inline style 注入 |
| `js/musicxml.js:302-370` | ZIP 条目/大小/边界限制 + XML 过滤 | 阻止压缩炸弹/越界读取 |
| `js/util.js:161` | 拒绝 `.` / `..` 下载文件名 | 文件名安全 |
| `js/util.js:3,180` 等 6 个模块 | 增加 CommonJS 导出，同时保留浏览器全局 | 让构建脚本可以 `require`，替代 `vm` |
| `tools/build-samples.js:10-18` | 删除 `vm`，改静态 `require` | 移除构建期任意本地代码执行入口 |
| `tools/build-touhou-edit.js:9-18` | 删除 `vm`，改静态 `require` | 同上 |
| `index.html:6` | 增加 CSP | 限制脚本/样式/网络来源 |

未删除任何乐谱生成、音频、导入导出功能。未改动音频合成、自动编曲、钢琴卷帘核心逻辑。

## 复测记录

- 首屏：5 轨 / 362 音符，无异常。
- 示例库：3 个内置 + 1 个 LOCAL，共 4 个；LOCAL 东方工程 1,171 音符 / 6 轨加载成功。
- 完整 `th06_05.mid`：14 轨 / 4,608 音符 / 57 小节导入成功；播放头推进；无异常。
- 压缩 `.mxl`：导入成功。
- CSP 下 MIDI 导入：703 音符 / 6 轨；CSP 下 MXL 导入：164 音符 / 5 轨。
- CSP 下 WAV：2,257,964 字节下载成功；工程 JSON：28,249 字节下载成功；无 CSP 拦截。
- NST 导出：109,153 字符 / 4,482 行，含绝对定位、多轨、鼓组。
- 恶意 track id：被安全替换。
- 未覆盖：Firefox/Safari、真实恶意样本 fuzzing、Web MIDI、超大工程压力测试。

## 后续开发红线

1. 运行时禁止 `eval` / `new Function` / `vm` / 动态 `require`。
2. 禁止 `child_process` 拼 shell；必须用 `execFile` + 参数数组 + 白名单路径。
3. 禁止把乐谱、路径、工程内容发往网络，禁止远程脚本和自动更新。
4. 用户数据进 HTML 必须 `escapeHtml` / `textContent`；ID/颜色走白名单。
5. 文件路径必须 `path.resolve` + `fs.realpath` + 根目录包含校验；删除操作必须显式确认目标。
6. ZIP/MXL 必须限制条目数、单条目大小、总解压大小。
7. 新增依赖必须记录来源、版本、用途，并检查 `postinstall`。
8. 不为了“看起来安全”删掉乐谱生成核心功能；先报告，再做最小修复。
