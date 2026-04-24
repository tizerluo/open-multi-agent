import { Command } from 'commander'
import chalk from 'chalk'
import { loadConfig, assertApiKey, type SupportedProvider } from '../lib/config-loader.js'
import { createProgressRenderer } from '../lib/progress-renderer.js'
import { renderStreamEvent } from '../lib/stream-renderer.js'
import { exitWithError } from '../lib/error-handler.js'
import { saveOutput } from '../lib/output-saver.js'
import { resolvePrompt } from '../lib/prompt-resolver.js'
import { OpenMultiAgent } from '../../src/index.js'
import { Agent } from '../../src/agent/agent.js'
import { ToolRegistry } from '../../src/tool/framework.js'
import { ToolExecutor } from '../../src/tool/executor.js'
import { registerBuiltInTools } from '../../src/tool/built-in/index.js'
import type { AgentConfig, AgentRunResult } from '../../src/types.js'

interface AgentOpts {
  model?: string
  provider?: string
  system?: string
  tools?: string
  maxTurns?: string
  config?: string
  // Commander converts --no-stream to stream: false (not noStream)
  stream?: boolean
  output?: string
  force?: boolean
  file?: string
  context?: string
}

export function registerAgentCommand(program: Command): void {
  program
    .command('agent [prompt]')
    .description('Run a single agent with the given prompt')
    .option('-m, --model <model>', 'Model name (overrides config)')
    .option('-p, --provider <provider>', 'Provider: anthropic|openai|gemini|grok|copilot')
    .option('-s, --system <systemPrompt>', 'System prompt')
    .option('--tools <tools>', 'Comma-separated tool names, e.g. bash,file_read')
    .option('--max-turns <n>', 'Maximum turns', '10')
    .option('--no-stream', 'Disable streaming output (use spinner instead)')
    .option('--config <path>', 'Config file path')
    .option('--output <path>', 'Save output to file')
    .option('--force', 'Overwrite output file without prompting')
    .option('--file <path>', 'Read prompt from file')
    .option('--context <path>', 'Append file or directory contents as context')
    .action(async (prompt: string | undefined, opts: AgentOpts) => {
      const resolvedPrompt = await resolvePrompt({ positional: prompt, file: opts.file, context: opts.context })
      const config = loadConfig(opts.config)
      const provider = (opts.provider ?? config.provider) as SupportedProvider
      const model = opts.model ?? config.model
      // Only carry baseURL from config when the provider hasn't been overridden;
      // otherwise a saved DeepSeek baseURL would be sent to Grok/Anthropic etc.
      const baseURL = opts.provider == null ? config.baseURL : undefined

      // Temporarily override provider for key lookup
      const apiKey = assertApiKey({ ...config, provider })

      const tools = opts.tools
        ? opts.tools.split(',').map(t => t.trim())
        : ['bash', 'file_read', 'file_write']

      const maxTurns = parseInt(opts.maxTurns ?? '10', 10)
      if (isNaN(maxTurns) || maxTurns < 1) {
        exitWithError(
          `Invalid --max-turns value "${opts.maxTurns}".`,
          'Provide a positive integer, e.g. --max-turns 10',
        )
      }

      const agentConfig: AgentConfig = {
        name: 'oma-agent',
        model,
        provider,
        apiKey,
        baseURL,
        systemPrompt: opts.system ?? 'You are a helpful assistant.',
        tools,
        maxTurns,
      }

      // Use streaming unless --no-stream is set or stdout is not a TTY (e.g. piped)
      // Commander sets opts.stream = false when --no-stream is passed
      const useStream = opts.stream !== false && !!process.stdout.isTTY

      console.log()

      if (useStream) {
        await runStreaming(agentConfig, resolvedPrompt, { output: opts.output, force: opts.force })
      } else {
        await runWithSpinner(agentConfig, resolvedPrompt, { model, provider, apiKey, baseURL, output: opts.output, force: opts.force })
      }
    })
}

async function runStreaming(
  agentConfig: AgentConfig,
  prompt: string,
  opts: { output?: string; force?: boolean },
): Promise<void> {
  const registry = new ToolRegistry()
  registerBuiltInTools(registry)
  const executor = new ToolExecutor(registry)
  const agent = new Agent(agentConfig, registry, executor)

  try {
    let result: AgentRunResult | undefined
    let outputText = ''

    for await (const event of agent.stream(prompt)) {
      if (event.type === 'done') {
        result = event.data as AgentRunResult
      } else if (event.type === 'error') {
        const err = event.data instanceof Error ? event.data : new Error(String(event.data))
        exitWithError(err.message)
      } else {
        if (event.type === 'text') {
          outputText += event.data
        }
        renderStreamEvent(event)
      }
    }

    process.stdout.write('\n')
    console.log(chalk.dim('─'.repeat(60)))

    if (result) {
      console.log(chalk.dim(
        `Tokens: ${result.tokenUsage.input_tokens} in / ${result.tokenUsage.output_tokens} out`,
      ))
      if (opts.output) {
        await saveOutput(opts.output, outputText, opts.force ?? false)
      }
      if (!result.success) process.exit(1)
    }
  } catch (err) {
    exitWithError(err instanceof Error ? err.message : String(err))
  }
}

async function runWithSpinner(
  agentConfig: AgentConfig,
  prompt: string,
  opts: { model: string; provider: SupportedProvider; apiKey: string; baseURL?: string; output?: string; force?: boolean },
): Promise<void> {
  const renderer = createProgressRenderer()

  const orchestrator = new OpenMultiAgent({
    defaultModel: opts.model,
    defaultProvider: opts.provider,
    defaultApiKey: opts.apiKey,
    defaultBaseURL: opts.baseURL,
    onProgress: renderer.onProgress,
  })

  try {
    const result = await orchestrator.runAgent(agentConfig, prompt)
    renderer.finish()

    console.log('\n' + chalk.bold('─'.repeat(60)))
    console.log(result.output || chalk.dim('(no output)'))
    console.log(chalk.dim(
      `\nTokens: ${result.tokenUsage.input_tokens} in / ${result.tokenUsage.output_tokens} out`,
    ))

    if (opts.output) {
      await saveOutput(opts.output, result.output ?? '', opts.force ?? false)
    }

    if (!result.success) process.exit(1)
  } catch (err) {
    renderer.finish()
    exitWithError(err instanceof Error ? err.message : String(err))
  }
}
