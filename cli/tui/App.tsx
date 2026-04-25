import React, { useReducer, useEffect } from 'react'
import { Box, useInput, useApp } from 'ink'
import { AgentTree } from './AgentTree.js'
import { OutputPane } from './OutputPane.js'
import { ProgressBar } from './ProgressBar.js'
import { setDispatcher } from './bridge.js'
import { tuiReducer, initialState } from './reducer.js'

interface AppProps {
  goal: string
  agentNames: string[]
}

export function App({ goal, agentNames }: AppProps): React.ReactElement {
  const [state, dispatch] = useReducer(tuiReducer, initialState(goal, agentNames))
  const { exit } = useApp()

  useEffect(() => {
    setDispatcher(dispatch)
    return () => setDispatcher(null)
  }, [])

  // Auto-exit when done
  useEffect(() => {
    if (state.done) {
      setTimeout(() => exit(), 500) // short delay to show final state
    }
  }, [state.done, exit])

  useInput((input, key) => {
    if (input === 'q') exit()
    if (key.upArrow) dispatch({ type: 'SELECT_PREV' })
    if (key.downArrow) dispatch({ type: 'SELECT_NEXT' })
    // Enter: toggle first non-expanded tool call of selected agent
    if (key.return) {
      const agent = state.agents[state.selectedIndex]
      if (agent) {
        const tool = agent.toolCalls.find(t => t.output !== undefined)
        if (tool) dispatch({ type: 'TOGGLE_TOOL', agentName: agent.name, toolId: tool.id })
      }
    }
  })

  return (
    <Box flexDirection="column" height={process.stdout.rows ?? 24}>
      <Box flexDirection="row" flexGrow={1}>
        <AgentTree agents={state.agents} selectedIndex={state.selectedIndex} />
        <OutputPane agent={state.agents[state.selectedIndex]} />
      </Box>
      <ProgressBar
        done={state.tasksDone}
        total={state.tasksTotal}
        tokenIn={state.totalIn}
        tokenOut={state.totalOut}
      />
    </Box>
  )
}
