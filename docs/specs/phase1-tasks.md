# Phase 1 Tasks — CLI 流式输出 + oma chat

> 关联 Spec：[phase1-streaming-chat.md](./phase1-streaming-chat.md)
> 状态：待开始

---

## T-01 新建 `cli/lib/stream-renderer.ts`

**目标**：抽取流式渲染逻辑为独立模块，供 `oma agent` 和 `oma chat` 共用。

**导出**：
```typescript
export function renderStreamEvent(event: StreamEvent, opts?: { prefix?: string }): void
```

**各事件处理**：

| event.type | 行为 |
|------------|------|
| `text` | `process.stdout.write(data as string)` |
| `tool_use` | `chalk.dim('\n[tool: <name>] <input preview>…')` |
| `tool_result` | `chalk.dim('  → done')` |
| `error` | 抛出 Error（由调用方处理） |
| `done` | 返回（调用方负责打印 token 汇总） |

**input preview** 规则：`JSON.stringify(input).slice(0, 80)`，超出加 `…`。

---

## T-02 修改 `cli/commands/agent.ts` — 接入流式路径

**改动列表**：

1. Commander 定义新增 `--no-stream` option
2. 计算 `useStream`：
   ```typescript
   const useStream = !opts.noStream && process.stdout.isTTY
   ```
3. 流式路径（`useStream === true`）：
   - 去掉 `createProgressRenderer()` + spinner
   - 导入 `Agent` from `../../src/agent/agent.js`
   - 构造 `Agent(agentConfig)`
   - `for await (const event of agent.stream(prompt))` → `renderStreamEvent(event)`
   - `done` 事件后打印 token 摘要
4. 非流式路径（`useStream === false`）：保留现有 `orchestrator.runAgent()` + spinner 逻辑不变

**token 摘要格式**（流式路径）：
```
\n────────────────────────────────────────
Tokens: 320 in / 180 out
```

---

## T-03 新建 `cli/commands/chat.ts`

**接口定义**：
```typescript
interface ChatOpts {
  model?: string
  provider?: string
  system?: string
  tools?: string
  config?: string
}
```

**实现步骤**：

1. 解析 opts → 构建 `agentConfig`（与 agent.ts 相同逻辑：loadConfig、assertApiKey、tools 列表）
2. 构造 `Agent(agentConfig)` 实例
3. 初始化累计 token 计数器 `let totalIn = 0, totalOut = 0, turns = 0`
4. 注册 SIGINT 处理：
   ```typescript
   process.on('SIGINT', () => {
     console.log('\n')
     printSessionSummary(totalIn, totalOut, turns)
     process.exit(0)
   })
   ```
5. 打印欢迎语（含 model、provider、tools、快捷键说明）
6. 创建 readline interface（stdin/stdout）
7. REPL 循环（递归 `askQuestion()`）：
   - 空行 → 跳过
   - `/` 开头 → 分发特殊指令
   - 否则 → 打印 `Agent: ` 前缀，spinner → `agent.prompt(input)` → 停止 spinner → 打印输出
   - 累加 tokenUsage，turns++
8. readline `close` 事件 → 打印 session summary → exit(0)

**特殊指令分发**：
```typescript
function handleSlashCommand(cmd: string, agent: Agent, rl: Interface): void {
  switch (cmd.trim()) {
    case '/clear':   agent.reset(); console.log(chalk.dim('对话已清空')); break
    case '/exit':
    case '/quit':    rl.close(); break
    case '/tools':   console.log(agentConfig.tools?.join(', ') ?? '(none)'); break
    case '/help':    printHelp(); break
    default:         console.log(chalk.yellow(`Unknown command: ${cmd}`))
  }
}
```

**session summary 格式**：
```
────────────────────────────────────────
Session ended. Tokens: 1,240 in / 820 out (3 turns)
```

---

## T-04 注册 chat 命令到 `cli/bin/oma.ts`

```typescript
import { registerChatCommand } from '../commands/chat.js'
// ...
registerChatCommand(program)
```

---

## T-05 编译验证

```bash
npm run build:cli
node dist-cli/cli/bin/oma.js --help        # chat 出现在命令列表
node dist-cli/cli/bin/oma.js agent --help  # --no-stream 出现
node dist-cli/cli/bin/oma.js chat --help   # 所有 option 显示正确
```

---

## 任务依赖关系

```
T-01  ──►  T-02
      ──►  T-03  ──►  T-04  ──►  T-05
```

T-01 先完成，T-02 和 T-03 可并行，T-04 依赖 T-03，T-05 依赖全部。
