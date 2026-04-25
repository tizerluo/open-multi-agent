import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export interface HistoryEntry {
  version: 1
  id: string
  mode: 'agent' | 'run' | 'chat'
  goal: string
  provider: string
  model: string
  agents: string[]
  output: string
  tokenUsage: { input_tokens: number; output_tokens: number }
  durationMs: number
  success: boolean
  timestamp: string
}

const historyDir = path.join(os.homedir(), '.oma', 'history')

export async function writeHistory(
  entry: Omit<HistoryEntry, 'version' | 'id' | 'timestamp'>,
): Promise<void> {
  await fs.mkdir(historyDir, { recursive: true })
  const id = new Date().toISOString()
  const full: HistoryEntry = {
    version: 1,
    id,
    timestamp: id,
    ...entry,
  }
  const filename = `${id.replace(/[:.]/g, '-')}.json`
  await fs.writeFile(path.join(historyDir, filename), JSON.stringify(full, null, 2), 'utf8')
}

export async function readHistory(limit = 20): Promise<HistoryEntry[]> {
  let files: string[]
  try {
    const entries = await fs.readdir(historyDir)
    files = entries.filter(f => f.endsWith('.json'))
  } catch {
    return []
  }

  files.sort((a, b) => b.localeCompare(a))
  const selected = files.slice(0, limit)

  const results: HistoryEntry[] = []
  for (const file of selected) {
    try {
      const raw = await fs.readFile(path.join(historyDir, file), 'utf8')
      results.push(JSON.parse(raw) as HistoryEntry)
    } catch {
      // skip malformed entries
    }
  }
  return results
}

export async function readHistoryEntry(index: number): Promise<HistoryEntry | null> {
  const entries = await readHistory(Infinity)
  return entries[index - 1] ?? null
}

export async function clearHistory(): Promise<void> {
  let files: string[]
  try {
    const entries = await fs.readdir(historyDir)
    files = entries.filter(f => f.endsWith('.json'))
  } catch {
    return
  }

  await Promise.all(files.map(f => fs.unlink(path.join(historyDir, f))))
}
