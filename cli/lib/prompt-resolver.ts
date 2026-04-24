import fs from 'node:fs/promises'
import path from 'node:path'

export interface PromptResolverOpts {
  positional?: string   // positional arg
  file?: string         // --file path
  context?: string      // --context path (file or directory)
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').trim()
}

async function readContextFile(filePath: string, displayPath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf8')
  return `\n\n--- ${displayPath} ---\n${content}`
}

export async function resolvePrompt(opts: PromptResolverOpts): Promise<string> {
  const hasPipe = !process.stdin.isTTY

  // Count how many prompt sources are provided
  const sources = [
    opts.positional !== undefined && opts.positional !== '',
    opts.file !== undefined,
    hasPipe,
  ].filter(Boolean).length

  if (sources > 1) {
    console.error('Error: --file cannot be combined with a positional prompt argument.')
    console.error('Use one of: <prompt>, --file <path>, or pipe via stdin.')
    process.exit(1)
  }

  if (sources === 0) {
    console.error('Error: No prompt provided.')
    process.exit(1)
  }

  // Read main prompt
  let prompt: string

  if (opts.positional !== undefined && opts.positional !== '') {
    prompt = opts.positional
  } else if (opts.file !== undefined) {
    try {
      prompt = await fs.readFile(opts.file, 'utf8')
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(`Error: File not found: ${opts.file}`)
        process.exit(1)
      }
      throw err
    }
  } else {
    // hasPipe must be true
    prompt = await readStdin()
  }

  // Append context if provided
  if (opts.context !== undefined) {
    let stat
    try {
      stat = await fs.stat(opts.context)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(`Error: Context path not found: ${opts.context}`)
        process.exit(1)
      }
      throw err
    }

    if (stat.isDirectory()) {
      // Recursively read all files in the directory
      const allFiles = await fs.readdir(opts.context, { recursive: true })
      for (const entry of allFiles) {
        const entryStr = entry as string
        const fullPath = path.join(opts.context, entryStr)
        let entryStat
        try {
          entryStat = await fs.stat(fullPath)
        } catch {
          continue
        }
        if (entryStat.isFile()) {
          try {
            prompt += await readContextFile(fullPath, entryStr)
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } else {
      // Single file
      prompt += await readContextFile(opts.context, opts.context)
    }
  }

  return prompt
}
