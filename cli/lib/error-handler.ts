import chalk from 'chalk'

export function exitWithError(message: string, hint?: string): never {
  console.error(chalk.red('\nError: ') + message)
  if (hint) console.error(chalk.dim('Hint: ' + hint))
  process.exit(1)
}
