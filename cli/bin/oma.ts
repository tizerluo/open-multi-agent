#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { registerInitCommand } from '../commands/init.js'
import { registerRunCommand } from '../commands/run.js'
import { registerAgentCommand } from '../commands/agent.js'
import { registerConfigCommand } from '../commands/config.js'
import { registerChatCommand } from '../commands/chat.js'

const program = new Command()
  .name('oma')
  .description('Open Multi-Agent CLI — run AI agent teams from the terminal')
  .version('1.0.0')

registerInitCommand(program)
registerRunCommand(program)
registerAgentCommand(program)
registerConfigCommand(program)
registerChatCommand(program)

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red('Fatal error:'), err instanceof Error ? err.message : String(err))
  process.exit(1)
})
