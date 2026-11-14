# TH06_05 · おてんば恋娘（本地编辑）

这个目录是基于工作区里 `TouhouMid/th06_05.mid` 生成的 **本地个人编辑工程**，用于测试 NeonScore 的 MIDI 导入、钢琴卷帘编辑和自动编曲能力。

## 版权

- 原曲：**おてんば恋娘**（Beloved Tomboyish Girl）
- 作品：**東方紅魔郷 ～ the Embodiment of Scarlet Devil.**
- 作曲：**ZUN / Team Shanghai Alice**
- 本目录中的主旋律、贝斯、电钢和声来自用户提供的 MIDI；铺底、琶音、鼓组与音色为 NeonScore 本地改编。
- **仅供本地个人学习与编辑，请勿再分发该改编文件。**

## 文件

| 文件 | 内容 |
| --- | --- |
| `th06_05-neonscore.json` | 完整工程，包含 6 条轨道、音色、和弦与效果 |
| `th06_05-neonscore.nst` | 绝对时间轴文本谱，可直接用 VSCode / 记事本改音高、起点、长度、力度 |
| `th06_05-neonscore.mid` | 从编辑工程导出的 MIDI，便于在 DAW 中继续处理 |

## 编曲说明

- 取原曲第 4–19 小节，共 16 小节，速度保持 148 BPM。
- 调性 D 大调，和弦走向：`Bm7 ×4 → G ×3 → A → Bm7 ×4 → G ×3 → A`。
- 主旋律向下移 12 个半音，进入合成器主音更舒服的音域。
- 原曲贝斯向上移 12 个半音，成为合成器贝斯。
- 电钢和声保留原音高。
- 铺底、琶音和门限鼓组由 NeonScore 根据和弦重新生成。
- 主旋律轨道有 343 个音符，整个工程 1171 个音符。

## 打开方式

- 在应用里：**导入乐谱 → 示例谱库 → TH06_05 おてんば恋娘（LOCAL）**。
- 或：**导入乐谱 → 选择本地乐谱文件 → `scores/Touhou/th06_05-neonscore.json`**。
- 也可以直接把 `.nst` 拖进应用，在文本里继续改谱。

## 重新生成

如果修改了源 MIDI 或想重新编曲：

```powershell
node tools/build-touhou-edit.js
```

这会重新生成 JSON、NST、MIDI 和 `scores/local-library.js` 里的 LOCAL 示例。
