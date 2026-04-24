# Phase 2 Tasks — 计划确认 + 文件输入 + 结果保存 + 历史记录

> 关联 Spec：[phase2-plan-file-history-spec.md](./phase2-plan-file-history-spec.md)
> 状态：待开始

---

## 任务依赖图

```
T-01 [直接]  src/types.ts — 新增 onPlanReady
  │
T-02 [直接]  src/orchestrator/orchestrator.ts — hook onPlanReady
  │                                               │
  │          T-03 [subagent A]                   T-05 [subagent C]
  │          cli/lib/prompt-resolver.ts           oma run 计划确认 UI
  │          + --file/--context for agent+run     (依赖 T-02)
  │
  └── T-04 [subagent B]  --output for agent+run  （与 T-03 并行）
  │
T-06 [subagent D]  cli/lib/history.ts + 写入 agent/run/chat
  │
T-07 [subagent E]  cli/commands/history.ts + 注册命令
  │
review + npm test + build:cli → commit + push → PR
```

---

## T-01 修改 `src/types.ts`  [直接]

在 `OrchestratorConfig` 接口（约第 389 行）新增：

```typescript
/**
 * Called after the coordinator decomposes the goal into tasks and before
 * execution begins. Return true to proceed, false to abort.
 * Only invoked by runTeam(). Not called for runAgent() or runTasks().
 */
readonly onPlanReady?: (tasks: Task[]) => Promise<boolean>
```

确保 `Task` 类型在同文件中已有定义（确认后添加 import 若需要）。

**验收**：`npm run lint` 通过（`tsc --noEmit`）。

---

## T-02 修改 `src/orchestrator/orchestrator.ts`  [直接]

在 `runTeam()` 方法中，auto-assignment 完成后、`executeQueue()` 调用前插入：

```typescript
if (this.config.onPlanReady) {
  const tasks = queue.list()
  const approved = await this.config.onPlanReady(tasks)
  if (!approved) {
    return {
      success: false,
      agentResults: new Map(),
      totalTokenUsage: { input_tokens: 0, output_tokens: 0 },
    }
  }
}
```

**验收**：`npm test` 全部通过（现有测试不受影响）。

---

## T-03 新建 `cli/lib/prompt-resolver.ts` + 修改 agent.ts / run.ts  [subagent A]

**新建 `cli/lib/prompt-resolver.ts`**，导出：

```typescript
export interface PromptResolverOpts {
  positional?: string   // 位置参数
  file?: string         // --file 路径
  context?: string      // --context 路径（文件或目录）
}

export async function resolvePrompt(opts: PromptResolverOpts): Promise<string>
```

逻辑：
1. 检测 pipe stdin：`!process.stdin.isTTY && !process.stdin.isTTY === false`
   - 实际检测：`const hasPipe = !process.stdin.isTTY`
2. 统计 prompt 来源数量（positional / file / pipe），多于 1 个时报错
3. 读取主 prompt：
   - positional：直接使用
   - file：`fs.readFile(path, 'utf8')`，文件不存在时 `exitWithError`
   - pipe：`await readStdin()`（读取直到 EOF）
4. 若有 context：读取文件内容（目录则递归所有文件）拼接到 prompt 后

**修改 `cli/commands/agent.ts`**：
- 新增 options：`--file <path>`、`--context <path>`
- 把 `prompt` 位置参数改为可选（`[prompt]`）
- 调用 `resolvePrompt({ positional: prompt, file: opts.file, context: opts.context })`

**修改 `cli/commands/run.ts`**：
- 同上，新增 `--file`、`--context` options
- 把 `goal` 位置参数改为可选（`[goal]`）
- 同样调用 `resolvePrompt`

**注意**：pipe 读取辅助函数：
```typescript
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8').trim()
}
```

---

## T-04 新增 `--output` 和 `--force`  [subagent B]（与 T-03 并行）

**修改 `cli/commands/agent.ts` 和 `cli/commands/run.ts`**：

新增 options：
```
--output <path>   保存最终输出到文件
--force           跳过覆盖确认
```

在输出打印后、进程退出前：
```typescript
if (opts.output) {
  await saveOutput(opts.output, result.output ?? '', opts.force ?? false)
}
```

**新建辅助函数 `cli/lib/output-saver.ts`**（或直接内联在命令文件中）：
```typescript
export async function saveOutput(filePath: string, content: string, force: boolean): Promise<void>
```

