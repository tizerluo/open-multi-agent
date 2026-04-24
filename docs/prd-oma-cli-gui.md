# PRD：oma CLI + TUI

> 状态：草稿 v0.2
> 最后更新：2026-04-24

---

## 1. 产品背景

open-multi-agent 是一个 TypeScript 多智能体编排框架，核心能力是"给定目标，自动分解任务、协调多个 AI Agent 并行执行、汇总结果"。

框架目前是纯代码库，使用门槛较高。**oma** 是它的终端入口，目标是让用户无需写代码，直接在终端下达目标、观察过程、拿到结果。

---

## 2. 目标用户

**主要用户**：有技术背景但不想写代码的使用者。能在终端里操作，熟悉 AI 工具，希望通过自然语言驱动多智能体完成复杂任务。

**使用设备**：macOS（主），兼容 Linux。

---

## 3. 产品目标

1. **可用**：用一条命令完成从配置到执行的全流程
2. **可见**：实时看到每个 Agent 在做什么、说了什么、调用了哪些工具
3. **可控**：执行前看到计划，可以确认、修改或取消
4. **可扩展**：支持不同 provider、不同 agent 组合、自定义工具

---

## 4. 功能模块

### 4.1 CLI 基础命令（已完成）

| 命令 | 功能 |
|------|------|
| `oma init` | 交互式初始化，生成 `~/.oma/config.json` |
| `oma config show` | 显示当前生效配置 |
| `oma agent "<提示词>"` | 单 Agent 执行，支持 `--model`、`--provider`、`--tools` 等参数 |
| `oma run "<目标>"` | 多 Agent 团队自动编排执行 |

---

### 4.2 CLI 功能增强

#### 4.2.1 流式输出

**现状**：Agent 执行时只显示 spinner，完成后才显示结果。

**目标**：Agent 输出逐字实时显示，工具调用实时可见。

**验收标准**：
- `oma agent` 和 `oma run` 默认开启流式输出
- 每个 Agent 的输出有名称前缀区分，例如 `[researcher] 正在搜索...`
- 支持 `--no-stream` 关闭（兼容管道场景）

---

#### 4.2.2 多轮对话 `oma chat`

**目标**：保持上下文的交互式对话模式，类似终端版的 Claude。

**行为**：
- 启动后进入对话循环，用户逐条输入，Agent 逐条回应
- 保留完整对话历史，Agent 能引用之前的内容
- 支持特殊指令：`/clear`（清空历史）、`/exit`（退出）、`/tools`（查看可用工具）
- 可指定 Agent 角色：`oma chat --system "你是一个代码审查专家"`
- 支持图片输入：`oma chat --image screenshot.png`（需使用视觉模型）

**图片输入两种模式**：
- **直接模式**：使用支持视觉的模型（Claude、GPT-4o、Gemini），图片和文字直接发给同一个模型处理，适合大多数场景
- **专职模式**：团队中配置专门的 vision-agent 处理图片并输出文字描述写入 SharedMemory，其他 Agent 使用纯文本模型读取描述继续工作，成本更低

默认使用直接模式；专职模式通过 agent 配置实现，不需要框架特殊支持。

**验收标准**：
- 多轮对话中 Agent 能正确引用前面的内容
- `/clear` 后 Agent 不记得之前的对话
- `Ctrl+C` 优雅退出，不报错
- 传入图片时若模型不支持视觉，给出明确错误提示

---

#### 4.2.3 执行前显示计划并确认

**目标**：`oma run` 执行前，让用户看到 coordinator 分解出的任务列表，确认后再执行。

**行为**：
```
Goal: 开发一个命令行 todo 工具

Proposed plan:
  1. [architect]  设计数据结构和文件格式
  2. [developer]  实现核心功能（依赖任务 1）
  3. [tester]     编写测试（依赖任务 2）

Proceed? [Y/n/e(dit)]
```

- `Y`：按计划执行
- `n`：取消
- `e`：进入编辑模式，可修改任务描述或调整分配

**验收标准**：
- 计划展示包含任务标题、分配的 Agent、依赖关系
- `n` 取消后不消耗任何 token（coordinator 分解已消耗的除外）
- `--yes` 参数跳过确认，适合脚本自动化

---

#### 4.2.4 文件和管道输入

**目标**：支持从文件或标准输入读取任务描述，融入工作流。

