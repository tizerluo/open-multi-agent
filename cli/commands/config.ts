import { Command } from 'commander'
import chalk from 'chalk'
import { loadConfig, getEffectiveApiKey, globalConfigPath } from '../lib/config-loader.js'
import { exitWithError } from '../lib/error-handler.js'
import path from 'node:path'

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage oma configuration')

  configCmd
    .command('show')
    .description('Show the current effective configuration')
    .option('--config <path>', 'Config file path')
    .action((opts: { config?: string }) => {
      let config
      try {
        config = loadConfig(opts.config)
      } catch {
        exitWithError(
          'No configuration found.',
          'Run `oma init` to create one.',
        )
      }

      const apiKey = getEffectiveApiKey(config)
      const keyStatus = apiKey
        ? chalk.green('set (' + apiKey.slice(0, 8) + '...)')
        : chalk.red('not set')

      console.log(chalk.bold('\nEffective configuration:\n'))
      console.log(`  Provider     : ${chalk.cyan(config.provider)}`)
      console.log(`  Model        : ${chalk.cyan(config.model)}`)
      if (config.baseURL) {
        console.log(`  Base URL     : ${chalk.cyan(config.baseURL)}`)
      }
      console.log(`  API Key      : ${keyStatus}`)
      console.log(`  Config file  : ${chalk.dim(globalConfigPath())}`)

      if (config.team.agents.length === 0) {
        console.log(`  Agents       : ${chalk.dim('(none — default single agent will be used)')}`)
      } else {
        console.log(`  Agents       : ${config.team.agents.map(a => chalk.cyan(a.name)).join(', ')}`)
        for (const a of config.team.agents) {
          console.log(chalk.dim(`    • ${a.name}: ${(a.systemPrompt ?? '').slice(0, 60)}`))
          if (a.tools?.length) {
            console.log(chalk.dim(`      tools: ${a.tools.join(', ')}`))
          }
        }
      }
      console.log(`  Shared Memory: ${config.team.sharedMemory ? chalk.green('yes') : chalk.dim('no')}`)
      console.log()
    })
}
