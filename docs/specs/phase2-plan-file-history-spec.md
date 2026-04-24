# Spec: Phase 2 — 计划确认 + 文件输入 + 结果保存 + 历史记录

> 状态：待实现
> 最后更新：2026-04-24
> 关联 PRD：[prd-oma-cli-gui.md](../prd-oma-cli-gui.md) §4.2.3 / §4.2.4 / §4.2.5 / §4.2.7

---

## Feature A — `oma run` 执行前显示计划并确认（§4.2.3）

### 框架改动（需修改 src/）

**问题**：`runTeam()` 当前在 coordinator 分解任务后立即执行，无暂停点。

**方案**：在 `OrchestratorConfig`（`src/types.ts`）新增可选回调：

```typescript
readonly onPlanReady?: (tasks: Task[]) => Promise<boolean>
```

- 返回 `true`：继续执行
- 返回 `false`：中止，`runTeam` 返回 `{ success: false, ... }`

**Hook 位置**：`src/orchestrator/orchestrator.ts` `runTeam()` 方法，在 auto-assignment 完成后、`executeQueue()` 调用前（约第 716 行）：

```typescript
if (this.config.onPlanReady) {
  const tasks = queue.list()
  const approved = await this.config.onPlanReady(tasks)
  if (!approved) {
    return { success: false, agentResults: new Map(), totalTokenUsage: ZERO_USAGE }
  }
}
```

**后向兼容**：`onPlanReady` 是可选字段，不传时行为与现在完全一致。

### CLI 展示格式

```
Goal: 开发一个命令行 todo 工具

Proposed plan:
  1. [architect]   设计数据结构和文件格式
  2. [developer]   实现核心功能 (depends on: 1)
  3. [tester]      编写测试 (depends on: 2)

Proceed? [Y/n/e(dit)]
```

- `Y` / Enter：继续执行
- `n`：中止，打印"Cancelled."，exit 0
- `e`：暂不实现（Phase 3 TUI 阶段再做）；输入 `e` 时提示"Edit mode not yet available, use Y or n"

**依赖显示**：从 `task.dependsOn`（UUID 数组）反查 title，显示为 `depends on: <title>` 或 `depends on: 1, 2`（编号）。

### 新增 flag

```
--yes / -y    跳过确认，直接执行（适合脚本自动化）
```

非 TTY 环境（管道）自动等同于 `--yes`。

---

## Feature B — `--file` / `--context` 输入（§4.2.4）

适用命令：`oma agent`、`oma run`

### 语义

| Flag | 行为 |
|------|------|
| `--file <path>` | 从文件读取任务描述，替代位置参数 `<prompt>` 和管道输入 |
| `--context <path>` | 附加上下文内容，可与任意 prompt 来源叠加 |

**互斥规则**：`--file`、管道 stdin、位置参数三选一。同时使用时报错：
```
Error: --file cannot be combined with a positional prompt argument.
Use one of: <prompt>, --file <path>, or pipe via stdin.
```

### 实现

```typescript
// cli/lib/prompt-resolver.ts (新建)
export async function resolvePrompt(opts: {
  positional?: string
  file?: string
  context?: string
}): Promise<string>
```

逻辑：
1. 检测 stdin pipe：`!process.stdin.isTTY`
2. 互斥校验：`positional` / `file` / pipe 三者只能有一个
3. 读取主 prompt（从 positional、file 或 stdin）
4. 若有 `--context`：读取文件或目录所有文件，拼接到 prompt 后

**目录递归**：`--context` 指向目录时，递归读取所有文件内容，以路径为标题拼接：
```
--- src/utils.ts ---
<内容>

--- src/index.ts ---
<内容>
```

---

## Feature C — `--output` 结果保存（§4.2.5）

适用命令：`oma agent`、`oma run`

```typescript
// 逻辑
if (opts.output) {
  const exists = await fileExists(opts.output)
  if (exists && !opts.force) {
    // 询问是否覆盖（非 TTY 时报错退出）
    const confirmed = await confirmOverwrite(opts.output)
    if (!confirmed) { console.log('Aborted.'); process.exit(0) }
  }
  await fs.writeFile(opts.output, result.output ?? '', 'utf8')
  console.log(chalk.dim(`Saved to ${opts.output}`))
}
```

新增 flags：
```
--output <path>    保存结果到文件
--force            覆盖已存在的文件，不询问
```

---

## Feature D — `oma history`（§4.2.7）

### 存储格式

路径：`~/.oma/history/<ISO-timestamp>.json`

```json
{
  "version": 1,
  "id": "2026-04-24T14:32:00.000Z",
  "mode": "run",
  "goal": "开发一个命令行 todo 工具",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "agents": ["architect", "developer", "tester"],
  "output": "最终输出内容...",
  "tokenUsage": { "input_tokens": 1200, "output_tokens": 900 },
  "durationMs": 42000,
  "success": true,
  "timestamp": "2026-04-24T14:32:00.000Z"
}
```

### 写入时机

每次 `oma agent` / `oma run` / `oma chat`（session 结束时）执行完毕后，自动写入。

### 命令接口

```bash
oma history               # 列出最近 20 条
oma history --limit 50    # 自定义条数
oma history show 5        # 查看第 5 条完整输出
oma history rerun 5       # 用相同目标和配置重新执行
oma history clear         # 清空历史（需确认）
```

### 列表显示格式

```
 #5  2026-04-24 14:32  run    "开发一个命令行 todo 工具"    3 agents  2.1k tokens
 #4  2026-04-24 11:15  agent  "帮我 review src/index.ts"   1 agent   800 tokens
```

---

## 涉及文件

| 操作 | 路径 |
|------|------|
| 修改（框架） | `src/types.ts` — 新增 `onPlanReady` |
| 修改（框架） | `src/orchestrator/orchestrator.ts` — hook `onPlanReady` |
| 新建 | `cli/lib/prompt-resolver.ts` |
| 新建 | `cli/lib/history.ts` |
| 修改 | `cli/commands/agent.ts` — 加 `--file`、`--context`、`--output` |
| 修改 | `cli/commands/run.ts` — 加 `--file`、`--context`、`--output`、`--yes`、计划确认 |
| 修改 | `cli/commands/chat.ts` — session 结束时写 history |
| 新建 | `cli/commands/history.ts` |
| 修改 | `cli/bin/oma.ts` — 注册 history 命令 |
