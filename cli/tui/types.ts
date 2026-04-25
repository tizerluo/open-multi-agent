import type { StreamEvent, TokenUsage } from '../../src/types.js'
import type { OrchestratorEvent } from '../../src/types.js'

export type AgentStatus = 'waiting' | 'running' | 'done' | 'failed'

export interface ToolCallSummary {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
  expanded: boolean
}

export interface AgentState {
  name: string
  status: AgentStatus
  streamText: string
  toolCalls: ToolCallSummary[]
  tokenUsage: TokenUsage
}

export interface TuiState {
  goal: string
  agents: AgentState[]
  selectedIndex: number
  tasksTotal: number
  tasksDone: number
  totalIn: number
  totalOut: number
  done: boolean
  error?: string
}

export type TuiAction =
  | { type: 'AGENT_STREAM'; agentName: string; event: StreamEvent }
  | { type: 'PROGRESS'; event: OrchestratorEvent }
  | { type: 'PLAN_READY'; agentNames: string[] }
  | { type: 'DONE' }
  | { type: 'ERROR'; message: string }
  | { type: 'SELECT_PREV' }
  | { type: 'SELECT_NEXT' }
  | { type: 'TOGGLE_TOOL'; agentName: string; toolId: string }
