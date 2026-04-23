import { Command } from 'commander'
import chalk from 'chalk'
import { loadConfig, assertApiKey, type SupportedProvider } from '../lib/config-loader.js'
import { createProgressRenderer } from '../lib/progress-renderer.js'
import { exitWithError } from '../lib/error-handler.js'
import { OpenMultiAgent } from '../../src/index.js'
import type { AgentConfig } from '../../src/types.js'

interface AgentOpts {
  model?: string
  provider?: string
  system?: string
  tools?: string
  maxTurns?: string
  config?: string
}

export function registerAgentCommand(program: Command): void {
  program
    .command('agent <prompt>')
    .description('Run a single agent with the given prompt')
    .option('-m, --model <model>', 'Model name (overrides config)')
    .option('-p, --provider <provider>', 'Provider: anthropic|openai|gemini|grok|copilot')
    .option('-s, --system <systemPrompt>', 'System prompt')
    .option('--tools <tools>', 'Comma-separated tool names, e.g. bash,file_read')
    .option('--max-turns <n>', 'Maximum turns', '10')
    .option('--config <path>', 'Config file path')
    .action(async (prompt: string, opts: AgentOpts) => {
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

      const renderer = createProgressRenderer()

      const orchestrator = new OpenMultiAgent({
        defaultModel: model,
        defaultProvider: provider,
        defaultApiKey: apiKey,
        defaultBaseURL: baseURL,
        onProgress: renderer.onProgress,
      })

      console.log()

      try {
        const result = await orchestrator.runAgent(agentConfig, prompt)
        renderer.finish()

        console.log('\n' + chalk.bold('─'.repeat(60)))
        console.log(result.output || chalk.dim('(no output)'))
        console.log(chalk.dim(
          `\nTokens: ${result.tokenUsage.input_tokens} in / ${result.tokenUsage.output_tokens} out`,
        ))

        if (!result.success) process.exit(1)
      } catch (err) {
        renderer.finish()
        exitWithError(err instanceof Error ? err.message : String(err))
      }
    })
}
