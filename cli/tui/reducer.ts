import type { TuiState, TuiAction, AgentState, ToolCallSummary } from './types.js'
import type { ToolUseBlock, ToolResultBlock, TokenUsage } from '../../src/types.js'

function makeAgent(name: string): AgentState {
  return {
    name,
    status: 'waiting',
    streamText: '',
    toolCalls: [],
    tokenUsage: { input_tokens: 0, output_tokens: 0 },
  }
}

export function initialState(goal: string, agentNames: string[]): TuiState {
  return {
    goal,
    agents: agentNames.map(makeAgent),
    selectedIndex: 0,
    tasksTotal: agentNames.length,
    tasksDone: 0,
    totalIn: 0,
    totalOut: 0,
    done: false,
  }
}

function updateAgent(
  agents: AgentState[],
  name: string,
  updater: (agent: AgentState) => AgentState,
): AgentState[] {
  return agents.map(a => (a.name === name ? updater(a) : a))
}

export function tuiReducer(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case 'PLAN_READY': {
      return {
        ...state,
        agents: action.agentNames.map(makeAgent),
        selectedIndex: 0,
        tasksTotal: action.agentNames.length,
      }
    }

    case 'PROGRESS': {
      const event = action.event
      switch (event.type) {
        case 'agent_start': {
          if (!event.agent) return state
          return {
            ...state,
            agents: updateAgent(state.agents, event.agent, a => ({
              ...a,
              status: 'running',
            })),
          }
        }
        case 'agent_complete': {
          if (!event.agent) return state
          const result = event.data as { success: boolean; tokenUsage?: TokenUsage } | undefined
          const success = result?.success ?? true
          const usage = result?.tokenUsage
          return {
            ...state,
            agents: updateAgent(state.agents, event.agent, a => ({
              ...a,
              status: success ? 'done' : 'failed',
              tokenUsage: usage
                ? {
                    input_tokens: a.tokenUsage.input_tokens + usage.input_tokens,
                    output_tokens: a.tokenUsage.output_tokens + usage.output_tokens,
                  }
                : a.tokenUsage,
            })),
            tasksDone: state.tasksDone + 1,
            totalIn: state.totalIn + (usage?.input_tokens ?? 0),
            totalOut: state.totalOut + (usage?.output_tokens ?? 0),
          }
        }
        default:
          return state
      }
    }

    case 'AGENT_STREAM': {
      const { agentName, event } = action
      switch (event.type) {
        case 'text': {
          return {
            ...state,
            agents: updateAgent(state.agents, agentName, a => ({
              ...a,
              streamText: a.streamText + (event.data as string),
            })),
          }
        }
        case 'tool_use': {
          const block = event.data as ToolUseBlock
          const summary: ToolCallSummary = {
            id: block.id,
            name: block.name,
            input: block.input,
            expanded: false,
          }
          return {
            ...state,
            agents: updateAgent(state.agents, agentName, a => ({
              ...a,
              toolCalls: [...a.toolCalls, summary],
            })),
          }
        }
        case 'tool_result': {
          const block = event.data as ToolResultBlock
          return {
            ...state,
            agents: updateAgent(state.agents, agentName, a => ({
              ...a,
              toolCalls: a.toolCalls.map(t =>
                t.id === block.tool_use_id ? { ...t, output: block.content } : t,
              ),
            })),
          }
        }
        case 'done': {
          return {
            ...state,
            agents: updateAgent(state.agents, agentName, a => ({
              ...a,
              status: 'done',
            })),
          }
        }
        case 'error': {
          return {
            ...state,
            agents: updateAgent(state.agents, agentName, a => ({
              ...a,
              status: 'failed',
            })),
          }
        }
        default:
          return state
      }
    }

    case 'SELECT_PREV': {
      const len = state.agents.length
      if (len === 0) return state
      return {
        ...state,
        selectedIndex: (state.selectedIndex - 1 + len) % len,
      }
    }

    case 'SELECT_NEXT': {
      const len = state.agents.length
      if (len === 0) return state
      return {
        ...state,
        selectedIndex: (state.selectedIndex + 1) % len,
      }
    }

    case 'TOGGLE_TOOL': {
      const { agentName, toolId } = action
      return {
        ...state,
        agents: updateAgent(state.agents, agentName, a => ({
          ...a,
          toolCalls: a.toolCalls.map(t =>
            t.id === toolId ? { ...t, expanded: !t.expanded } : t,
          ),
        })),
      }
    }

    case 'DONE': {
      return { ...state, done: true }
    }

    case 'ERROR': {
      return { ...state, error: action.message, done: true }
    }

    default:
      return state
  }
}
