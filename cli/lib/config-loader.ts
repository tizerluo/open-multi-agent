import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { exitWithError } from './error-handler.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportedProvider = 'anthropic' | 'openai' | 'gemini' | 'grok' | 'copilot'

export interface OmaAgentConfig {
  name: string
  systemPrompt?: string
  tools?: string[]
  maxTurns?: number
}

export interface OmaConfig {
  version: number
  provider: SupportedProvider
  model: string
  baseURL?: string
  apiKey?: string
  team: {
    sharedMemory?: boolean
    maxConcurrency?: number
    agents: OmaAgentConfig[]
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: OmaConfig = {
  version: 1,
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  team: {
    sharedMemory: true,
    agents: [],
  },
}

// Map provider → env var name
const PROVIDER_ENV_VARS: Record<SupportedProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  grok: 'XAI_API_KEY',
  copilot: 'GITHUB_TOKEN',
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

export function globalConfigPath(): string {
  return path.join(os.homedir(), '.oma', 'config.json')
}

/** Walk up from cwd looking for .oma.json */
function findProjectConfig(): string | null {
  let dir = process.cwd()
  while (true) {
    const candidate = path.join(dir, '.oma.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function readJsonFile(filePath: string): Partial<OmaConfig> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as Partial<OmaConfig>
  } catch {
    return {}
  }
}

export function saveGlobalConfig(config: OmaConfig): void {
  const dir = path.dirname(globalConfigPath())
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(globalConfigPath(), JSON.stringify(config, null, 2), 'utf8')
  try {
    fs.chmodSync(globalConfigPath(), 0o600)
  } catch {
    // On Windows chmod is a no-op — silently skip
  }
}

// ---------------------------------------------------------------------------
// Load (merge layers)
// ---------------------------------------------------------------------------

export function loadConfig(overridePath?: string): OmaConfig {
  const global = readJsonFile(globalConfigPath())

  const projectPath = overridePath ?? findProjectConfig()
  const project = projectPath ? readJsonFile(projectPath) : {}

  // Deep merge: project overrides global, both override defaults
  const merged: OmaConfig = {
    ...DEFAULT_CONFIG,
    ...global,
    ...project,
    team: {
      ...DEFAULT_CONFIG.team,
      ...(global.team ?? {}),
      ...(project.team ?? {}),
    },
  }

  return merged
}

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

export function getEffectiveApiKey(config: OmaConfig): string | undefined {
  const envVar = PROVIDER_ENV_VARS[config.provider]
  return process.env[envVar] ?? config.apiKey
}

export function assertApiKey(config: OmaConfig): string {
  const key = getEffectiveApiKey(config)
  if (!key && config.provider !== 'copilot') {
    const envVar = PROVIDER_ENV_VARS[config.provider]
    exitWithError(
      `No API key found for provider "${config.provider}".`,
      `Set the ${envVar} environment variable, or run \`oma init\` to save a key.`,
    )
  }
  return key ?? ''
}

// ---------------------------------------------------------------------------
// Default model per provider
// ---------------------------------------------------------------------------

export function defaultModelForProvider(provider: SupportedProvider): string {
  const defaults: Record<SupportedProvider, string> = {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o',
    gemini: 'gemini-2.5-pro',
    grok: 'grok-3',
    copilot: 'gpt-4o',
  }
  return defaults[provider]
}
