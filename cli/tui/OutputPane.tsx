import React from 'react'
import { Box, Text } from 'ink'
import type { AgentState, ToolCallSummary } from './types.js'

interface OutputPaneProps {
  agent: AgentState | undefined
}

export function OutputPane({ agent }: OutputPaneProps): React.ReactElement {
  if (!agent) {
    return (
      <Box flexGrow={1} borderStyle="single">
        <Text dimColor>No agent selected</Text>
      </Box>
    )
  }

  const lines = agent.streamText.split('\n')
  const visibleText = lines.slice(Math.max(0, lines.length - 20)).join('\n')

  return (
    <Box flexGrow={1} flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>{agent.name}</Text>
      <Text dimColor>{'─'.repeat(40)}</Text>
      {agent.toolCalls.map(tool => {
        const preview = JSON.stringify(tool.input).slice(0, 60)
        return (
          <Box key={tool.id} flexDirection="column">
            <Text dimColor>{`  > [tool: ${tool.name}]  ${preview}`}</Text>
            {tool.output !== undefined && !tool.expanded && (
              <Text dimColor>{`    [▶ expand (${tool.output.split('\n').length} lines)]`}</Text>
            )}
            {tool.expanded && tool.output && (
              <Text>{tool.output.slice(0, 500)}</Text>
            )}
          </Box>
        )
      })}
      {visibleText.length > 0 && (
        <Text wrap="wrap">{visibleText}</Text>
      )}
    </Box>
  )
}