**用法**：
```bash
# 从文件读取目标
oma run --file task.md

# 管道输入
cat requirements.txt | oma run
echo "帮我 review 这段代码" | oma agent --file src/index.ts

# 附加上下文文件
oma agent "帮我优化这个函数" --context src/utils.ts
oma run "根据这份需求开发功能" --file prd.md --context src/
```

**验收标准**：
- `--file` 内容拼接到 prompt 开头
- `--context` 支持单文件和目录（目录下所有文件内容附加）
- 管道输入与 `--file` 互斥，同时使用报错提示

---

#### 4.2.5 结果保存

**目标**：将 Agent 最终输出保存到文件。

**用法**：
```bash
oma run "写一份技术方案" --output result.md
oma agent "生成测试数据" --output /tmp/data.json
```

**验收标准**：
- 文件不存在时自动创建
- 文件已存在时提示覆盖确认（`--force` 跳过）
- 同时输出到终端和文件

---

#### 4.2.6 多 Profile 配置

**目标**：支持保存和切换多套配置（不同 provider、不同 agent 组合）。

**用法**：
```bash
oma init --profile work          # 创建名为 work 的 profile
oma config use work              # 切换到 work profile
oma run "..." --profile personal # 临时使用某个 profile
oma config list                  # 列出所有 profile
```

**存储**：`~/.oma/profiles/<name>.json`，当前激活的 profile 记录在 `~/.oma/config.json` 的 `activeProfile` 字段。

**验收标准**：
- profile 之间完全独立（provider、model、agents、apiKey 各自隔离）
- 切换 profile 后 `oma config show` 显示新 profile 的内容

---

#### 4.2.7 执行历史 `oma history`

**目标**：本地保存每次执行记录，支持回顾、复用、重跑。

**存储**：每次执行结束后写入 `~/.oma/history/<timestamp>.json`，包含目标描述、模式（agent/run/chat）、使用的 agents、最终输出、token 消耗、执行时长。

**用法**：
```bash
# 列出历史记录（最近 20 条）
oma history
  #5  2026-04-24 14:32  run   "开发一个命令行 todo 工具"    3 agents  2.1k tokens
  #4  2026-04-24 11:15  agent "帮我 review src/index.ts"   1 agent   800 tokens
  #3  2026-04-23 09:40  run   "写一份 TypeScript 技术方案"  2 agents  3.4k tokens

# 查看某条记录的完整输出
oma history show 5

# 用相同目标和配置重新执行
oma history rerun 5

# 清空历史
oma history clear
```

**验收标准**：
- 每次 `oma agent` / `oma run` / `oma chat` 结束后自动写入历史
- `oma history` 默认显示最近 20 条，`--limit` 参数可调整
- `show` 显示完整输出内容及执行摘要（agents、tokens、耗时）
- `rerun` 复用原始目标和配置，不复用结果
- 历史文件纯 JSON，便于外部工具读取

---

### 4.3 Ink TUI（终端可视化界面）

命令入口：`oma tui`，或 `oma run --tui`。

