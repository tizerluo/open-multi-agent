# Spec: Phase 1 CLI 单元测试

> 状态：待实现
> 最后更新：2026-04-24
> 关联 PRD：[prd-oma-cli-gui.md](../prd-oma-cli-gui.md)
> 背景：云环境只有 Anthropic API 可达，用户使用 OAuth 无法提供 API key，
>       需要用 mock 覆盖所有可自动化的 checklist 条目。

---

## 测试范围

| 文件 | 测试类型 | 备注 |
|------|----------|------|
| `cli/lib/stream-renderer.ts` | 纯函数单元测试 | 无需 mock Agent |
| `cli/commands/agent.ts` | 命令逻辑测试 | mock Agent + config-loader |
| `cli/commands/chat.ts` | REPL 逻辑测试 | mock Agent + readline + config-loader |

**不测试**（留给用户本地人工验收）：
- 流式字符逐步出现的视觉效果
- 真实 LLM 多轮上下文质量
- Spinner / chalk 颜色渲染

---

## 测试文件位置

```
tests/
└── cli/
    ├── stream-renderer.test.ts
    ├── agent.test.ts
    └── chat.test.ts
```

---

## Mock 策略

### Agent mock（agent.test.ts 和 chat.test.ts 共用模式）

```typescript
vi.mock('../../src/agent/agent.js', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    stream: vi.fn(),
    prompt: vi.fn(),
    reset: vi.fn(),
    getTools: vi.fn().mockReturnValue(['bash', 'file_read']),
  }))
}))
```

`stream` 返回一个 `AsyncIterable<StreamEvent>`，通过辅助函数构造：

```typescript
async function* makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const e of events) yield e
}
```

`prompt` 返回 `Promise<AgentRunResult>`：

```typescript
const fakeResult = {
  output: 'hello',
  success: true,
  tokenUsage: { input_tokens: 10, output_tokens: 20 },
}
mockAgent.prompt.mockResolvedValue(fakeResult)
```

### config-loader mock

```typescript
vi.mock('../../cli/lib/config-loader.js', () => ({
  loadConfig: vi.fn(() => ({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })),
  assertApiKey: vi.fn(() => 'sk-fake-key'),
}))
```

### readline mock（chat.test.ts）

```typescript
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  }))
}))
```

### process.stdout.write spy（stream-renderer.test.ts）

```typescript
const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
afterEach(() => writeSpy.mockReset())
```

---

## 沿用现有项目 mock 模式

项目已有以下可参考的测试模式（**只读，不修改**）：

| 文件 | 参考用途 |
|------|----------|
| `tests/helpers/llm-fixtures.ts` | `collectEvents()` 收集 AsyncIterable 事件 |
| `tests/agent-hooks.test.ts` | `buildMockAgent()` 直接注入 runner 的模式 |
| `tests/orchestrator.test.ts` | `createMockAdapter()` 模式 |

---

## 关键约束

- 测试文件使用 `.test.ts` 后缀，放在 `tests/cli/`
- 所有 import 路径与 `tests/` 下现有文件保持一致（`../../src/...`、`../../cli/...`）
- `vi.clearAllMocks()` 在 `beforeEach` 中调用，确保测试隔离
- 不使用 `vi.stubGlobal('process', ...)` 整体替换，避免影响其他测试；只 spy 具体方法
