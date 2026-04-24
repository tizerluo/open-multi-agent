# 开发工作流

> 本项目固定工作流，所有功能开发遵循此流程。

---

## 循环概览

```
PRD
 │
 ▼
Spec 三件套（docs/specs/）
 │   phase<N>-<name>.md        ← 设计：接口、行为、决策
 │   phase<N>-tasks.md         ← 实现：原子任务、依赖关系
 │   phase<N>-checklist.md     ← 验收：逐条测试命令
 │
 ▼
开新分支
 │   git checkout -b feat/phase<N>-<name>
 │
 ▼
Plan 模式开发
 │   每完成一个模块 → 小 review（对照 checklist 对应条目）
 │   所有模块完成   → 整体 review 一次
 │
 ▼
PR 到 GitHub
 │   Codex 自动 review
 │   修复 review 意见
 │
 ▼
CI 全绿
 │
 ▼
合并 main
 │
 ▼
根据 PRD 写下一个 Phase 的 Spec 三件套
 │
 ▼
（循环，直到 PRD 完成）
```

---

## Spec 三件套规范

| 文件 | 内容 | 命名 |
|------|------|------|
| Spec | 设计文档：接口定义、行为描述、决策记录、涉及文件 | `phase<N>-<feature>.md` |
| Tasks | 实现任务：原子步骤、代码示例、任务依赖图 | `phase<N>-tasks.md` |
| Checklist | 验收清单：可执行的测试命令 + 预期结果勾选框 | `phase<N>-checklist.md` |

命名示例：`phase1-streaming-chat.md` / `phase1-tasks.md` / `phase1-checklist.md`

---

## 分支命名

```
feat/phase<N>-<简短描述>

示例：
  feat/phase1-streaming-chat
  feat/phase2-plan-confirm
  feat/phase3-ink-tui
```

---

## 小 review 节奏

- 每完成一个 Task（T-01、T-02…）后：对照 checklist 中对应条目验收
- 不通过：当场修复，再验收
- 所有 Task 完成后：跑完整 checklist，再提 PR

---

## PRD 参考

[prd-oma-cli-gui.md](./prd-oma-cli-gui.md) — 功能规划、交付阶段、决策记录
