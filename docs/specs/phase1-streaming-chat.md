# Spec: Phase 1 — CLI 流式输出 + oma chat

> 状态：待实现
> 最后更新：2026-04-24
> 关联 PRD：[prd-oma-cli-gui.md](../prd-oma-cli-gui.md) §4.2.1 / §4.2.2

---

## Feature A — `oma agent` 流式输出

### 当前行为

调用 `orchestrator.runAgent()` → 等待完成 → 打印结果。

### 目标行为

字符逐步打印，工具调用实时可见。

### 框架 API

`Agent.stream(prompt)` 已存在，yield `StreamEvent`：

| type | data | 含义 |
|------|------|------|
| `text` | `string` | 文字 delta，直接 `process.stdout.write` |
| `tool_use` | `{ name, input }` | 工具调用开始 |
| `tool_result` | `{ tool_use_id, content }` | 工具返回结果 |
| `done` | `AgentRunResult` | 完成，含 tokenUsage |
| `error` | `Error` | 报错 |

### 实现方案

`oma agent` 目前走 `orchestrator.runAgent()`，没有流式路径。改为直接构造 `Agent` 实例调 `agent.stream(prompt)`。

```typescript
// cli/commands/agent.ts

import { Agent } from '../../src/agent/agent.js'

// 流式路径（默认）：
const agent = new Agent(agentConfig)
for await (const event of agent.stream(prompt)) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.data as string)
      break
    case 'tool_use': {
      const { name, input } = event.data as { name: string; input: unknown }
      console.log(chalk.dim(`\n[tool: ${name}] ${JSON.stringify(input).slice(0, 80)}…`))
      break
    }
    case 'tool_result':
      console.log(chalk.dim('  → done'))
      break
    case 'done': {
      const result = event.data as AgentRunResult
      // 打印 token 摘要
      break
    }
    case 'error':
      exitWithError(...)
  }
}
```

### 新增 flag

```
--no-stream    关闭流式输出（用于管道/脚本场景）
```

- 默认开启流式
- 检测 `!process.stdout.isTTY` 时自动降级为非流式（避免管道收到控制字符）

### 验收标准

- [ ] 字符实时出现，不等待完成
- [ ] 工具调用显示 `[tool: bash] {"cmd":"ls"}…`，结果返回后显示 `→ done`
- [ ] `--no-stream` 保留原有（spinner）行为
- [ ] `oma agent "..." | cat` 自动用非流式路径（isTTY 检测）
- [ ] token 摘要仍然打印

### 涉及文件

| 文件 | 操作 |
|------|------|
| `cli/commands/agent.ts` | 修改，接入 Agent.stream() |
| `cli/lib/stream-renderer.ts` | 新建，抽取流式渲染逻辑 |

---

## Feature B — `oma chat` 多轮对话

### 框架 API

| 方法 | 说明 |
|------|------|
| `Agent.prompt(message)` | 多轮，使用 `messageHistory`，非流式，返回 `AgentRunResult` |
| `Agent.reset()` | 清空历史 |
| `Agent.getHistory()` | 读取历史（用于 `/tools` 展示） |

> **注意**：框架目前没有流式多轮 API（`stream()` 不带历史）。`oma chat` 先用非流式 `prompt()`，Phase 3 可考虑加 `promptStream()`。

### 命令签名

```bash
oma chat [options]

Options:
  -m, --model <model>       模型名
  -p, --provider <provider> provider
  -s, --system <prompt>     系统提示词
  --tools <a,b,c>           工具列表
  --config <path>           配置文件路径
```

### REPL 循环逻辑

```
启动 → 打印欢迎语 + 快捷键说明
  ↓
readline 读取一行用户输入
  ↓
空行 → 忽略，继续等待
以 / 开头 → 分发特殊指令
否则 → agent.prompt(input) → 打印输出 → 回到等待
  ↓
REPL 结束（/exit 或 Ctrl+C） → 打印 token 汇总 → process.exit(0)
```

### 特殊指令

| 指令 | 行为 |
|------|------|
| `/exit` 或 `/quit` | 退出，打印累计 token 用量 |
| `/clear` | 调用 `agent.reset()`，打印"对话已清空" |
| `/tools` | 打印已注册工具列表 |
| `/help` | 打印特殊指令说明 |

### 欢迎语格式

```
oma chat — claude-sonnet-4-6 (anthropic)
Tools: bash, file_read, file_write
Type /help for commands, Ctrl+C to exit.
────────────────────────────────────────

You: _
```

### 对话输出格式

```
You: 帮我分析一下这段代码有没有 bug

Agent: 我来分析一下…
[整段回复，完成后换行]

You: _
```

工具调用显示（非流式）：

```
[calling bash: ls -la]
[done — 12 lines]
```

### Ctrl+C 处理

```typescript
process.on('SIGINT', () => {
  console.log('\n\nExiting...')
  // 打印 token 汇总
  process.exit(0)
})
```

readline 的 `close` 事件也触发退出。

### token 汇总格式

```
────────────────────────────────────────
Session ended. Tokens: 1,240 in / 820 out (3 turns)
```

### 验收标准

- [ ] 多轮引用前文内容正确
- [ ] `/clear` 后 Agent 不记得之前的对话
- [ ] `/tools` 列出已注册工具
- [ ] Ctrl+C 不报错，打印 token 汇总
- [ ] 空行不触发 LLM 调用
- [ ] 无配置 / 无 API key 时报错退出（与其他命令行为一致）

### 涉及文件

| 文件 | 操作 |
|------|------|
| `cli/commands/chat.ts` | 新建 |
| `cli/bin/oma.ts` | 注册 chat 命令 |
| `cli/lib/stream-renderer.ts` | 工具调用显示逻辑复用 |

---

## 实现顺序

```
1. cli/lib/stream-renderer.ts     — 抽取工具调用渲染逻辑
2. cli/commands/agent.ts          — 接入 Agent.stream()，加 --no-stream
3. cli/commands/chat.ts           — REPL 循环，Agent.prompt()
4. cli/bin/oma.ts                 — 注册 chat
5. npm run build:cli              — 编译
6. 逐项验收
```
