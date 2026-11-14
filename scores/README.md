# scores/ — 乐谱输入与输出

这个目录就是 NeonScore 的“乐谱文件夹”：示例谱、你手写的文本谱，以及从应用导出的文件都可以放在这里。

```
scores/
  README.md
  NST-FORMAT.md              ← .nst 文本谱完整语法（绝对定位 / 自动和弦）
  blank.nst                   ← 空白模板，用 VSCode / 记事本打开
  oriental-riff.nst           ← 東方連復段文本谱示例
  oriental-riff-synthwave.json
  oriental-riff-musicbox.json
  oriental-riff-chiptune.json
  oriental-riff-synthwave.mid
  library.js                  ← 应用内“示例谱库”读取的索引，自动生成
  local-library.js            ← 本地 MIDI 编辑示例索引（TH06_05）
  Touhou/
    th06_05-neonscore.json    ← 本地东方 MIDI 编辑工程
    th06_05-neonscore.nst     ← 绝对定位文本谱，可直接编辑
    th06_05-neonscore.mid
    README.md                 ← 版权与编曲说明
  input/                       ← 建议把你自己的乐谱放这里
  output/                      ← 建议把应用下载的 .mid / .wav / .nst / .json 放这里
```

## 在应用里选择示例

打开应用 → 顶部 **导入乐谱** → 示例谱库。内置三套可编辑的「東方連復段」编曲：

| 示例 | 速度 | 特点 |
| --- | --- | --- |
| 東方連復段 · SYNTHWAVE | 108 BPM | 16 小节完整编曲，第 9–12 小节切到八音盒插段 |
| 東方連復段 · 八音盒 | 84 BPM | 音乐盒、玻璃铺底、稀疏低音、无鼓 |
| 東方連復段 · CHIPTUNE | 138 BPM | 8-bit 脉冲波、三角波贝斯、芯片鼓组 |

还有一个 **LOCAL** 标签的本地示例：

| 示例 | 说明 |
| --- | --- |
| TH06_05 おてんば恋娘 | 从 `TouhouMid/th06_05.mid` 提取并重新编曲的 16 小节工程；原曲版权归 ZUN / Team Shanghai Alice，仅本地个人编辑使用 |

## 使用自己的乐谱

1. 把 `.nst` / `.txt` / `.mid` / `.midi` / `.musicxml` / `.xml` / `.mxl` 放到 `scores/input/`。
2. 在应用里点 **导入乐谱** → **选择本地乐谱文件**。
3. 也可以直接把文件拖进应用窗口。

推荐先用 `.nst` 写草稿：

- 记事本 / VSCode 打开 `scores/blank.nst`；
- 按 `scores/NST-FORMAT.md` 写音符；
- 保存后导入应用；
- 在应用里换音色、配和弦、一键编曲，再导出 WAV / MIDI / `.nst`。

## 输出

浏览器的下载目录由浏览器控制，应用不能直接写入 `scores/output/`。渲染或导出完成后，把下载的文件移动到 `scores/output/` 即可。

## 示例旋律版权与来源

「東方連復段」（Oriental riff）的旋律示例参考 Wikimedia Commons 的 [AsianRiffSheetMusic.png](https://commons.wikimedia.org/wiki/File:AsianRiffSheetMusic.png)，该文件以 **CC BY-SA 3.0** 许可发布。本目录中的合成器编曲、音色设计、鼓组与 JSON/NST 数据结构为 NeonScore 示例工程原创改编；再分发示例旋律时请保留署名与相同方式共享许可。

- 旋律动机：`C D E F G F# Eb C# C`
- 来源页：https://commons.wikimedia.org/wiki/File:AsianRiffSheetMusic.png
- 许可：CC BY-SA 3.0
