# Phase 3 Checklist — Ink TUI 基础框架

> 关联 Tasks：[phase3-tui-tasks.md](./phase3-tui-tasks.md)
> 状态：待验收

---

## 前置

- [ ] `npm test` 基线全绿（459 tests）
- [ ] 基于最新 main 开新分支 `feat/phase3-tui`

---

## A. 框架改动（T-02 + T-03）

```bash
npm run lint
npm test
```

- [ ] `OrchestratorConfig` 含 `onAgentStream?: (agentName: string, event: StreamEvent) => void`
- [ ] `npm run lint` 无报错
- [ ] `npm test` 全部通过（现有测试不受影响）
- [ ] 不传 `onAgentStream` 时 `runTeam` 行为与之前完全一致

---

## B. 依赖 + tsconfig（T-01）

```bash
node -e "import('ink').then(m => console.log('ink ok'))"
npm run build:cli
```

- [ ] `ink`、`react`、`@types/react` 已安装
- [ ] `cli/tsconfig.cli.json` 含 `"jsx": "react"`
- [ ] `npm run build:cli` 无 JSX 相关报错

---

## C. TUI 组件（T-04~T-08）

```bash
npm run build:cli
```

- [ ] `cli/tui/types.ts` — AppState / AgentState / ToolCallEntry / AppAction 完整
- [ ] `cli/tui/bridge.ts` — `createTuiBridge` 正确映射 onProgress / onAgentStream
- [ ] `cli/tui/reducer.ts` — 纯函数，所有 action 分支覆盖
- [ ] `cli/tui/App.tsx` — useReducer + useEffect 订阅 + useInput 键盘处理
- [ ] `cli/tui/AgentPanel.tsx` — 状态图标正确，选中高亮
- [ ] `cli/tui/OutputPanel.tsx` — 工具调用卡片显示，文字截取
- [ ] `cli/tui/StatusBar.tsx` — 进度条计算正确

---

## D. 集成入口（T-09）

```bash
npm run build:cli
node dist-cli/cli/bin/oma.js --help
node dist-cli/cli/bin/oma.js run --help
node dist-cli/cli/bin/oma.js tui --help
```

- [ ] `oma --help` 显示 `tui` 命令
- [ ] `oma run --help` 显示 `--tui` flag
- [ ] `oma tui --help` 正常显示

---

## E. TUI 人工验收（需 API key，本地）

### E-1 基础布局（需 API key）

```bash
oma run "列出3种流行编程语言" --tui
```

- [ ] 双面板布局正确渲染（左 Agent 树，右输出）
- [ ] 顶部标题显示 goal
- [ ] 底部进度条显示任务进度

### E-2 Agent 状态切换

```bash
oma run "Build a todo CLI" --tui
```

- [ ] Agent 状态从 ○ waiting → ● running → ✓ done 依次变化
- [ ] 完成的 agent 显示绿色 ✓

### E-3 键盘导航

- [ ] ↑/↓ 切换选中 agent，右侧面板内容随之更新
- [ ] q 退出 TUI，进程正常结束

### E-4 工具调用卡片

- [ ] tool_use 出现时显示工具名 + 参数预览
- [ ] tool_result 到来后显示行数摘要
- [ ] Enter 键展开/折叠卡片

### E-5 oma tui 别名

```bash
oma tui "列出3种流行编程语言"
```

- [ ] 效果与 `oma run --tui` 相同

---

## F. 回归

```bash
npm test
```

- [ ] 459+ tests，0 failures

```bash
npm run build:cli
node dist-cli/cli/bin/oma.js --help
```

- [ ] 所有原有命令正常（agent、run、chat、history、init、config）
- [ ] `tui` 出现在命令列表

```bash
npm run lint
```

- [ ] 无 TypeScript 报错

---

## 完成标准

**自动化验收**（云端可跑）：F 全部 + A + B + C + D 通过。

**本地人工验收**（需 API key）：E-1 ~ E-5。
