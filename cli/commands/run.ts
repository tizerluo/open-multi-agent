import { Command } from 'commander'
import chalk from 'chalk'
import { loadConfig, assertApiKey } from '../lib/config-loader.js'
import { createProgressRenderer } from '../lib/progress-renderer.js'
import { exitWithError } from '../lib/error-handler.js'
import { OpenMultiAgent } from '../../src/index.js'
import type { AgentConfig } from '../../src/types.js'

interface RunOpts {
  config?: string
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <goal>')
    .description('Run a multi-agent team to achieve the goal (auto task decomposition)')
    .option('--config <path>', 'Config file path')
    .action(async (goal: string, opts: RunOpts) => {
      const config = loadConfig(opts.config)
      const apiKey = assertApiKey(config)

      // Build agent list from config; fall back to a single general-purpose agent
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

      const renderer = createProgressRenderer()

      const orchestrator = new OpenMultiAgent({
        defaultModel: config.model,
        defaultProvider: config.provider,
        defaultApiKey: apiKey,
        defaultBaseURL: config.baseURL,
        onProgress: renderer.onProgress,
      })

      const team = orchestrator.createTeam('oma-team', {
        name: 'oma-team',
        agents: agentConfigs,
        sharedMemory: config.team.sharedMemory ?? true,
        maxConcurrency: config.team.maxConcurrency,
      })

      console.log(chalk.bold(`\nGoal: ${chalk.cyan(goal)}\n`))

      try {
        const result = await orchestrator.runTeam(team, goal)
        renderer.finish()

        // Find the final synthesized output: coordinator agent, or last successful agent
        let finalOutput = ''
        const coordinatorResult = result.agentResults.get('coordinator')
        if (coordinatorResult?.output) {
          finalOutput = coordinatorResult.output
        } else {
          // Fall back: collect all agent outputs
          const outputs: string[] = []
          for (const [name, r] of result.agentResults) {
            if (r.output && name !== 'coordinator') {
              outputs.push(`### ${name}\n${r.output}`)
            }
          }
          finalOutput = outputs.join('\n\n') || chalk.dim('(no output)')
        }

        console.log('\n' + chalk.bold('─'.repeat(60)))
        console.log(chalk.bold.green('Result:\n'))
        console.log(finalOutput)
        console.log(chalk.dim(
          `\nTokens: ${result.totalTokenUsage.input_tokens} in / ${result.totalTokenUsage.output_tokens} out`,
        ))

        if (!result.success) process.exit(1)
      } catch (err) {
        renderer.finish()
        exitWithError(err instanceof Error ? err.message : String(err))
      }
    })
}
