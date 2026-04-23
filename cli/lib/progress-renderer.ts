import chalk from 'chalk'
import ora, { type Ora } from 'ora'
import type { OrchestratorEvent } from '../../src/types.js'

export interface ProgressRenderer {
  onProgress: (event: OrchestratorEvent) => void
  finish: () => void
}

export function createProgressRenderer(): ProgressRenderer {
  // One spinner per agent name, so parallel agents each have their own line
  const spinners = new Map<string, Ora>()
  // Cache task id → title so task_complete can show the title
  const taskTitles = new Map<string, string>()

  function onProgress(event: OrchestratorEvent): void {
    switch (event.type) {
      case 'agent_start': {
        const name = event.agent ?? 'agent'
        const s = ora({ text: chalk.blue(`${name} working...`), spinner: 'dots' }).start()
        spinners.set(name, s)
        break
      }
      case 'agent_complete': {
        const name = event.agent ?? 'agent'
        const s = spinners.get(name)
        s?.succeed(chalk.green(`${name} done`))
        spinners.delete(name)
        break
      }
      case 'task_start': {
        const taskData = event.data as { title?: string; id?: string } | undefined
        const title = taskData?.title ?? event.task ?? 'task'
        if (event.task) taskTitles.set(event.task, title)
        console.log(chalk.cyan(`  → ${title.slice(0, 72)}`))
        break
      }
      case 'task_complete': {
        const title = (event.task ? taskTitles.get(event.task) : undefined) ?? event.task ?? 'task'
        console.log(chalk.green(`  ✓ ${title.slice(0, 72)}`))
        break
      }
      case 'task_skipped': {
        const title = (event.task ? taskTitles.get(event.task) : undefined) ?? event.task ?? 'task'
        console.log(chalk.dim(`  ⊘ skipped: ${title.slice(0, 68)}`))
        break
      }
      case 'task_retry': {
        const d = event.data as { attempt?: number; maxAttempts?: number; nextDelayMs?: number } | undefined
        const attempt = d?.attempt ?? '?'
        const max = d?.maxAttempts ?? '?'
        const delay = d?.nextDelayMs != null ? `${d.nextDelayMs}ms` : ''
        console.log(chalk.yellow(`  ↺ retry ${attempt}/${max}${delay ? ` — next in ${delay}` : ''}`))
        break
      }
      case 'error': {
        const who = event.agent ?? event.task ?? 'unknown'
        const msg = event.data instanceof Error
          ? event.data.message
          : typeof event.data === 'string'
            ? event.data
            : ''
        console.error(chalk.red(`  ✗ error (${who})${msg ? ': ' + msg : ''}`))
        break
      }
      default:
        break
    }
  }

  function finish(): void {
    for (const s of spinners.values()) s.stop()
    spinners.clear()
  }

  return { onProgress, finish }
}
