import { Command } from 'commander'
import { loadConfig, assertApiKey } from '../lib/config-loader.js'
import { exitWithError } from '../lib/error-handler.js'
import { resolvePrompt } from '../lib/prompt-resolver.js'
import type { AgentConfig } from '../../src/types.js'

interface TuiOpts {
  config?: string
  file?: string
  context?: string
}

export function registerTuiCommand(program: Command): void {
  program
    .command('tui [goal]')
    .description('Launch interactive TUI for a multi-agent run')
    .option('--config <path>', 'Config file path')
    .option('--file <path>', 'Read goal from file')
    .option('--context <path>', 'Append file or directory contents as context')
    .action(async (goal: string | undefined, opts: TuiOpts) => {
      const resolvedGoal = await resolvePrompt({ positional: goal, file: opts.file, context: opts.context })
      const config = loadConfig(opts.config)
      const apiKey = assertApiKey(config)

      const agentConfigs: AgentConfig[] = config.team.agents.length > 0
        ? config.team.agents.map(a => ({
            name: a.name,
            model: config.model,
            provider: config.provider,
            apiKey,
            baseURL: config.baseURL,
            systemPrompt: a.systemPrompt,
            tools: a.tools ?? ['bash', 'file_read', 'file_write'],
            maxTurns: a.maxTurns ?? 10,
          }))
        : [
            {
              name: 'assistant',
              model: config.model,
              provider: config.provider,
              apiKey,
              baseURL: config.baseURL,
              systemPrompt: 'You are a helpful, capable assistant. Complete tasks thoroughly.',
              tools: ['bash', 'file_read', 'file_write'],
              maxTurns: 10,
            },
          ]

      try {
        type LaunchTuiFn = (opts: {
          goal: string; agentConfigs: AgentConfig[]; provider: string
          model: string; apiKey: string; baseURL?: string; startTime: number
        }) => Promise<void>
        // @ts-ignore launcher.tsx compiled separately by TUI tsconfig (jsx: react-jsx)
        const { launchTui } = await import('../tui/launcher.js') as { launchTui: LaunchTuiFn }
        await launchTui({
          goal: resolvedGoal,
          agentConfigs,
          provider: config.provider,
          model: config.model,
          apiKey,
          baseURL: config.baseURL,
          startTime: Date.now(),
        })
      } catch (err) {
        exitWithError(err instanceof Error ? err.message : String(err))
      }
    })
}
