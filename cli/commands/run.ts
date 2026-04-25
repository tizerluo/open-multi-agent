import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'node:readline'
import { loadConfig, assertApiKey } from '../lib/config-loader.js'
import { createProgressRenderer } from '../lib/progress-renderer.js'
import { exitWithError } from '../lib/error-handler.js'
import { saveOutput } from '../lib/output-saver.js'
import { resolvePrompt } from '../lib/prompt-resolver.js'
import { writeHistory } from '../lib/history.js'
import { OpenMultiAgent } from '../../src/index.js'
import type { AgentConfig, Task } from '../../src/types.js'

interface RunOpts {
  config?: string
  yes?: boolean
  tui?: boolean
  output?: string
  force?: boolean
  file?: string
  context?: string
}

function displayPlan(goal: string, tasks: Task[]): void {
  console.log(`Goal: ${goal}`)
  console.log('')
  console.log('Proposed plan:')
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const assignee = task.assignee ?? '?'
    const depNums = (task.dependsOn ?? []).map(depId => tasks.findIndex(t => t.id === depId) + 1)
    const depPart = depNums.length > 0 ? `  (depends on: ${depNums.join(', ')})` : ''
    console.log(`  ${i + 1}. [${assignee}]  ${task.title}${depPart}`)
  }
}

async function confirmPlan(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const ask = (): void => {
      rl.question('Proceed? [Y/n] ', (answer) => {
        const trimmed = answer.trim().toLowerCase()
        if (trimmed === '' || trimmed === 'y') {
          rl.close()
          resolve(true)
        } else if (trimmed === 'n') {
          rl.close()
          resolve(false)
        } else if (trimmed === 'e') {
          console.log('Edit mode not yet available, use Y or n')
          ask()
        } else {
          ask()
        }
      })
    }
    ask()
  })
}

export function registerRunCommand(program: Command): void {
  program
    .command('run [goal]')
    .description('Run a multi-agent team to achieve the goal (auto task decomposition)')
    .option('--config <path>', 'Config file path')
    .option('-y, --yes', 'skip confirmation, proceed directly')
    .option('--tui', 'Launch interactive TUI while running')
    .option('--output <path>', 'Save output to file')
    .option('--force', 'Overwrite output file without prompting')
    .option('--file <path>', 'Read goal from file')
    .option('--context <path>', 'Append file or directory contents as context')
    .action(async (goal: string | undefined, opts: RunOpts) => {
      const resolvedGoal = await resolvePrompt({ positional: goal, file: opts.file, context: opts.context })
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

      // TUI branch — dynamically loaded to keep JSX out of CLI compilation
      if (opts.tui) {
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
        return
      }

      const renderer = createProgressRenderer()

      const shouldConfirm = !opts.yes && !!process.stdin.isTTY

      let planApproved = true

      const orchestrator = new OpenMultiAgent({
        defaultModel: config.model,
        defaultProvider: config.provider,
        defaultApiKey: apiKey,
        defaultBaseURL: config.baseURL,
        onProgress: renderer.onProgress,
        onPlanReady: shouldConfirm
          ? async (tasks) => {
              displayPlan(resolvedGoal, tasks)
              const approved = await confirmPlan()
              if (!approved) {
                planApproved = false
                console.log('Cancelled.')
              }
              return approved
            }
          : undefined,
      })

      const team = orchestrator.createTeam('oma-team', {
        name: 'oma-team',
        agents: agentConfigs,
        sharedMemory: config.team.sharedMemory ?? true,
        maxConcurrency: config.team.maxConcurrency,
      })

      console.log(chalk.bold(`\nGoal: ${chalk.cyan(resolvedGoal)}\n`))

      const startTime = Date.now()

      try {
        const result = await orchestrator.runTeam(team, resolvedGoal)
        renderer.finish()

        if (!planApproved) {
          process.exit(0)
        }

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

        if (opts.output) {
          await saveOutput(opts.output, finalOutput, opts.force ?? false)
        }

        const durationMs = Date.now() - startTime
        await writeHistory({
          mode: 'run',
          goal: resolvedGoal,
          provider: config.provider,
          model: config.model,
          agents: agentConfigs.map(a => a.name),
          output: finalOutput,
          tokenUsage: result.totalTokenUsage,
          durationMs,
          success: result.success,
        }).catch(() => {})

        if (!result.success) process.exit(1)
      } catch (err) {
        renderer.finish()
        exitWithError(err instanceof Error ? err.message : String(err))
      }
    })
}