逻辑：
- 文件存在且非 force：用 inquirer 询问是否覆盖（非 TTY 时报错退出）
- 写入文件（`fs.writeFile`，自动创建父目录）
- 打印 `chalk.dim('Saved to <path>')`

---

## T-05 `oma run` 计划确认 UI  [subagent C]（依赖 T-02）

**修改 `cli/commands/run.ts`**：

新增 option：`--yes / -y`（跳过确认）

将 `onPlanReady` 回调传入 `OpenMultiAgent` 构造函数：

```typescript
const orchestrator = new OpenMultiAgent({
  // ... 现有配置
  onPlanReady: (opts.yes || !process.stdin.isTTY)
    ? undefined
    : async (tasks) => {
        displayPlan(goal, tasks)
        return await confirmPlan()
      },
})
```

**`displayPlan(goal, tasks)` 格式**：
```
Goal: <goal>

Proposed plan:
  1. [<assignee>]  <title>
  2. [<assignee>]  <title>  (depends on: 1)
  3. [<assignee>]  <title>  (depends on: 2)

Proceed? [Y/n]
```

依赖显示：从 `task.dependsOn`（UUID 数组）对照任务编号（1-based index）转换。

**`confirmPlan()` 实现**：用 readline 读取一行，`y`/`Y`/Enter → true，`n`/`N` → false，其他输入重新提示。

---

## T-06 新建 `cli/lib/history.ts` + 修改 agent/run/chat  [subagent D]

**新建 `cli/lib/history.ts`**，导出：

```typescript
export interface HistoryEntry {
  version: 1
  id: string           // ISO timestamp，同时作为文件名
  mode: 'agent' | 'run' | 'chat'
  goal: string
  provider: string
  model: string
  agents: string[]
  output: string
  tokenUsage: { input_tokens: number; output_tokens: number }
  durationMs: number
  success: boolean
  timestamp: string
}

export async function writeHistory(entry: Omit<HistoryEntry, 'version' | 'id' | 'timestamp'>): Promise<void>
export async function readHistory(limit?: number): Promise<HistoryEntry[]>  // 按时间倒序
export async function readHistoryEntry(id: string): Promise<HistoryEntry | null>
export async function clearHistory(): Promise<void>
```

存储路径：`~/.oma/history/<timestamp>.json`

**修改 `cli/commands/agent.ts`**：执行完毕后调用 `writeHistory`

**修改 `cli/commands/run.ts`**：执行完毕后调用 `writeHistory`

**修改 `cli/commands/chat.ts`**：session 结束时调用 `writeHistory`（mode='chat'，goal=first user message 前 100 字符）

---

## T-07 新建 `cli/commands/history.ts` + 注册  [subagent E]（依赖 T-06）

实现子命令：

```
oma history [--limit <n>]       列出历史（默认 20 条）
oma history show <index>        显示第 N 条完整输出
oma history rerun <index>       重跑第 N 条（复用 goal + config）
oma history clear               清空历史（readline 确认）
```

**列表格式**：
```
 #5  2026-04-24 14:32  run    "开发一个命令行 todo 工具"    3 agents  2.1k tokens
 #4  2026-04-24 11:15  agent  "帮我 review src/index.ts"   1 agent   800 tokens
```

**`rerun` 实现**：读取历史条目中的 `goal`/`provider`/`model`，构造等同于 `oma run <goal> --provider <p> --model <m>` 的调用。

**修改 `cli/bin/oma.ts`**：注册 history 命令。

---

## review 节点

| 节点 | 触发条件 | 检查内容 |
|------|----------|----------|
| review T-01+T-02 | 完成后 | `npm test` 全绿，`npm run lint` 通过 |
| review T-03 | 完成后 | --file/--context 解析逻辑、互斥校验、目录递归 |
| review T-04 | 完成后 | --output 写入、覆盖确认、TTY 检测 |
| review T-05 | 完成后 | 计划显示格式、依赖编号转换、Y/n 输入处理 |
| review T-06 | 完成后 | history 写入/读取、路径、JSON 格式 |
| review T-07 | 完成后 | 子命令路由、列表格式、rerun 逻辑 |
| 整体 review | 全部完成 | `npm test`、`npm run build:cli`、`npm run lint` 全绿 |
