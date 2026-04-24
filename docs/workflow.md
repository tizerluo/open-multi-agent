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
 │   phase<N>-tasks.md         ← 实现：原子任务、依赖关系、subagent 标注
 │   phase<N>-checklist.md     ← 验收：逐条测试命令
 │
 ▼
开新分支
 │   git checkout -b feat/phase<N>-<name>
 │
 ▼
分配 + 开发（见"角色分工"）
 │   每完成一个 Task → review subagent 验收
 │   所有 Task 完成  → 整体 review 一次
 │
 ▼
Checklist 全绿
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
| Tasks | 实现任务：原子步骤、代码示例、任务依赖图、subagent 标注 | `phase<N>-tasks.md` |
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

## 角色分工

**技术总监（主 Claude）**：负责 Spec 三件套编写、任务分配调度、review 结果决策、commit / 分支 / PR 管理。不直接写大量实现代码。

**Implementation Subagent**：负责单个 Task 的具体实现，只关注自己的 task 范围。

**Review Subagent**：只拿到"代码 + Spec"，不参与实现过程，保证 review 客观性。

### 什么时候用 Subagent

| 场景 | 处理方 |
|------|--------|
| 小 task（< 50 行，无依赖，改动集中） | 技术总监直接写 |
| 大 task 或独立 task 组 | implementation subagent |
| 每个 task 完成后的 review | review subagent |
| review 发现大问题（逻辑错误、设计缺陷） | 分配回 implementation subagent 修复 |
| review 发现小问题（typo、命名、格式） | 技术总监直接改 |
| commit / 分支 / PR | 技术总监 |

### Tasks 文件中的 Subagent 标注

在 `phase<N>-tasks.md` 里，每个 Task 标注执行方：

```
## T-01 新建 cli/lib/stream-renderer.ts  [直接]
## T-02 修改 cli/commands/agent.ts       [subagent]
## T-03 新建 cli/commands/chat.ts        [subagent]  ← T-02 可并行
```

- `[直接]`：技术总监自己写
- `[subagent]`：派 implementation subagent
- `← T-02 可并行`：标注可并行的 task 组，同时派出

### Subagent Prompt 要求

**Implementation subagent** 的 prompt 必须包含：
1. 要实现的 task 描述（从 tasks 文件复制）
2. 依赖的已有文件路径（前置 task 的产出）
3. 明确的完成标准（从 spec / checklist 摘取）
4. 只写代码，不提 PR，不做其他 task

**Review subagent** 的 prompt 必须包含：
1. 被 review 的文件列表
2. 对应的 spec 要求（接口、行为、验收标准）
3. 输出格式：`[通过] / [大问题] / [小问题]`，附具体说明

---

## Review 节奏

- 每个 Task 完成后：派 review subagent，对照 spec + checklist 对应条目
- 大问题 → 派 implementation subagent 修复，修完再 review
- 小问题 → 技术总监直接改
- 所有 Task 通过后：跑完整 checklist（需要 API key 的项由用户本地跑）

---

## PRD 参考

[prd-oma-cli-gui.md](./prd-oma-cli-gui.md) — 功能规划、交付阶段、决策记录
