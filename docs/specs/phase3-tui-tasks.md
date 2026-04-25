# Phase 3 Tasks — Ink TUI 基础框架

> 关联 Spec：[phase3-tui-spec.md](./phase3-tui-spec.md)
> 状态：待开始

---

## 任务依赖图

```
T-01 [直接]  package.json — 安装 ink / react / @types/react
  │           cli/tsconfig.cli.json — 加 jsx: "react"
  │
T-02 [直接]  src/types.ts — 新增 onAgentStream
  │
T-03 [直接]  src/orchestrator/orchestrator.ts — 流式执行路径
  │→ review(T-01+T-02+T-03): npm run lint + npm test
  │
  ├── T-04 [subagent A]  cli/tui/types.ts + cli/tui/bridge.ts
  │                      （状态结构 + 事件桥接）
  │
  ├── T-05 [subagent B]  cli/tui/App.tsx + cli/tui/Header.tsx   ← 与 T-04 并行
  │
  ├── T-06 [subagent C]  cli/tui/AgentPanel.tsx                 ← 与 T-04/T-05 并行
  │
  ├── T-07 [subagent D]  cli/tui/OutputPanel.tsx                ← 与 T-04/T-05/T-06 并行
  │
  └── T-08 [subagent E]  cli/tui/StatusBar.tsx                  ← 与上述并行
  │
  │→ review(T-04~T-08): 组件结构、类型、桥接逻辑
  │
T-09 [直接]  集成：cli/commands/run.ts 加 --tui 分支
             cli/commands/tui.ts 新建
             cli/bin/oma.ts 注册
  │→ review(T-09): npm run build:cli + 命令注册验证
  │
整体 review → npm test + npm run build:cli + npm run lint
  │
commit + push → PR
```

---

## T-01 安装依赖 + tsconfig 配置  [直接]

**修改 `package.json`**：

在 `dependencies` 中添加：
```json
"ink": "^4.4.1",
"react": "^18.3.0"
```

在 `devDependencies` 中添加：
```json
"@types/react": "^18.3.0"
```

运行：`npm install`

**修改 `cli/tsconfig.cli.json`**：

在 `compilerOptions` 中添加：
```json
"jsx": "react",
"jsxImportSource": "react"
```

**验收**：`npm run build:cli` 无报错（即使 TUI 文件尚未存在，编译 CLI 入口应通过）。

---

## T-02 修改 `src/types.ts`  [直接]

在 `onPlanReady` 之后新增：

```typescript
/**
 * Called for each streaming event emitted by an agent during runTeam().
 * Only invoked when this callback is provided; agents then run in streaming
 * mode rather than blocking mode.
 */
readonly onAgentStream?: (agentName: string, event: StreamEvent) => void
```

确认 `StreamEvent` 已在同文件 import 或定义（检查后添加 import 若需要）。

**验收**：`npm run lint` 通过。

---

## T-03 修改 `src/orchestrator/orchestrator.ts`  [直接]

在 agent 执行路径中，当 `this.config.onAgentStream` 存在时切换为流式模式。

**定位**：在 `executeQueue` 内部，agent 执行的位置（大约是 `pool.run(assignee, prompt, traceOptions)` 调用处，约第 370 行）。

**方案**：在 `AgentPool.run()` 调用之前检查是否有 `onAgentStream`，若有则改用 `Agent.stream()` 执行并收集结果：

```typescript
// 若 onAgentStream 存在，用流式路径
if (this.config.onAgentStream) {
  // 直接使用 Agent.stream() 而不是 pool.run()
  const streamResult = await runAgentStreaming(
    agent,
    prompt,
    agentName,
    this.config.onAgentStream,
    traceOptions,
  )
  return streamResult  // AgentRunResult
}
// 否则走原有阻塞路径
return pool.run(assignee, prompt, traceOptions)
```

辅助函数 `runAgentStreaming`（同文件内）：

```typescript
async function runAgentStreaming(
  agent: Agent,
  prompt: string,
  agentName: string,
  onAgentStream: (name: string, event: StreamEvent) => void,
  traceOptions?: Partial<RunOptions>,
): Promise<AgentRunResult> {
  let result: AgentRunResult | null = null
  for await (const event of agent.stream(prompt)) {
    onAgentStream(agentName, event)
    if (event.type === 'done') {
      result = event.data as AgentRunResult
    }
    if (event.type === 'error') {
      throw event.data as Error
    }
  }
  return result ?? { output: '', success: false, tokenUsage: { input_tokens: 0, output_tokens: 0 } }
}
```

**注意**：需要找到正确的 agent 实例（在 `executeQueue` 内部可以访问到每个 task 的 assignee agent）。仔细阅读现有代码逻辑后再修改，不要破坏原有执行路径。

