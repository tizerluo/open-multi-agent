import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'node:readline'
import { loadConfig, assertApiKey, type SupportedProvider } from '../lib/config-loader.js'
import { exitWithError } from '../lib/error-handler.js'
import { Agent } from '../../src/agent/agent.js'
import { ToolRegistry } from '../../src/tool/framework.js'
import { ToolExecutor } from '../../src/tool/executor.js'
import { registerBuiltInTools } from '../../src/tool/built-in/index.js'
import type { AgentConfig } from '../../src/types.js'

interface ChatOpts {
  model?: string
  provider?: string
  system?: string
  tools?: string
  config?: string
}

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start an interactive multi-turn conversation with an agent')
    .option('-m, --model <model>', 'Model name (overrides config)')
    .option('-p, --provider <provider>', 'Provider: anthropic|openai|gemini|grok|copilot')
    .option('-s, --system <systemPrompt>', 'System prompt')
    .option('--tools <tools>', 'Comma-separated tool names, e.g. bash,file_read')
    .option('--config <path>', 'Config file path')
    .action(async (opts: ChatOpts) => {
      const config = loadConfig(opts.config)
      const provider = (opts.provider ?? config.provider) as SupportedProvider
      const model = opts.model ?? config.model
      const baseURL = opts.provider == null ? config.baseURL : undefined
      const apiKey = assertApiKey({ ...config, provider })

      const tools = opts.tools
        ? opts.tools.split(',').map(t => t.trim())
        : (config.team?.agents?.[0]?.tools ?? ['bash', 'file_read', 'file_write'])

      const agentConfig: AgentConfig = {
        name: 'oma-chat',
        model,
        provider,
        apiKey,
        baseURL,
        systemPrompt: opts.system ?? 'You are a helpful assistant.',
        tools,
        maxTurns: 20,
      }

      const registry = new ToolRegistry()
      registerBuiltInTools(registry)
      const executor = new ToolExecutor(registry)
      const agent = new Agent(agentConfig, registry, executor)

      let totalIn = 0
      let totalOut = 0
      let turns = 0
      let exiting = false

      function printSummary(): void {
        console.log('\n' + chalk.dim('─'.repeat(60)))
        console.log(chalk.dim(
          `Session ended. Tokens: ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out (${turns} turn${turns === 1 ? '' : 's'})`,
        ))
      }

      // Guard against SIGINT + close both firing (process.exit triggers stream close)
      process.on('SIGINT', () => {
        if (exiting) return
        exiting = true
        console.log()
        printSummary()
        process.exit(0)
      })

      // Welcome banner
      console.log()
      console.log(chalk.bold('oma chat') + chalk.dim(` — ${model} (${provider})`))
      console.log(chalk.dim(`Tools: ${tools.join(', ')}`))
      console.log(chalk.dim('Type /help for commands, Ctrl+C to exit.'))
      console.log(chalk.dim('─'.repeat(60)))
      console.log()

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      })

      rl.on('close', () => {
        if (exiting) return
        exiting = true
        printSummary()
        process.exit(0)
      })

      function printHelp(): void {
        console.log(chalk.cyan('/clear') + '   Clear conversation history')
        console.log(chalk.cyan('/tools') + '   List available tools')
        console.log(chalk.cyan('/exit ') + '   End the session')
        console.log(chalk.cyan('/help ') + '   Show this message')
      }

      function ask(): void {
        rl.question(chalk.cyan('You: '), async (input: string) => {
          const trimmed = input.trim()

          if (trimmed === '') {
            ask()
            return
          }

          if (trimmed.startsWith('/')) {
            const shouldContinue = handleSlashCommand(trimmed, agent, rl, tools, printHelp)
            if (shouldContinue) ask()
            return
          }

          process.stdout.write(chalk.bold('Agent: '))

          try {
            const result = await agent.prompt(trimmed)

            console.log(result.output || chalk.dim('(no output)'))
            console.log()

            totalIn += result.tokenUsage.input_tokens
            totalOut += result.tokenUsage.output_tokens
            turns++
          } catch (err) {
            console.log(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`))
            console.log()
          }

          ask()
        })
      }

      ask()
    })
}

// Returns true if the REPL should continue, false if it should stop.
function handleSlashCommand(
  cmd: string,
  agent: Agent,
  rl: readline.Interface,
  tools: string[],
  printHelp: () => void,
): boolean {
  const lower = cmd.toLowerCase()
  switch (lower) {
    case '/clear':
      agent.reset()
      console.log(chalk.dim('Conversation cleared.'))
      console.log()
      return true
    case '/exit':
    case '/quit':
      rl.close()
      return false
    case '/tools':
      console.log(chalk.dim(`Tools: ${tools.join(', ')}`))
      console.log()
      return true
    case '/help':
      printHelp()
      console.log()
      return true
    default:
      console.log(chalk.yellow(`Unknown command: ${cmd}. Type /help for available commands.`))
      console.log()
      return true
  }
}

