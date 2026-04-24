# Phase 1 Checklist — CLI 流式输出 + oma chat

> 关联 Tasks：[phase1-tasks.md](./phase1-tasks.md)
> 状态：待验收

验收前置条件：`npm run build:cli` 通过，`ANTHROPIC_API_KEY`（或其他 provider key）已设置。

---

## A. oma agent 流式输出

### A-1 编译
- [ ] `npm run build:cli` 退出码 0，无 TypeScript 报错

### A-2 Flag 可见性
```bash
oma agent --help
```
- [ ] `--no-stream` 出现在 options 列表

### A-3 流式输出效果
```bash
oma agent "Count from 1 to 10, one number per line"
```
- [ ] 数字逐行出现（非一次性输出）
- [ ] token 摘要打印在最后

### A-4 工具调用可见性
```bash
oma agent "Use bash to list files in /tmp" --tools bash
```
- [ ] 出现 `[tool: bash]` 行，带输入预览
- [ ] 出现 `  → done` 行

### A-5 --no-stream 保留原行为
```bash
oma agent "Say hello" --no-stream
```
- [ ] spinner 出现
- [ ] 输出完成后才打印结果（非逐字）

### A-6 非 TTY 自动降级
```bash
oma agent "Say hello" | cat
```
- [ ] 输出为纯文本，无 ANSI 控制字符 / spinner 残留

---

## B. oma chat 多轮对话

### B-1 编译 & 注册
```bash
oma --help
```
- [ ] `chat` 出现在命令列表

```bash
oma chat --help
```
- [ ] 显示 `--model`, `--provider`, `--system`, `--tools`, `--config` 所有 options

### B-2 欢迎语
```bash
oma chat
```
- [ ] 显示 model 名称和 provider
- [ ] 显示 tools 列表
- [ ] 显示快捷键说明（/help, Ctrl+C）

### B-3 多轮上下文保持
- 输入：`My name is Alice`
- 输入：`What is my name?`
- [ ] Agent 回答 "Alice"

### B-4 /clear 清空历史
- 输入：`My name is Alice`
- 输入：`/clear`
- [ ] 打印"对话已清空"
- 输入：`What is my name?`
- [ ] Agent **不知道**名字（历史已清空）

### B-5 /tools
```
/tools
```
- [ ] 打印工具名称列表

### B-6 /help
```
/help
```
- [ ] 打印所有可用 slash 命令说明

### B-7 空行无操作
- 按 Enter（空行）
- [ ] 无 LLM 调用，prompt 重新出现

### B-8 Ctrl+C 优雅退出
- 启动 `oma chat`，按 Ctrl+C
- [ ] 无 stack trace / unhandled error
- [ ] 打印 session summary（tokens + turns）
- [ ] shell 恢复正常（无残留进程）

### B-9 /exit token 汇总
- 完成 2-3 轮对话后输入 `/exit`
- [ ] 打印格式：`Session ended. Tokens: X in / Y out (N turns)`
- [ ] 进程退出码 0

### B-10 无 API key 时错误处理
```bash
env -i PATH=$PATH HOME=$HOME oma chat
```
- [ ] 清晰错误提示（不是 stack trace）
- [ ] 退出码非 0

---

## C. 回归测试

### C-1 oma agent 非流式路径不受影响
```bash
oma agent "Say hello" --no-stream
```
- [ ] 行为与 Phase 1 之前完全一致

### C-2 oma run 不受影响
```bash
oma run --help
```
- [ ] help 输出无变化，无新 bug

### C-3 oma init / config show 不受影响
```bash
oma init --help
oma config show
```
- [ ] 正常运行，无报错

---

## 完成标准

上述所有勾选框全部通过后，Phase 1 视为完成，可开分支合并 main 并开始 Phase 2 spec。