**验收**：`npm test` 全部通过（现有测试不受影响）。

---

## T-04 新建 `cli/tui/types.ts` + `cli/tui/bridge.ts`  [subagent A]

**`cli/tui/types.ts`**：

```typescript
export interface ToolCallEntry {
  id: string
  name: string
  input: unknown
  result?: string
  expanded: boolean
}

export interface AgentState {
  name: string
  status: 'waiting' | 'running' | 'done' | 'failed'
  output: string
  toolCalls: ToolCallEntry[]
}

export interface AppState {
  goal: string
  agents: AgentState[]
  selectedIndex: number
  totalTasks: number
  completedTasks: number
  tokenIn: number
  tokenOut: number
  done: boolean
}

export type AppAction =
  | { type: 'AGENT_START'; agentName: string }
  | { type: 'AGENT_COMPLETE'; agentName: string; success: boolean; tokenIn: number; tokenOut: number }
  | { type: 'AGENT_TEXT'; agentName: string; delta: string }
  | { type: 'AGENT_TOOL_USE'; agentName: string; id: string; toolName: string; input: unknown }
  | { type: 'AGENT_TOOL_RESULT'; agentName: string; toolUseId: string; result: string }
  | { type: 'TASK_COMPLETE' }
  | { type: 'SELECT_PREV' }
  | { type: 'SELECT_NEXT' }
  | { type: 'TOGGLE_TOOL'; agentName: string; toolId: string }
  | { type: 'DONE' }
```

**`cli/tui/bridge.ts`**：

```typescript
import type { OrchestratorEvent, StreamEvent } from '../../src/types.js'
import type { AppAction } from './types.js'

export interface TuiBridge {
  onProgress: (event: OrchestratorEvent) => void
  onAgentStream: (agentName: string, event: StreamEvent) => void
  subscribe: (listener: (action: AppAction) => void) => () => void
}

export function createTuiBridge(agents: string[]): TuiBridge
```

`createTuiBridge` 实现：
- 用简单的发布/订阅模式（`listeners: Set<fn>`）
- `onProgress` 将 `OrchestratorEvent` 映射为 `AppAction`（`agent_start` → `AGENT_START`，`agent_complete` → `AGENT_COMPLETE` + token 累加，`task_complete` → `TASK_COMPLETE`）
- `onAgentStream` 将 `StreamEvent` 映射为 `AppAction`（`text` → `AGENT_TEXT`，`tool_use` → `AGENT_TOOL_USE`，`tool_result` → `AGENT_TOOL_RESULT`，`done` → `AGENT_COMPLETE`）
- `subscribe` 注册监听器，返回取消订阅函数

---

## T-05 新建 `cli/tui/App.tsx` + `cli/tui/Header.tsx`  [subagent B]（与 T-04 并行）

**`cli/tui/Header.tsx`**：

```tsx
import React from 'react'
import { Box, Text } from 'ink'

interface HeaderProps {
  goal: string
  tokenIn: number
  tokenOut: number
}

export function Header({ goal, tokenIn, tokenOut }: HeaderProps): React.ReactElement
```

显示格式：`oma  |  goal: <truncated-goal>  tokens: <Xk in / Yk out>`

**`cli/tui/App.tsx`**：

```tsx
import React, { useReducer, useEffect } from 'react'
import { Box, useInput, useApp } from 'ink'
import { Header } from './Header.js'
import { AgentPanel } from './AgentPanel.js'
import { OutputPanel } from './OutputPanel.js'
import { StatusBar } from './StatusBar.js'
import { appReducer, initialState } from './reducer.js'
import type { TuiBridge } from './bridge.js'

interface AppProps {
  goal: string
  agentNames: string[]
  bridge: TuiBridge
}

export function App({ goal, agentNames, bridge }: AppProps): React.ReactElement
```

`App` 逻辑：
- 使用 `useReducer(appReducer, initialState(goal, agentNames))` 管理状态
- `useEffect` 订阅 `bridge.subscribe(dispatch)`
- `useInput` 处理键盘：`↑` → `SELECT_PREV`，`↓` → `SELECT_NEXT`，`q` → `useApp().exit()`，`return` → `TOGGLE_TOOL`（当前 agent 第一个展开的 tool call）

同时新建 **`cli/tui/reducer.ts`**：

```typescript
import type { AppState, AppAction, AgentState } from './types.js'

export function initialState(goal: string, agentNames: string[]): AppState
export function appReducer(state: AppState, action: AppAction): AppState
```

`appReducer` 按 `AppAction` 各 type 更新对应字段，纯函数。

