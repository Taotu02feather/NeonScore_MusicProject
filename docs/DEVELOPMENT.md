# 开发日志 / Development Log

> NeonScore Music Project · v0.1.0 · 2026-11-15
> 本文记录架构、关键决策、实测结果、已知问题和后续开发约束。

## 1. 项目目标

把“乐谱 → 电子音乐”这条链路做完整：

1. 能导入已有的 MIDI / MusicXML / `.mxl` / 文本谱；
2. 能用钢琴卷帘手写、改音高、改起点、改长度、改力度；
3. 能一键把旋律变成有鼓、贝斯、琶音、铺底的电子波编曲；
4. 能用八音盒、方波、芯片、FM 电钢等不同音色；
5. 能把结果导出为 WAV / MIDI / 纯文本 `.nst`，继续在 DAW 或 VSCode 里编辑。

## 2. 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 运行时 | 浏览器（原生 ES2020） | 双击 HTML 即可用，不需要服务器、Node 或 Electron |
| UI | 原生 HTML/CSS + Canvas 2D | 钢琴卷帘、频谱、键盘需要逐帧绘制；避免框架体积和构建步骤 |
| 音频 | Web Audio API | 振荡器、滤波器、卷积混响、延迟、压缩、侧链都能原生完成 |
| 离线渲染 | `OfflineAudioContext` | 导出 WAV 不依赖实时播放，速度更快、不会掉帧 |
| 文件导入 | File API + `DOMParser` + 自写 MIDI 解析器 | 不上传文件；所有解析在本地完成 |
| 压缩 MusicXML | `DecompressionStream('deflate-raw')` + 自写 ZIP 目录解析 | 不引入 JSZip 等依赖 |
| 构建 | 无 | 保持“打开即用”；只有可选的示例生成脚本需要 Node |
| 测试 | Headless Chrome + CDP（外部临时脚本） | 验证真实浏览器 Web Audio / Canvas / File API |

**没有使用** React、Vue、Svelte、Vite、Webpack、Electron、Node 服务器、数据库或任何第三方 npm 运行时包。

## 3. 目录与模块

```
index.html              UI 骨架，按顺序加载本地脚本
css/style.css           霓虹视觉、布局、响应式、动画
js/util.js              通用工具：音名/MIDI、时间格式、下载、随机数、HTML escape
js/theory.js            音阶、和弦、声部连接、调性检测、和弦走向
js/presets.js           28 个音色定义、5 套鼓组、6 个音色包
js/model.js             歌曲/轨道/音符数据模型、示例曲、自动编曲、工程校验
js/midi.js              Standard MIDI File 解析 + 导出
js/musicxml.js          MusicXML 解析 + MXL ZIP 解压
js/textscore.js         NST 文本谱解析 + 序列化
js/audio.js             Web Audio 合成器、在线增量调度、离线 WAV 渲染
js/editor.js            Canvas 钢琴卷帘、键盘、动态音域、拖拽编辑
js/app.js               UI 控制器、状态、历史、导入导出、弹窗、快捷键
scores/                 乐谱输入输出、示例库、NST 格式文档
tools/                  可选的示例生成脚本（Node）
editors/vscode-nst/     VS Code 语法高亮扩展
docs/                   预览图、开发日志、安全报告
```

## 4. 数据模型

```js
song = {
  title, bpm, meter, beatsPerBar, bars,
  keyRoot, keyMode, progressionPreset, chords[],
  styleId, arpPattern, drumStyle, density, swing,
  fx: { reverb, delay, drive, sidechain, brightness },
  tracks: [{
    id, name, role, instrument, color, volume, mute, solo,
    notes: [{ id, pitch, start, dur, vel }]
  }]
}
```

- 时间单位统一为 **拍**，不是秒；BPM 只影响拍→秒的换算。
- 一个音符的 `start` / `dur` 可以是浮点拍，因此支持三连音、附点和任意精度的 MIDI 时值。
- 角色 `lead / arp / bass / pad / drums / extra` 决定默认音色、自动编曲目标和颜色；
  `extra` 用来保留用户自己的特殊音色，不会被音色包覆盖。
- 所有导入数据都经过 `normalizeSong()`：限制轨道数、音高、时值、颜色、ID、音量、和弦长度。

## 5. 音频引擎

### 5.1 合成

每个音色由以下部分组成：

- 多个振荡器层：`sine / triangle / sawtooth / square / pulse25 / pulse12 / organ`；
- 可选 FM：调制器 → 频率，用于八音盒、钟琴、FM 电钢、FM 贝斯；
- 可选噪声层：长笛气声；
- 振幅包络 ADSR；
- 可选低通/高通滤波器和包络；
- 颤音 LFO；
- 每轨效果发送量；
- 鼓组使用独立的合成鼓（底鼓、军鼓、拍手、闭镲、开镲、嗵鼓、吊镲）。

主链路：

```
tracks → drive → compressor → master → destination
        ↘ reverb / ping-pong delay / gated reverb
```

侧链：底鼓触发 pad 的 `duckGain` 自动化，产生 synthwave 的“泵动”。

