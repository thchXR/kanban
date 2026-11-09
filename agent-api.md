# Agent API

## Canonical data

应用启动时从 Tauri app data 目录的 `board.json` 读取数据，写操作会原子地覆盖该 JSON。顶层结构为 `Board`。

```json
{
  "id": "board-main",
  "title": "我的项目看板",
  "icon": "◆",
  "updatedAt": 1700000000,
  "columns": [{
    "id": "backlog",
    "title": "待办",
    "cards": [{
      "id": "uuid",
      "title": "任务标题",
      "description": "验收标准或上下文",
      "labels": ["frontend"],
      "labelColors": {"frontend": "blue"},
      "assignee": "deepseek",
      "dueDate": "2026-11-20",
      "createdAt": 1700000000,
      "updatedAt": 1700000000
    }]
  }]
}
```

Agent 应按 `id` 定位卡片和列，不依赖数组顺序。推荐读取顺序是先按列语义分组，再按 `updatedAt` 降序处理。`dueDate` 是 ISO `YYYY-MM-DD` 或 `null`。

## Tauri command

前端或 harness 可以调用这些稳定命令。命令成功后返回完整的最新 `Board`。

- `get_board()`
- `create_card({ columnId, input: { title, description, labels, assignee, dueDate } })`
- `update_card({ cardId, input: { title, description, labels, labelColors, assignee, dueDate } })`
- `update_board_icon({ icon })`
- `move_card({ cardId, fromColumn, toColumn })`
- `delete_card({ cardId })`
- `export_board()` 返回 JSON 文件路径

这些命令只修改本地数据，不依赖云端账号或网络，适合本地 DeepSeek harness 读取和回写。
