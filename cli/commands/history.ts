import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'node:readline'
import { execFileSync } from 'node:child_process'
import { readHistory, readHistoryEntry, clearHistory } from '../lib/history.js'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTimestampFull(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatTokens(total: number): string {
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total)
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

export function registerHistoryCommand(program: Command): void {
  const history = new Command('history')
    .description('Show execution history')
    .option('-l, --limit <n>', 'Number of entries to show', '20')
    .action(async (opts: { limit: string }) => {
      const limit = parseInt(opts.limit, 10)
      const entries = await readHistory(isNaN(limit) ? 20 : limit)

      if (entries.length === 0) {
        console.log("No history yet. Run 'oma agent' or 'oma run' to get started.")
        return
      }

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const num = ` #${i + 1}`.padStart(3)
        const ts = formatTimestamp(entry.timestamp)
        const mode = entry.mode.padStart(5)
        const goal = `"${truncate(entry.goal, 40)}"`
        const agentCount = entry.agents.length === 1 ? '1 agent' : `${entry.agents.length} agents`
        const totalTokens = entry.tokenUsage.input_tokens + entry.tokenUsage.output_tokens
        const tokens = `${formatTokens(totalTokens)} tokens`
        console.log(`${num}  ${ts}  ${mode}  ${goal}  ${agentCount}  ${tokens}`)
      }
    })

  history.addCommand(
    new Command('show')
      .argument('<index>', 'History entry number')
      .description('Show full details of a history entry')
      .action(async (indexStr: string) => {
        const index = parseInt(indexStr, 10)
        const entry = await readHistoryEntry(index)

        if (!entry) {
          console.log(`No entry at #${index}.`)
          process.exit(1)
        }

        const ts = formatTimestampFull(entry.timestamp)
        console.log(`#${index} — ${entry.mode} — ${ts}`)
        console.log()
        console.log(`Goal:    ${entry.goal}`)
        console.log(`Model:   ${entry.model} (${entry.provider})`)
        console.log(`Agents:  ${entry.agents.join(', ')}`)
        console.log(`Tokens:  ${entry.tokenUsage.input_tokens} in / ${entry.tokenUsage.output_tokens} out`)
        console.log(`Time:    ${(entry.durationMs / 1000).toFixed(1)}s`)
        console.log(`Status:  ${entry.success ? chalk.green('✓ success') : chalk.red('✗ failed')}`)
        console.log()
        console.log('─'.repeat(60))
        console.log(entry.output)
        console.log('─'.repeat(60))
      }),
  )

  history.addCommand(
    new Command('rerun')
      .argument('<index>', 'History entry number')
      .description('Re-execute a history entry')
      .action(async (indexStr: string) => {
        const index = parseInt(indexStr, 10)
        const entry = await readHistoryEntry(index)

        if (!entry) {
          console.log(`No entry at #${index}.`)
          process.exit(1)
        }

        console.log(`Rerunning: ${entry.goal}`)

        const args = entry.mode === 'run'
          ? ['run', entry.goal, '--yes', '--provider', entry.provider, '--model', entry.model]
          : ['agent', entry.goal, '--provider', entry.provider, '--model', entry.model]

        execFileSync(process.argv[0], [process.argv[1], ...args], { stdio: 'inherit' })
      }),
  )

  history.addCommand(
    new Command('clear')
      .description('Clear all history')
      .action(async () => {
        const confirmed = await confirm('Clear all history? [y/N] ')
        if (!confirmed) {
          console.log('Aborted.')
          return
        }
        await clearHistory()
        console.log(chalk.dim('History cleared.'))
      }),
  )

  program.addCommand(history)
}
