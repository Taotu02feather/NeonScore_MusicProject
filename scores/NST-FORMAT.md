# NeonScore Text (.nst) 格式

`.nst` 是 NeonScore 的纯文本乐谱格式。它没有隐藏数据、没有二进制字段，用 VSCode、记事本、Sublime Text 都能直接打开和修改。保存为 UTF-8 文本，然后在应用顶部「导入乐谱」中选择文件即可。

> 提示：`scores/oriental-riff.nst` 是一个可以直接播放的完整示例。`scores/blank.nst` 是空白模板。

## 1. 文件头

文件头是 `键: 值` 形式，全部可选：

```nst
title: 東方連復段 · 文本谱
tempo: 108
meter: 4/4
key: C minor
style: synthwave
density: 70
swing: 0
```

| 键 | 含义 | 示例 |
| --- | --- | --- |
| `title` | 曲名 | `title: 夜行` |
| `tempo` / `bpm` | 速度 | `tempo: 108` |
| `meter` / `time` | 拍号 | `meter: 3/4`、`meter: 6/8` |
| `key` | 调性 | `key: C minor`、`key: F# major` |
| `style` | 初始音色包 | `style: musicbox`、`style: chip`、`style: synthwave` |
| `density` | 自动编曲密度 10–100 | `density: 70` |
| `swing` | 摇摆量 0–100 | `swing: 0` |
| `bars` | 歌曲总小节数（可保留尾部空小节） | `bars: 32` |

## 2. 轨道

用 `track` 开始一条轨道：

```nst
track lead "主旋律" instrument=neonSaw volume=90
track arp "琶音" instrument=glassArp volume=75
track bass "低音" instrument=analogBass volume=82
track pad "铺底" instrument=warmPad volume=65
track drums "鼓组" instrument=gated80s volume=85
```

- 角色：`lead`、`arp`、`bass`、`pad`、`drums`、`extra`。
- `instrument=` 可使用应用内任意音色 ID（右侧音色下拉框里对应英文名的小写形式，例如 `musicBox`、`chipLead`、`fmBass`）。
- `volume=` 是 0–100。
- `at=9` 可以让该轨道从小节 9 开始。小节从 1 开始数。
- 不写 `instrument=` 时，会按 `style` 自动选择默认音色。

没有写 `track` 时，所有音符会进入一条默认的 `lead` 轨道。

## 3. 音符与时值

音符写法：`音名 + 八度 + 时值`。音名是 `C D E F G A B`，升降号用 `#` / `b`，八度用数字，例如 `C5`、`F#4`、`Eb3`。时值有两种写法：

| 写法 | 含义 | 拍数（4/4） |
| --- | --- | --- |
| `C5/1` | 全音符 | 4 |
| `C5/2` | 二分音符 | 2 |
| `C5/4` | 四分音符 | 1 |
| `C5/8` | 八分音符 | 0.5 |
| `C5/16` | 十六分音符 | 0.25 |
| `C5/4.` | 附点四分音符 | 1.5 |
| `C5/2.` | 附点二分音符 | 3 |
| `C5:1.5` | 直接用拍数 | 1.5 |

省略时值就是 1 拍，例如 `C5`。

休止符：

```nst
R/4
R:1
R/8
```

用 `|` 写小节线只是为了让谱面更好读，解析时会被忽略。每个记号按顺序推进时间；要留空拍，就写休止。

```nst
| C5/8 D5/8 E5/4 R/4 |
| G5/2 R/2 |
```

### 3.1 绝对定位：`@小节:拍`（推荐用于编辑 MIDI）

顺序写法适合从头写旋律；如果你要改 MIDI 导入的谱子，推荐用绝对定位。`@` 后面的数字是“小节:拍”，都从 1 开始数：

```nst
@1:1 C5/4
@1:2 E5/4
@2:1 G5/2
@5:1 C5/4
```

每个 `@` 只改变这一行（以及后面没有 `@` 的记号）的起点，所以：

- 改音高：把 `C5` 改成 `D5`；
- 改开始位置：把 `@2:1` 改成 `@2:3`；
- 改长度：把 `/4` 改成 `/2` 或 `:1.5`；
- 删除一个音：直接删掉那一行；
- 调整顺序：行顺序不影响 `@` 定位。

这些改动都不会让后面的音符顺移。导出的 `.nst` 会默认使用这种格式。

`@2` 等价于 `@2:1`；`@2:1.5` 表示第 2 小节第 1.5 拍。

### 3.2 力度

在音符后追加 `v=0..127` 可以单独设置力度：

