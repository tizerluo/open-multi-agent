# Phase 1 CLI Tests — Checklist

> 关联 Tasks：[phase1-cli-tests-tasks.md](./phase1-cli-tests-tasks.md)
> 状态：待验收

---

## 前置条件

- [ ] `npm test` 在加入 CLI 测试前已全部通过（基线确认）

---

## A. 基础配置

### A-1 vitest config 更新
```bash
grep "cli" vitest.config.ts
```
- [ ] 输出包含 `cli/**`

### A-2 测试文件可发现
```bash
npm test -- --reporter=verbose 2>&1 | grep "cli/"
```
- [ ] 列出 `tests/cli/stream-renderer.test.ts`、`agent.test.ts`、`chat.test.ts`

---

## B. stream-renderer.test.ts

```bash
npm test -- tests/cli/stream-renderer.test.ts
```
- [ ] 全部通过，无 skip

**具体用例**：
- [ ] `text` 事件 → `process.stdout.write` 收到原始字符串
- [ ] `tool_use` 短输入 → 输出含 `[tool: bash]`
- [ ] `tool_use` 长输入（>80字符）→ 输出在 80 字符处截断并有 `…`
- [ ] `tool_result` 1行 → 含 `→ done (1 line)`
- [ ] `tool_result` 3行 → 含 `→ done (3 lines)`
- [ ] `tool_result` 错误 → 含 `→ error`
- [ ] `done` 事件 → `write` 不被调用
- [ ] `error` 事件 → `write` 不被调用

---

## C. agent.test.ts

```bash
npm test -- tests/cli/agent.test.ts
```
- [ ] 全部通过，无 skip

**具体用例**：
- [ ] TTY + 无 `--no-stream` → 走流式路径（调用 `Agent.stream`）
- [ ] TTY + `--no-stream` → 走 spinner 路径（调用 `OpenMultiAgent.runAgent`）
- [ ] 非 TTY + 无 `--no-stream` → 走 spinner 路径
- [ ] `--max-turns abc` → 调用 `exitWithError`
- [ ] `--max-turns 0` → 调用 `exitWithError`
- [ ] `--tools bash,file_read` → tools 数组正确解析
- [ ] stream `done` 事件 → token 摘要输出
- [ ] stream `error` 事件 → 调用 `exitWithError`
- [ ] `result.success=false` → 调用 `process.exit(1)`

---

## D. chat.test.ts

```bash
npm test -- tests/cli/chat.test.ts
```
- [ ] 全部通过，无 skip

**具体用例**：
- [ ] 空行输入 → 不调用 `agent.prompt`
- [ ] 正常输入 `'hello'` → 调用 `agent.prompt('hello')`
- [ ] 两轮 prompt → token 正确累加（in + out 各自累加）
- [ ] `/clear` → 调用 `agent.reset()`，REPL 继续
- [ ] `/exit` → 调用 `rl.close()`，REPL 停止
- [ ] `/quit` → 同 `/exit`
- [ ] `/tools` → 不调用 `agent.prompt`，REPL 继续
- [ ] `/help` → 不调用 `agent.prompt`，REPL 继续
- [ ] 未知 `/foo` → 不 crash，REPL 继续
- [ ] SIGINT 触发两次 → `process.exit` 只调用一次（exiting guard）
- [ ] `agent.prompt` 抛错 → 打印错误，不 crash

---

## E. 整体

```bash
npm test
```
- [ ] 全部测试通过，0 failures，0 skipped
- [ ] 无 TypeScript 编译报错

```bash
npm test -- --coverage 2>&1 | grep "cli/"
```
- [ ] `cli/lib/stream-renderer.ts` 有覆盖率数据
- [ ] `cli/commands/agent.ts` 有覆盖率数据
- [ ] `cli/commands/chat.ts` 有覆盖率数据

---

## 完成标准

以上所有勾选框通过后，Phase 1 CLI 测试视为完成，可 commit + push + PR。