---

## T-06 新建 `cli/tui/AgentPanel.tsx`  [subagent C]（与 T-04/T-05 并行）

```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { AgentState } from './types.js'

interface AgentPanelProps {
  agents: AgentState[]
  selectedIndex: number
}

export function AgentPanel({ agents, selectedIndex }: AgentPanelProps): React.ReactElement
```

显示逻辑：
- 固定宽度 22 字符（`<Box width={22} flexDirection="column">`）
- 标题行：`chalk.bold('Agents')` 或 `<Text bold>Agents</Text>`
- 分隔线：`──────────────`
- 每个 agent：两行（名称 + 状态），选中时名称前加 `▶`（青色），其余 dim
- 状态图标映射：`waiting` → dim `○ waiting`，`running` → blue bold `● running`，`done` → green `✓ done`，`failed` → red `✗ failed`

---

## T-07 新建 `cli/tui/OutputPanel.tsx`  [subagent D]（与 T-04/T-05/T-06 并行）

```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { AgentState, ToolCallEntry } from './types.js'

interface OutputPanelProps {
  agent: AgentState | undefined
}

export function OutputPanel({ agent }: OutputPanelProps): React.ReactElement
```

显示逻辑：
- `flex: 1`（占满剩余宽度）
- 标题行：agent 名称 + 状态（右对齐）
- 分隔线
- 工具调用卡片（每个 `ToolCallEntry`）：
  - `> [tool: <name>]  <input-preview truncated to 60 chars>`
  - 若有 result 且未展开：`  [▶ 展开 (N 行)]`（dim）
  - 若展开：显示完整 result，`[▼ 折叠]`
- 文字输出：`agent.output`（截取最近 30 行以避免溢出）

---

## T-08 新建 `cli/tui/StatusBar.tsx`  [subagent E]（与上述并行）

```tsx
import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  completedTasks: number
  totalTasks: number
  tokenIn: number
  tokenOut: number
}

export function StatusBar({ completedTasks, totalTasks, tokenIn, tokenOut }: StatusBarProps): React.ReactElement
```

显示格式：

```
Tasks: 2/5  ████░░░░░░  40%   in: 1.2k  out: 800  [q]uit
```

进度条：`'█'.repeat(filled) + '░'.repeat(10 - filled)`，filled = `Math.floor(ratio * 10)`。

Token 格式：`>= 1000` 则显示 `Xk`，否则显示原数字。

---

## T-09 集成入口  [直接]（依赖 T-04~T-08）

**修改 `cli/commands/run.ts`**：

新增 option：`--tui`

```typescript
.option('--tui', 'Show interactive TUI while running')
```

在 action 函数中，若 `opts.tui` 为 true，走 TUI 分支：

```typescript
if (opts.tui) {
  const { render } = await import('ink')
  const { App } = await import('../tui/App.js')
  const { createTuiBridge } = await import('../tui/bridge.js')

  const agentNames = agentConfigs.map(a => a.name)
  const bridge = createTuiBridge(agentNames)

  const { unmount } = render(<App goal={resolvedGoal} agentNames={agentNames} bridge={bridge} />)

  const orchestrator = new OpenMultiAgent({
    ...baseConfig,
    onProgress: bridge.onProgress,
    onAgentStream: bridge.onAgentStream,
  })

  // ... runTeam, await done, unmount()
  return
}
// 否则走原有 CLI 路径
```

**新建 `cli/commands/tui.ts`**：

```typescript
export function registerTuiCommand(program: Command): void
```

`oma tui [goal]` — 解析 goal（支持 --file/--context），然后转发给 run --tui 逻辑（直接复用 run.ts 的 TUI 分支，不重复实现）。

**修改 `cli/bin/oma.ts`**：

注册 tui 命令。

---

## review 节点

| 节点 | 检查内容 |
|------|----------|
| review T-01+T-02+T-03 | `npm run lint` 通过，`npm test` 全绿，`onAgentStream` 可选不影响现有测试 |
| review T-04 | types 覆盖所有 action，bridge 映射正确，发布/订阅无内存泄漏 |
| review T-05 | App reducer 纯函数，useEffect 清理订阅，键盘映射正确 |
| review T-06 | 宽度固定，状态图标映射完整，选中高亮正确 |
| review T-07 | 工具调用卡片展开/折叠，文字截取不丢内容 |
| review T-08 | 进度条计算正确（0/0 不崩），token 格式一致 |
| review T-09 | `--tui` flag 注册，TUI 分支不影响非 TUI 路径 |
| 整体 review | `npm test`、`npm run build:cli`、`npm run lint` 全绿；`oma run --tui --help` 显示 `--tui` |
