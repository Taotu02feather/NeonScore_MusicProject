# scores/ — 乐谱输入与输出

这个目录是 NeonScore 的“乐谱文件夹”：示例谱、你手写的文本谱，以及从应用导出的文件都可以放在这里。

```
scores/
  README.md
  NST-FORMAT.md              ← .nst 文本谱完整语法（绝对定位 / 自动和弦）
  blank.nst                  ← 空白模板，用 VSCode / 记事本打开
  library.js                 ← 示例谱库索引（当前为空，等待新的内置谱例）
  local-library.js           ← 三个 LOCAL 东方全曲工程索引
  Touhou/
    th06_05-neonscore.json   ← 57 小节全曲
    th06_05-neonscore.nst
    th06_05-neonscore.mid
    th06_14-neonscore.json   ← 64 小节全曲
    th06_14-neonscore.nst
    th06_14-neonscore.mid
    th09_04-neonscore.json   ← 64 小节全曲
    th09_04-neonscore.nst
    th09_04-neonscore.mid
    README.md                ← 版权与编曲说明
  input/                      ← 建议把你自己的乐谱放这里
  output/                     ← 建议把应用下载的 .mid / .wav / .nst / .json 放这里
```

## 当前示例谱库

原来的 3 个「東方連復段」占位示例已从示例库移除。  
目前 **导入乐谱 → 示例谱库** 里只有 3 张 **LOCAL** 全曲卡：

| 示例 | 长度 | 说明 |
| --- | --- | --- |
| TH06_05 おてんば恋娘（全曲） | 57 小节 | 主旋律为原曲 Ch3 电钢，Ch7 高音为副旋律 |
| TH06_14 魔法少女達の百年祭（全曲） | 64 小节 | 原曲方波主音、弦乐、铜管、电钢、贝斯、鼓组；第 22–29 小节 Ch8 琶音段是主旋律「東方連復段」 |
| TH09_04 フラワリングナイト（全曲） | 64 小节 | 原曲钢琴主旋律、弦乐、贝斯、琶音、鼓组 |

新的内置东方谱例等素材到位后再加入 `library.js`。

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

## 示例版权

`scores/Touhou/` 中的三首东方全曲工程来自用户提供的 `TouhouMid/` MIDI。原曲版权归 **ZUN / Team Shanghai Alice**，仅供本地个人学习与编辑，请勿再分发这些改编文件。

- おてんば恋娘 / 魔法少女達の百年祭：東方紅魔郷
- フラワリングナイト：東方花映塚
- 作曲：ZUN / Team Shanghai Alice
