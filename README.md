# Kanban

一个小型、跨平台、agent 友好的看板应用。Rust + Tauri 2 后端，原生静态前端，无需 React/Vite。

## 运行

先安装 Tauri 的系统依赖。Arch Linux 需要 `webkit2gtk-4.1`, `base-devel`, `curl`, `wget`, `file`, `openssl`, `appmenu-gtk-module`, `libappindicator-gtk3`, `librsvg`。macOS 需要 Xcode Command Line Tools。

```bash
cargo tauri dev
cargo tauri build
```

## Agent 读取

数据以稳定的 JSON 保存在 Tauri 的 app data 目录下，文件名为 `board.json`。字段定义和读取约定见 [agent-api.md](agent-api.md)。所有卡片都有稳定 `id`、时间戳、列 ID、负责人、标签和截止日期，便于 DeepSeek harness 直接解析、规划和执行。

## 主要交互

- 新建任务，填写描述、标签、负责人、截止日期
- 拖动卡片在待办、进行中、已完成之间移动
- 删除任务和导出 JSON
- 窄屏下自动切换为单列布局
