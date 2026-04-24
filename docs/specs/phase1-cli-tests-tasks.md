# Phase 1 CLI Tests — Tasks

> 关联 Spec：[phase1-cli-tests-spec.md](./phase1-cli-tests-spec.md)
> 状态：待开始

---

## 任务依赖图

```
T-01 [直接]      更新 vitest config
  │
  ├── T-02 [subagent A]  stream-renderer.test.ts ─┐
  │                                                ├── review A+B
  └── T-03 [subagent B]  agent.test.ts ───────────┘
                                                    │
                                               T-04 [subagent C]  chat.test.ts
                                                    │
                                               review C + 整体 review
                                                    │
                                               commit + push
```

T-02 和 T-03 可并行，T-04 在 T-02/T-03 review 通过后开始。

---

## T-01 更新 vitest.config.ts  [直接]

**改动**：将 `cli/**` 加入 coverage include。

```typescript
// vitest.config.ts
coverage: {
  include: ['src/**', 'cli/**'],
}
```

**验收**：`npm test` 运行通过（即使 tests/cli/ 目录不存在也不报错）。

---

## T-02 新建 tests/cli/stream-renderer.test.ts  [subagent A]

**测试对象**：`cli/lib/stream-renderer.ts` 的 `renderStreamEvent(event)`

**需要给 subagent 的上下文**：
- 被测文件路径：`cli/lib/stream-renderer.ts`
- 参考测试模式：`tests/agent-hooks.test.ts`（vi.spyOn 用法）
- `StreamEvent` 类型：`src/types.ts` 第 96-99 行
- `ToolUseBlock`：`src/types.ts` 第 24-29 行
- `ToolResultBlock`：`src/types.ts` 第 35-40 行

**测试用例**：

| 用例 | 输入 | 预期 |
|------|------|------|
| text 事件 | `{ type: 'text', data: 'hello' }` | `process.stdout.write('hello')` 被调用 |
| tool_use 短输入 | name='bash', input={cmd:'ls'} | write 包含 `[tool: bash]` 和 `{"cmd":"ls"}` |
| tool_use 长输入（>80字符） | input 的 JSON 序列化 > 80 字符 | write 的内容截断到 80 字符并加 `…` |
| tool_result 正常 1 行 | content='ok', is_error=false | write 包含 `→ done (1 line)` |
| tool_result 多行 | content='a\nb\nc' | write 包含 `→ done (3 lines)` |
| tool_result 错误 | is_error=true | write 包含 `→ error` |
| done 事件 | `{ type: 'done', data: {} }` | write **不**被调用 |
| error 事件 | `{ type: 'error', data: {} }` | write **不**被调用 |

**mock 设置**：
```typescript
const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
beforeEach(() => writeSpy.mockClear())
```

---

## T-03 新建 tests/cli/agent.test.ts  [subagent B]（与 T-02 并行）

**测试对象**：`cli/commands/agent.ts` — `registerAgentCommand()` 内的逻辑

**需要给 subagent 的上下文**：
- 被测文件路径：`cli/commands/agent.ts`
- 流式路径走 `Agent.stream()`，非流式走 `OpenMultiAgent.runAgent()`
- Commander `--no-stream` → `opts.stream = false`（非 `opts.noStream`）
- `useStream = opts.stream !== false && !!process.stdout.isTTY`
- 参考 mock 模式：`tests/orchestrator.test.ts`

**需要 mock 的模块**：
```
../../src/agent/agent.js     → Agent（stream 方法）
../../src/index.js           → OpenMultiAgent（runAgent 方法）
../../src/tool/framework.js  → ToolRegistry
../../src/tool/executor.js   → ToolExecutor
../../src/tool/built-in/index.js → registerBuiltInTools
../lib/config-loader.js      → loadConfig, assertApiKey
../lib/error-handler.js      → exitWithError
../lib/stream-renderer.js    → renderStreamEvent
../lib/progress-renderer.js  → createProgressRenderer
```

**测试用例**：

| 用例 | 条件 | 预期 |
|------|------|------|
| 流式路径（TTY） | `isTTY=true`, `stream` 未设置 | 调用 `Agent.stream()`，不调用 `runAgent` |
| 非流式路径（--no-stream） | `opts.stream=false`, `isTTY=true` | 调用 `runAgent()`，不调用 `Agent.stream()` |
| 非流式路径（非 TTY） | `isTTY=undefined`, `stream` 未设置 | 调用 `runAgent()`，不调用 `Agent.stream()` |
| max-turns 校验 | `--max-turns abc` | 调用 `exitWithError` |
| max-turns 校验 | `--max-turns 0` | 调用 `exitWithError` |
| tools 解析 | `--tools bash,file_read` | agentConfig.tools = ['bash', 'file_read'] |
| stream done 事件 | stream 返回 done 事件 | 打印 token 摘要 |
| stream error 事件 | stream 返回 error 事件 | 调用 `exitWithError` |
| result.success=false | runAgent 返回 success:false | 调用 `process.exit(1)` |

**辅助函数**（在测试文件内定义）：
```typescript
async function* makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const e of events) yield e
}
```

---

## T-04 新建 tests/cli/chat.test.ts  [subagent C]

**测试对象**：`cli/commands/chat.ts` — REPL 逻辑、slash 命令、退出处理

**需要给 subagent 的上下文**：
- 被测文件路径：`cli/commands/chat.ts`
- readline 的 `question(prompt, cb)` 调用 cb 来模拟用户输入
- `handleSlashCommand` 返回 `boolean`：true=继续，false=停止
- `exiting` flag 防止 SIGINT + close 双重触发
- `agent.reset()` 对应 `/clear`，`rl.close()` 对应 `/exit`

**需要 mock 的模块**：
```
node:readline                → createInterface（question/close/on）
../../src/agent/agent.js     → Agent（prompt/reset/getTools）
../../src/tool/framework.js  → ToolRegistry
../../src/tool/executor.js   → ToolExecutor
../../src/tool/built-in/index.js → registerBuiltInTools
../lib/config-loader.js      → loadConfig, assertApiKey
../lib/error-handler.js      → exitWithError
```

**测试用例**：

| 用例 | 模拟输入 | 预期 |
|------|----------|------|
| 空行跳过 | `''` | 不调用 `agent.prompt()` |
| 正常输入 | `'hello'` | 调用 `agent.prompt('hello')` |
| token 累加 | 两次 prompt，各返回不同 token | totalIn/totalOut 正确累加 |
| /clear | `/clear` | 调用 `agent.reset()`，返回 true（继续） |
| /exit | `/exit` | 调用 `rl.close()`，返回 false（停止） |
| /quit | `/quit` | 同 /exit |
| /tools | `/tools` | 不调用 `agent.prompt()`，返回 true |
| /help | `/help` | 不调用 `agent.prompt()`，返回 true |
| 未知命令 | `/unknown` | 不调用 `agent.prompt()`，返回 true |
| SIGINT guard | 触发两次 SIGINT handler | `process.exit` 只被调用一次 |
| prompt 报错 | `agent.prompt` reject | console.error 打印，不 crash |

**注意**：测试 `handleSlashCommand` 时直接导入并调用该函数（需要从模块导出，或测试通过 readline mock 间接验证）。

---

## review 节点

| 节点 | 触发条件 | review subagent 检查内容 |
|------|----------|--------------------------|
| review A+B | T-02 + T-03 完成 | 测试用例完整性、mock 正确性、`npm test` 通过 |
| review C | T-04 完成 | 同上，额外检查 readline mock 正确性 |
| 整体 review | 全部 task 完成 | `npm test` 全绿、覆盖率合理、无多余 skip |
