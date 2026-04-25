# Spec: Phase 3 — Ink TUI 基础框架

> 状态：待实现
> 最后更新：2026-04-25
> 关联 PRD：[prd-oma-cli-gui.md](../prd-oma-cli-gui.md) §4.3

---

## Feature A — 框架：`onAgentStream` hook（需修改 src/）

### 问题

`runTeam()` 中 agent 执行走 `AgentPool.run()` → `AgentRunner.run()`（阻塞），无法在 TUI 中实时接收每个 agent 的文字输出。

`AgentRunner.stream()` 已存在，可 yield `StreamEvent`，但在 `runTeam` 路径中未被调用。

### 方案

在 `OrchestratorConfig`（`src/types.ts`）新增可选回调：

```typescript
readonly onAgentStream?: (agentName: string, event: StreamEvent) => void
```

修改 `src/orchestrator/orchestrator.ts` 中 `executeQueue` → agent 执行路径：

- 当 `this.config.onAgentStream` 存在时，改用 `AgentRunner.stream()` 执行，并将每个 `StreamEvent` 转发给回调
- 最终 `AgentRunResult` 从 `done` 事件中提取（`event.type === 'done'`）
- 不影响不传 `onAgentStream` 时的原有行为

**Hook 签名**：

```typescript
// src/types.ts，加在 onPlanReady 后
readonly onAgentStream?: (agentName: string, event: StreamEvent) => void
```

**StreamEvent** 已在 `src/types.ts` 中定义（type: `text` | `tool_use` | `tool_result` | `done` | `error` | `loop_detected`）。

**后向兼容**：`onAgentStream` 可选，不传时 `runTeam` 行为与现在完全一致。

---

## Feature B — TUI 入口点

### 命令签名

```bash
oma run [goal] --tui        # 多 agent 团队执行 + TUI 可视化
oma tui [goal]              # 别名，等同于 oma run --tui
```

`--tui` 与 `--yes` 兼容（自动跳过计划确认，或在 TUI 内显示计划）。

### 依赖安装

```json
"ink": "^4.4.1",
"react": "^18.3.0",
"@types/react": "^18.3.0"
```

Ink v4 支持 Node 18+，ESM-native。

---

## Feature C — Ink TUI 组件架构

### 布局

```
┌─────────────────────────────────────────────────────────┐
│  oma  |  goal: 开发一个命令行 todo 工具         tokens: 1.2k  │
├──────────────┬──────────────────────────────────────────┤
│  Agents      │  researcher                    ● running  │
│              │                                           │
│  coordinator │  调用工具: bash                             │
│  ✓ done      │    cmd: "find . -name *.ts"               │
│              │    [▶ 展开 (12 行)]                        │
│  researcher  │                                           │
│  ● running   │  正在分析项目结构...                         │
│              │                                           │
│  developer   │                                           │
│  ○ waiting   │                                           │
│              │                                           │
│  tester      │                                           │
│  ○ waiting   │                                           │
├──────────────┴──────────────────────────────────────────┤
│  Tasks: 1/4  ██░░░░░░░░  25%   in:1.2k out:800  [q]uit  │
└─────────────────────────────────────────────────────────┘
```

### 组件树

```
<App>                          — 状态管理，事件桥接
  <Box flexDirection="column">
    <Header />                 — 顶部标题栏（goal + token 摘要）
    <Box flexDirection="row">
      <AgentPanel />           — 左侧 agent 列表（固定宽度 20）
      <OutputPanel />          — 右侧输出面板（flex: 1）
    </Box>
    <StatusBar />              — 底部进度条
  </Box>
```

### 状态结构

```typescript
interface AgentState {
  name: string
  status: 'waiting' | 'running' | 'done' | 'failed'
  output: string          // 累积文字输出
  toolCalls: ToolCallEntry[]
}

interface ToolCallEntry {
  name: string
  input: unknown
  result?: string
  expanded: boolean
}

interface AppState {
  goal: string
  agents: AgentState[]
  selectedAgent: number   // index into agents[]
  totalTasks: number
  completedTasks: number
  tokenUsage: { input: number; output: number }
  done: boolean
}
```

