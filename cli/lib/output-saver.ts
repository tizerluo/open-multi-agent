import fs from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'
import readline from 'node:readline'

async function confirmOverwrite(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`File ${filePath} already exists. Overwrite? [y/N] `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

export async function saveOutput(filePath: string, content: string, force: boolean): Promise<void> {
  // Check if file exists
  let fileExists = false
  try {
    await fs.access(filePath)
    fileExists = true
  } catch {
    fileExists = false
  }

  if (fileExists && !force) {
    if (!process.stdin.isTTY) {
      console.error(`Error: Output file already exists: ${filePath}. Use --force to overwrite.`)
      process.exit(1)
    } else {
      const confirmed = await confirmOverwrite(filePath)
      if (!confirmed) {
        console.log('Aborted.')
        process.exit(0)
      }
    }
  }

  // Create parent directories if needed
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  // Write file
  await fs.writeFile(filePath, content, 'utf8')

  console.log(chalk.dim(`Saved to ${filePath}`))
}