### 5.2 在线调度：增量 lookahead

早期版本在按下播放时一次性创建整首歌的所有音频节点。对于 4,608 个音符的完整 MIDI，
这会造成明显的主线程停顿。现在改为：

1. 播放时只构建总线和前 1.8 秒的音频节点；
2. 每 55ms 调度一次，只创建“未来 1.8 秒内开始”的音符；
3. 循环时在当前段结束前创建下一段的窗口，而不是提前创建整段；
4. 从乐曲中间开始播放时，额外补发跨过播放起点的长音；
5. 旧 pass 在结束后断开，避免循环无限累积节点。

实测 14 轨 / 4,608 音符 / 57 小节在 Chrome 中播放正常，点击播放约 146ms 返回，播放头持续推进。

### 5.3 离线 WAV

`OfflineAudioContext` 一次性调度整首歌，渲染 44.1kHz / 16-bit / 立体声 WAV。
早期 8 小节示例实测：22.4 秒音频、约 3.95MB、RMS 0.277、峰值 0.671、渲染约 6.8 秒。
离线路径与在线增量调度相互独立；导出时会显示渲染进度。

## 6. 钢琴卷帘

- 固定网格 + 小节线 + 和弦名 + C 音标记；
- 当前轨道彩色音符，其他轨道半透明幽灵音符；
- 点击写入、拖动移动、右边缘改长度、右键/双击删除；
- 动态音域：将所有轨道的最低/最高音纳入范围，超出默认 C2–C6 时自动扩展，必要时纵向滚动；
- 吸附、画笔时值、缩放、播放头跟随、键盘试听；
- 撤销/重做基于完整工程快照，保证音色/编曲/和弦一起回退。

## 7. 自动编曲与自动和弦

- `generateArrangement()` 按 `song.chords` 生成：
  - pad：带声部连接的 3–4 音和弦；
  - bass：根音、八度、切分；
  - arp：上行/上下往返/八度/切分；
  - drums：经典 80s / 四踩 / 半速 / 芯片 / 城市流行 / 无鼓；
  - 每 4 小节 fill，段落起点 crash。
- 主旋律为空时才自动作曲，已有旋律不会被覆盖。
- “为选中根音配和弦”：
  1. 读取选中音符的 bar 和当前小节和弦；
  2. 根音匹配时使用该和弦性质，否则按调式选择一个三和弦性质；
  3. 在铺底轨道替换该时间段内的旧和弦；
  4. 写入根音 + 三/七和弦音，返回 toast 说明。
- 文本谱中的 `C5:maj7` 和 `chords:` 走同一套 `theory` 和弦展开逻辑。

## 8. NST 文本谱

设计目标：**人类可读、可 diff、可单独改一个音**。

两种写法并存：

```nst
# 顺序写法：适合从头写旋律
| C5/8 D5/8 E5/4 R/4 |

# 绝对写法：适合编辑 MIDI 导入结果
@1:1 C5/8
@1:1.5 D5/8
@2:1 C5/2 v=110
```

- `@小节:拍` 从 1 开始计数；
- `/4` 四分音符、`/8` 八分音符、`/2` 二分音符、`/4.` 附点；
- `:1.5` 直接写拍数；`v=0..127` 力度；
- `[C5,E5,G5]` 显式和弦；`C5:maj7` 自动补全；
- `chords: Cm | Ab | Fm | G` 每小节一个和弦；
- `track lead "主旋律" instrument=neonSaw volume=90` 多轨；
- 鼓组 `K/S/H/O/C/T/CR`；
- 导出时每个音符都带绝对位置，因此改一个音不会顺移后续音符；
- `bars:` 指令保留尾部空小节。

完整语法：[`scores/NST-FORMAT.md`](../scores/NST-FORMAT.md)。
VS Code 扩展：[`editors/vscode-nst/`](../editors/vscode-nst/)。

## 9. 导入器

### MIDI

- 解析 `MThd` / `MTrk`、变长 delta、running status、meta 事件；
- 保留 note on/off 配对、通道、program、鼓通道 9；
- 速度取第一组 tempo，拍号取第一组 time signature；
- 文本元数据先 UTF-8，失败后 Shift-JIS，再 windows-1252；
- 按通道分组，最多 16 个声部；
- 1/16 量化；
- 根据 program、轨道名、平均音高推测 lead / arp / bass / pad / drums。

### MusicXML

- 支持 partwise、`divisions`、`backup` / `forward`、和弦、休止、连音线、多声部；
- `.mxl` 自写 ZIP 中央目录解析 + `DecompressionStream`；
- 安全限制：最多 256 条目、单条目 16MB、总解压 48MB、只解压 XML/容器条目；
- 不支持 timewise 和 ZIP64。

### 文本谱

- 支持顺序/绝对定位、音名、时值、和弦、自动和弦、鼓组、力度、轨道头；
- 未知 token 产生 warning，不中断整个导入。

## 10. 实测记录（2026-11-15）

环境：Windows、Chrome 155 headless、1600×1000 视口、`file://` 打开。