---

## Feature D — AgentPanel（左侧）

### 显示格式

```
 Agents
 ──────────────
 coordinator
 ✓ done
                    ← 当前选中：青色高亮
▶ researcher        ← ▶ 表示选中
 ● running
 
 developer
 ○ waiting
 
 tester
 ○ waiting
```

**状态图标**：

| 状态 | 图标 | 颜色 |
|------|------|------|
| waiting | ○ | dim |
| running | ● | blue bold |
| done | ✓ | green |
| failed | ✗ | red |

**键盘**：`↑` / `↓` 切换选中 agent，循环（从最后一项 → 第一项）。

---

## Feature E — OutputPanel（右侧）

### 内容

显示 `agents[selectedAgent]` 的实时内容：

```
researcher                    ● running
────────────────────────────────────────
调用工具: bash
  cmd: "find . -name '*.ts' | head -20"
  [▶ 展开输出 (12 行)]

调用工具: file_read
  path: "src/index.ts"
  ✓ done (84 行)

正在分析项目结构，发现入口文件是 src/index.ts...
```

**工具调用卡片**：

- `tool_use` 事件：显示工具名 + 参数（截断到 80 字符）
- `tool_result` 到来时：更新为结果行数摘要，显示 `[▶ 展开 (N 行)]`
- `Enter` 键：展开/折叠当前卡片（显示完整输出）
- 展开后：`[▼ 折叠]`

**文字输出**：`text` 事件直接追加到 `agent.output`，在 Ink 中以 `<Text>` 渲染（自动换行）。

**滚动**：使用 `useRef` 追踪行数，输出超出面板高度时自动滚到底部（Ink v4 通过 `overflowY: 'hidden'` + 切片实现）。

---

## Feature F — StatusBar + 键盘快捷键

### 进度条格式

```
Tasks: 2/5  ████░░░░░░  40%   in: 1.2k  out: 800  [q]uit
```

进度条宽度 = 10 格，`█` 数 = `Math.floor(ratio * 10)`。

### 键盘映射

| 按键 | 动作 |
|------|------|
| `↑` / `↓` | 切换选中 agent |
| `Enter` | 展开/折叠选中工具调用卡片 |
| `q` | 退出（运行中显示 "Press q again to force quit"，再按一次强制退出） |
| `Tab` | 暂留 Phase 4 |

### 事件桥接

TUI 通过 `onProgress` + `onAgentStream` 回调接收框架事件：

```typescript
// 在 oma.ts / run.ts 的 TUI 分支中
const bridge = createTuiBridge()   // 返回 { dispatch, onProgress, onAgentStream }

const orchestrator = new OpenMultiAgent({
  ...
  onProgress: bridge.onProgress,
  onAgentStream: bridge.onAgentStream,
})

// bridge.dispatch 更新 React state
render(<App bridge={bridge} goal={goal} />)
```

---

## 涉及文件

| 操作 | 路径 |
|------|------|
| 修改（框架） | `src/types.ts` — 新增 `onAgentStream` |
| 修改（框架） | `src/orchestrator/orchestrator.ts` — 流式执行路径 |
| 新建 | `cli/tui/App.tsx` |
| 新建 | `cli/tui/AgentPanel.tsx` |
| 新建 | `cli/tui/OutputPanel.tsx` |
| 新建 | `cli/tui/StatusBar.tsx` |
| 新建 | `cli/tui/Header.tsx` |
| 新建 | `cli/tui/bridge.ts` — 框架事件 → React state |
| 新建 | `cli/tui/types.ts` — AppState / AgentState / ToolCallEntry |
| 修改 | `cli/commands/run.ts` — 加 `--tui` flag，TUI 执行分支 |
| 新建 | `cli/commands/tui.ts` — `oma tui` 命令（转发给 run --tui 逻辑） |
| 修改 | `cli/bin/oma.ts` — 注册 tui 命令 |
| 修改 | `package.json` — 新增 ink / react / @types/react |
| 修改 | `cli/tsconfig.cli.json` — 加 `"jsx": "react"` |