在 macOS Terminal / iTerm2 中运行，基于 [Ink](https://github.com/vadimdemedes/ink)（React for terminal）实现。

#### 4.3.1 布局

```
┌─────────────────────────────────────────────────────────┐
│  oma  |  goal: 开发一个命令行 todo 工具          tokens: 1.2k │
├──────────────┬──────────────────────────────────────────┤
│  Agents      │  researcher                    ● running  │
│              │                                           │
│  coordinator │  > 调用工具: bash                          │
│  ● done      │    $ find . -name "*.ts" | head -20       │
│              │    [展开查看输出]                           │
│  researcher  │                                           │
│  ● running   │  > 正在分析项目结构...                      │
│              │    TypeScript 项目，入口文件是 src/index.ts  │
│  developer   │                                           │
│  ○ waiting   │  > 调用工具: file_read                     │
│              │    path: src/index.ts                     │
│  tester      │    [展开查看内容]                           │
│  ○ waiting   │                                           │
├──────────────┴──────────────────────────────────────────┤
│  Tasks: 1/4 completed  ██░░░░░░░░  25%     [q]uit       │
└─────────────────────────────────────────────────────────┘
```

#### 4.3.2 Agent 树面板（左）

- 列出 coordinator 和所有 sub-agents
- 每个 Agent 显示实时状态：`○ waiting` / `● running` / `✓ done` / `✗ failed`
- 上下方向键切换选中的 Agent
- 回车进入该 Agent 的详情视图

#### 4.3.3 流式输出面板（右）

- 显示当前选中 Agent 的实时输出
- 工具调用显示为可折叠行：
  ```
  > 调用工具: bash
    $ npm test
    [▶ 展开输出 (42 行)]
  ```
- 工具执行中显示 spinner，完成后显示结果摘要
- 支持滚动查看历史

#### 4.3.4 计划确认界面

执行前弹出任务计划，键盘操作：
- `↑↓` 移动光标
- `Space` 编辑选中任务的描述
- `Enter` / `y` 确认执行
- `q` / `n` 取消

#### 4.3.5 任务进度条（底部）

- 显示已完成 / 总任务数
- 进度条
- 已消耗 token 数
- 快捷键提示

#### 4.3.6 键盘快捷键

| 按键 | 功能 |
|------|------|
| `↑` / `↓` | 切换 Agent |
| `Enter` | 展开/折叠工具调用详情 |
| `Tab` | 切换左右面板焦点 |
| `s` | 展开/折叠 SharedMemory 查看器 |
| `p` | 查看完整任务计划 |
| `q` | 退出（运行中需二次确认） |

#### 4.3.7 鼠标支持

支持鼠标点击切换 Agent、点击展开/折叠工具调用卡片、滚动查看历史输出。

**优先级**：低，列入 Phase 5。键盘导航优先实现，鼠标支持作为体验增强。

---

### 4.4 Agent 间通信可视化

#### 4.4.1 Coordinator 下发指令

在 Agent 树中，coordinator 节点下展示它给每个 sub-agent 分配的任务描述，让用户看到"coordinator 说了什么"。

#### 4.4.2 SharedMemory 查看器

按 `s` 打开浮层，显示当前 SharedMemory 的内容：

```
SharedMemory
─────────────────────────────────
researcher/task:abc:result
  "TypeScript 项目，入口是 src/index.ts，
   使用 Vitest 做测试..."

developer/task:def:result
  (empty — task not completed yet)
```

#### 4.4.3 完整对话历史

在 Agent 详情视图中，可以切换到"对话历史"模式，查看该 Agent 与 LLM 的完整多轮对话（每一条 user / assistant 消息）。

#### 4.4.4 MessageBus 消息流

MessageBus 是框架预留的 Agent 间点对点通信能力。当前 `runTeam` 模式下 Agent 主要通过 SharedMemory 传递结果，MessageBus 使用较少。

**结论**：暂不做可视化，作为框架预留能力，待实际使用场景出现后再规划。

---

## 5. 非功能需求

| 项目 | 要求 |
|------|------|
| 启动速度 | `oma --help` 在 200ms 内响应 |
| 兼容性 | macOS 12+，Node.js 18+ |
| 终端兼容 | Terminal.app、iTerm2、VS Code Terminal |
| API Key 安全 | 配置文件权限 600，不写入日志或输出 |
| 错误提示 | 所有错误附带可操作的 Hint |
| 中断处理 | `Ctrl+C` 优雅退出，不留孤儿进程 |

---

## 6. 交付阶段

### Phase 1 — CLI 流式输出 + oma chat
- 流式输出接入 `onTrace`
- `oma chat` 多轮对话
- **验收**：能和 Agent 多轮对话，实时看到输出

### Phase 2 — 计划确认 + 文件输入 + 结果保存 + 历史记录
- `oma run` 执行前显示计划并确认
- `--file`、`--context`、`--output` 参数
- `oma history` 历史记录查看和重跑
- **验收**：从 markdown 文件读取需求，执行前确认，结果保存到文件，历史记录可查

### Phase 3 — Ink TUI 基础框架
- Agent 树 + 流式输出面板
- 工具调用折叠卡片
- 进度条
- **验收**：`oma run --tui` 能看到完整的双面板可视化

### Phase 4 — Agent 间通信可视化
- Coordinator 指令展示
- SharedMemory 查看器
- 完整对话历史视图
- **验收**：能逐层追踪每个 Agent 的完整执行过程

### Phase 5 — 多 Profile + 体验打磨
- 多 Profile 配置管理
- 键盘导航完善
- 错误处理和边界情况
- **验收**：完整的端到端用户旅程无明显卡顿或异常

---

## 7. 决策记录

| 问题 | 决策 |
|------|------|
| TUI 鼠标支持 | 要做，Phase 5，键盘优先 |
| `oma chat` 图片输入 | 支持，默认直接模式（视觉模型），专职模式通过 agent 配置实现 |
| MessageBus 可视化 | 暂不做，作为框架预留能力 |
| `oma history` | 要做，列入 Phase 2 |
| Web UI | 不做 |
