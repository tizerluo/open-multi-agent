import React from 'react'
import { Box, Text } from 'ink'
import type { AgentState, AgentStatus } from './types.js'

interface AgentTreeProps {
  agents: AgentState[]
  selectedIndex: number
}

function statusIcon(status: AgentStatus): { icon: string; color: string } {
  switch (status) {
    case 'waiting': return { icon: '○', color: 'gray' }
    case 'running': return { icon: '●', color: 'blue' }
    case 'done':    return { icon: '✓', color: 'green' }
    case 'failed':  return { icon: '✗', color: 'red' }
  }
}

export function AgentTree({ agents, selectedIndex }: AgentTreeProps): React.ReactElement {
  return (
    <Box width={22} flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>Agents</Text>
      <Text dimColor>{'─'.repeat(18)}</Text>
      {agents.map((agent, i) => {
        const selected = i === selectedIndex
        const { icon, color } = statusIcon(agent.status)
        return (
          <Box key={agent.name} flexDirection="column">
            <Text bold={selected} color={selected ? 'cyan' : undefined}>
              {selected ? '▶ ' : '  '}{agent.name}
            </Text>
            <Text color={color as any}>{`  ${icon} ${agent.status}`}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
