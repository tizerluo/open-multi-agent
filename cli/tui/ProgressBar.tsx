import React from 'react'
import { Box, Text } from 'ink'

interface ProgressBarProps {
  done: number
  total: number
  tokenIn: number
  tokenOut: number
}

export function ProgressBar({ done, total, tokenIn, tokenOut }: ProgressBarProps): React.ReactElement {
  const ratio = total > 0 ? done / total : 0
  const filled = Math.floor(ratio * 10)
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
  const pct = Math.floor(ratio * 100)

  return (
    <Box borderStyle="single" paddingX={1}>
      <Text>
        {`Tasks: ${done}/${total}  `}
        <Text color="cyan">{bar}</Text>
        {`  ${pct}%   in: ${fmt(tokenIn)}  out: ${fmt(tokenOut)}  `}
        <Text bold>{'[q]uit'}</Text>
      </Text>
    </Box>
  )
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