```nst
@1:1 C5/4 v=110
@1:2 E5/4 v=70
```

不写时默认 104。`C5/4!` 是重音快捷写法。

## 4. 和弦：写一个根音，自动补全其他音

### 4.1 和弦音符

在音名后面加 `:性质`，程序会自动补全：

```nst
C5:maj      # C5 E5 G5
A3:m        # A3 C4 E4
D4:m7       # D4 F4 A4 C5
G4:dom7     # G4 B4 D5 F5
F4:maj7     # F4 A4 C5 E5
C5:sus4     # C5 F5 G5
```

也可以写成显式音高：

```nst
[C5,E5,G5]/2
```

### 4.2 每小节一个和弦：`chords:`

这是写伴奏最省事的方式。每个和弦默认占一小节，自动按当前调性做声部连接：

```nst
track pad "自动和弦" instrument=warmPad
chords: Cm | Ab | Fm | G
```

等价于每小节自动写出 Cm、Ab、Fm、G 的三和弦音。它支持：

```nst
chords: Am | F | C | G
chords: Dm7 | G7 | Cmaj7 | Am7
chords: Cm | R | Ab | G
```

`R` 表示这一小节留空。

### 4.3 在应用内配和弦

在钢琴卷帘里选中一个音符，点击右侧「编曲」里的 **为选中根音配和弦**，或按 `H`。程序会：

1. 以选中音符为根音；
2. 如果这个音刚好是小节和弦的根音，就使用该和弦的性质；
3. 否则按当前调式选择三和弦性质；
4. 把补全后的和弦写入铺底轨道，并替换该时间段内原有的铺底和弦。

例如选中 `A4`，当前小节是 Am，就会得到 `A C E`；若小节是 Am7，则得到 `A C E G`。

## 5. 鼓组

鼓组轨道可以用简写，每个记号同样按顺序推进时间，也可以配合 `@` 绝对定位：

| 记号 | 鼓声 | MIDI |
| --- | --- | --- |
| `K` | 底鼓 | 36 |
| `S` | 军鼓 | 38 |
| `H` | 闭镲 | 42 |
| `O` | 开镲 | 46 |
| `C` | 拍手 | 39 |
| `T` | 嗵鼓 | 45 |
| `CR` | 吊镲 | 49 |

```nst
track drums "鼓组" instrument=gated80s
@1:1 K/4
@1:1.5 H/8
@1:2 S/4
@1:3 H/8
```

同一时刻的多个鼓声写成多个 `@` 行即可；绝对定位让它们都落在同一拍上，不会互相挤开。

## 6. 注释

以 `#` 开头的整行是注释；也可以用 `//` 写行尾注释：

```nst
# 这是注释
C5/4  // 这也是注释
```

注意：`#` 同时是升号，所以行尾注释请用 `//`。

## 7. 导出与回写

应用「输出」面板里的 **NST / 导出文本谱 .nst** 会把当前工程写成同样的格式。你可以：

1. 导出 `.nst`；
2. 用 VSCode / 记事本修改；
3. 回到应用导入 `.nst`。

导出的文本谱会保留所有轨道（包括鼓组）、每个音的起点、长度、力度、音高和轨道音色。同时开始的多个同长度音会合并成 `[C5,E5,G5]` 形式和弦；不同长度或不同力度的音会分成不同行，因此重叠长音也不会被裁掉。

## 8. VSCode 语法高亮

`editors/vscode-nst/` 里附带一个最小 VSCode 扩展，提供 `.nst` 语法高亮和代码片段。

安装方式（任选其一）：

- 把 `editors/vscode-nst` 文件夹复制到 `%USERPROFILE%\.vscode\extensions\neonscore-nst-0.1.0`，重启 VSCode；
- 或在 VSCode 中执行「Developer: Install Extension from Location...」，选择该文件夹。

安装后打开 `.nst` 文件即可看到注释、指令、轨道、和弦与音符的颜色区分。

## 9. 完整示例

```nst
title: 東方連復段 · 文本谱
tempo: 108
meter: 4/4
bars: 8
key: C minor
style: synthwave

track lead "主旋律" instrument=neonSaw volume=90
@1:1 C5/8
@1:1.5 D5/8
@1:2 E5/8
@1:2.5 F5/8
@1:3 G5/8
@1:3.5 F#5/8
@1:4 Eb5/8
@1:4.5 C#5/8
@2:1 C5/2
@2:3 R/2

track pad "自动和弦" instrument=warmPad volume=65
chords: Cm | Ab | Fm | G | Cm | Ab | Fm | G
```

导入后按空格即可试听。
