# Phase 2 Checklist — 计划确认 + 文件输入 + 结果保存 + 历史记录

> 关联 Tasks：[phase2-plan-file-history-tasks.md](./phase2-plan-file-history-tasks.md)
> 状态：待验收

---

## 前置

- [ ] `npm test` 基线全绿（28 files，459 tests）
- [ ] 基于最新 main 开新分支 `feat/phase2-plan-file-history`

---

## A. 框架改动（T-01 + T-02）

```bash
npm run lint     # tsc --noEmit
npm test
```
- [ ] `OrchestratorConfig` 含 `onPlanReady?: (tasks: Task[]) => Promise<boolean>`
- [ ] `npm run lint` 无报错
- [ ] `npm test` 全部通过（现有测试不受影响）

---

## B. `--file` / `--context`（T-03）

### B-1 oma agent --file
```bash
echo "Write hello world in Python" > /tmp/task.txt
oma agent --file /tmp/task.txt --no-stream   # 需 API key，或用 mock 验逻辑
```
- [ ] `--file` 读取文件内容作为 prompt

### B-2 互斥校验
```bash
oma agent "hello" --file /tmp/task.txt
```
- [ ] 报错：不能同时使用位置参数和 --file
- [ ] 退出码非 0

### B-3 文件不存在
```bash
oma agent --file /tmp/nonexistent.txt
```
- [ ] 报错：清晰的文件不存在提示
- [ ] 退出码非 0

### B-4 --context 单文件
```bash
oma agent "Summarise this file" --context /tmp/task.txt --no-stream
```
- [ ] context 内容拼接到 prompt 后

### B-5 --context 目录
```bash
mkdir -p /tmp/ctx && echo "a" > /tmp/ctx/a.ts && echo "b" > /tmp/ctx/b.ts
oma agent "review" --context /tmp/ctx --no-stream
```
- [ ] 目录下所有文件内容均拼接

### B-6 pipe stdin
```bash
echo "Count to 5" | oma agent --no-stream
```
- [ ] pipe 内容作为 prompt

---

## C. `--output` / `--force`（T-04）

### C-1 保存结果
```bash
oma agent "Say hello" --no-stream --output /tmp/out.txt
cat /tmp/out.txt
```
- [ ] 文件内容与终端输出一致

### C-2 覆盖确认（TTY 场景，人工验收）
```bash
oma agent "Say hello" --no-stream --output /tmp/out.txt
# 输入 n
```
- [ ] 询问是否覆盖
- [ ] 输入 n → Aborted，文件未被修改

### C-3 --force 跳过确认
```bash
oma agent "Say hello" --no-stream --output /tmp/out.txt --force
```
- [ ] 不询问，直接覆盖

---

## D. 计划确认（T-05）

### D-1 展示计划（人工验收，需 API key）
```bash
oma run "Build a todo CLI in TypeScript"
```
- [ ] 打印 Goal + Proposed plan（含任务编号、assignee）
- [ ] 依赖显示为 `(depends on: 1)` 格式
- [ ] 提示 `Proceed? [Y/n]`

### D-2 输入 n 中止
```bash
# 在提示时输入 n
```
- [ ] 打印 "Cancelled."
- [ ] 退出码 0
- [ ] 不消耗执行 token（coordinator 分解已消耗除外）

### D-3 --yes 跳过确认
```bash
oma run "Build a todo CLI" --yes
```
- [ ] 直接执行，不显示确认提示

### D-4 非 TTY 自动跳过
```bash
oma run "Build a todo CLI" | cat
```
- [ ] 不挂起等待输入，直接执行

---

## E. `oma history`（T-06 + T-07）

### E-1 执行后自动写入
```bash
oma agent "Say hello" --no-stream
ls ~/.oma/history/
```
- [ ] 存在以时间戳命名的 `.json` 文件

### E-2 history 列表
```bash
oma history
```
- [ ] 显示最近执行记录，含编号、时间、模式、目标、token

### E-3 history show
```bash
oma history show 1
```
- [ ] 显示完整输出内容 + 执行摘要

### E-4 history rerun（需 API key，人工验收）
```bash
oma history rerun 1
```
- [ ] 用相同目标重新执行

### E-5 history clear
```bash
oma history clear
# 输入 y 确认
oma history
```
- [ ] 清空后列表为空

### E-6 --limit 参数
```bash
oma history --limit 5
```
- [ ] 最多显示 5 条

---

## F. 回归

```bash
npm test
```
- [ ] 459+ tests，0 failures

```bash
npm run build:cli && node dist-cli/cli/bin/oma.js --help
```
- [ ] 所有命令正常显示
- [ ] `history` 出现在命令列表

```bash
npm run lint
```
- [ ] 无 TypeScript 报错

---

## 完成标准

自动化验收（云端可跑）：F 全部通过 + A、B-2、B-3、C-1、C-3、E-1、E-2、E-3、E-5、E-6 通过。

需本地人工验收（需 API key / TTY）：B-1、B-4、B-5、B-6、C-2、D-1、D-2、D-3、D-4、E-4。