| 测试 | 结果 |
| --- | --- |
| 首屏加载 | 5 轨 / 362 音符 / 无运行时异常 |
| 示例谱库 | 3 个内置示例 + 1 个 LOCAL 东方工程，共 4 张卡 |
| NST 导入 `oriental-riff.nst` | 46 音符 / 2 轨 / 8 小节 / 108 BPM |
| 选中 C5 配和弦 | 生成 Cm：C5 · Eb5 · G5，写入铺底轨道 |
| 完整 `th06_05.mid` 导入 | 14 轨 / 4,608 音符 / 57 小节 / 无异常 |
| 完整 MIDI 播放 | 1.6 秒后播放头到第 1 小节第 4 拍，音频上下文 running |
| 压缩 MXL 冒烟 | 4 小节 / 164 音符 / 5 轨，ZIP 解压正常 |
| CSP 下导入 | MIDI 703 音符 / 6 轨；MXL 164 音符 / 5 轨；无 CSP 拦截 |
| CSP 下导出 | WAV 2,257,964 字节；工程 JSON 28,249 字节；均下载成功 |
| NST 导出 | 109,153 字符 / 4,482 行，含绝对定位、多轨、鼓组 |
| 恶意工程 ID 清理 | 非法 track id 被替换为安全 ID，无 XSS 异常 |
| 早期 WAV 渲染 | 22.4 秒 / 3.95MB / RMS 0.277 / peak 0.671 / 6.8 秒 |

未覆盖：Firefox / Safari、移动端触摸、数十万音符的压力测试、音频主观听感测试、模糊测试。

## 11. 关键决策

1. **不做 Electron**：浏览器 API 已满足音频、文件、Canvas 需求；避免主进程/preload 攻击面。
2. **不引入前端框架**：单页、状态集中、Canvas 为主，框架收益低。
3. **不做后端**：乐谱和 MIDI 不离开本机，隐私和部署成本最优。
4. **文本格式优先绝对定位**：从 MIDI 导入后再编辑时，顺序格式会让改一个音影响后面所有音。
5. **动态音域而不是强制移调**：保持音高真实，同时让超低/超高音符可见。
6. **增量调度而不是一次性建节点**：大 MIDI 播放不冻结 UI。
7. **音色包只换配器/效果，不改音符**：避免用户点一下音色就丢失编曲。

## 12. 已知问题 / 路线图

### P1

- 钢琴卷帘尚未做虚拟化；14 轨 4,608 音符可以工作，但更大工程绘制会变慢。
- 不支持 MIDI tempo map / 拍号变化；只保留第一组。
- 不支持扫描图片/PDF 的 OMR。
- `.mxl` 不支持 ZIP64、非 UTF-8 XML。

### P2

- 轨道级自动化（音量、滤波器、pan）与混音台；
- 和弦检测从“小节标签”升级为“按音符模板打分”；
- 更多鼓组/音色，以及用户自定义 preset JSON；
- 音频导出分轨（stems）；
- 钢琴卷帘框选、多选、复制粘贴；
- NST 的重复段/宏（`repeat` / `section`）；
- 移动端触控布局。

### P3

- MIDI 2.0 / MPE；
- Web MIDI 键盘输入；
- 分享链接（本地应用暂不需要）。

## 13. 后续开发安全约束

后续修改代码时请保持：

1. 运行时**不引入** `eval` / `new Function` / `vm` / 字符串拼 `require`；
2. 不用 `child_process` 执行用户可控路径或乐谱内容；如必须用，使用 `execFile` + 参数数组 + `path.resolve` 白名单；
3. 不把乐谱、本地路径、工程内容发往网络；不加载远程脚本；
4. 导入文件只在内存中解析；下载文件名必须经过 `safeFilename`；
5. 任何 HTML 模板插入用户数据必须 `escapeHtml` 或 `textContent`；ID/颜色要白名单校验；
6. ZIP/MXL 必须限制条目数、单条目大小、总解压大小；
7. 不新增第三方依赖，除非在 README/CHANGELOG 说明用途、版本、来源；
8. 不改 Electron 配置（当前无 Electron）；若以后引入，必须 `nodeIntegration:false`、`contextIsolation:true`、`webSecurity:true`，preload 只暴露白名单 API；
9. 不为“看起来安全”删除核心乐谱/音频功能；先报告、再最小修复。

## 14. 复现示例

```powershell
# 三套「東方連復段」示例
node tools/build-samples.js

# th06_05 本地编辑工程 + LOCAL 示例
node tools/build-touhou-edit.js
```

两者都只使用 Node 内置 `fs` / `path` 和浏览器共享模块，无第三方依赖；共享模块通过 CommonJS `require` 导出，不再使用 `vm`。

## 15. 致谢

- 東方連復段旋律参考：Wikimedia Commons `AsianRiffSheetMusic.png`，CC BY-SA 3.0。
- 《おてんば恋娘》原曲：ZUN / Team Shanghai Alice；本仓库中的改编仅用于本地个人编辑。
- 所有合成器音色、鼓组、自动编曲、UI 与代码为 NeonScore 项目实现。
