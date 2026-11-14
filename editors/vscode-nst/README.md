# NeonScore NST for VS Code

给 `.nst` 文本乐谱提供语法高亮和代码片段。

## 安装

任选一种：

1. 把整个 `vscode-nst` 文件夹复制到：
   `%USERPROFILE%\.vscode\extensions\neonscore-nst-0.1.0`
   重启 VS Code。
2. 或在 VS Code 命令面板执行：
   `Developer: Install Extension from Location...`
   选择本文件夹。

安装后打开 `scores/*.nst`，右下角语言模式会显示 **NeonScore Text**。

## 片段

在 `.nst` 文件中输入：

- `nst-header` — 文件头
- `nst-track` — 新轨道 + 一个音符
- `nst-chords` — 每小节自动和弦
- `nst-melody` — 绝对定位旋律
- `nst-drums` — 80s 鼓组

## 语法

完整说明见 `scores/NST-FORMAT.md`。
