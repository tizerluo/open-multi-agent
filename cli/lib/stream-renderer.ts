import chalk from 'chalk'
import type { StreamEvent, ToolUseBlock, ToolResultBlock } from '../../src/types.js'

export function renderStreamEvent(event: StreamEvent): void {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.data as string)
      break

    case 'tool_use': {
      const block = event.data as ToolUseBlock
      const preview = JSON.stringify(block.input)
      const truncated = preview.length > 80 ? preview.slice(0, 80) + '…' : preview
      process.stdout.write(chalk.dim(`\n[tool: ${block.name}] ${truncated}\n`))
      break
    }

    case 'tool_result': {
      const block = event.data as ToolResultBlock
      const lines = block.content.split('\n').length
      const label = block.is_error ? chalk.red('  → error') : chalk.dim(`  → done (${lines} line${lines === 1 ? '' : 's'})`)
      process.stdout.write(label + '\n')
      break
    }

    // 'done', 'error', 'loop_detected' are handled by the caller
    default:
      break
  }
}
