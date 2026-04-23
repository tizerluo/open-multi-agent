import { Command } from 'commander'
import chalk from 'chalk'
import {
  type OmaConfig,
  type OmaAgentConfig,
  type SupportedProvider,
  saveGlobalConfig,
  defaultModelForProvider,
  globalConfigPath,
} from '../lib/config-loader.js'

const PROVIDERS: SupportedProvider[] = ['anthropic', 'openai', 'gemini', 'grok', 'copilot']

const ALL_TOOLS = ['bash', 'file_read', 'file_write', 'file_edit', 'grep']

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Interactive setup — creates ~/.oma/config.json')
    .action(async () => {
      // Lazy-import inquirer to keep startup fast for other commands
      const { default: inquirer } = await import('inquirer')

      console.log(chalk.bold('\nWelcome to Open Multi-Agent (oma) setup\n'))
      console.log(chalk.dim('This will create your config file at ' + globalConfigPath() + '\n'))

      // -----------------------------------------------------------------------
      // Step 1: Provider + model + API key
      // -----------------------------------------------------------------------
      const base = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Which AI provider do you want to use?',
          choices: PROVIDERS,
          default: 'anthropic',
        },
        {
          type: 'input',
          name: 'model',
          message: 'Default model name?',
          default: (ans: { provider: SupportedProvider }) => defaultModelForProvider(ans.provider),
        },
        {
          type: 'input',
          name: 'baseURL',
          message: 'Custom base URL? (leave blank for default, e.g. https://api.deepseek.com)',
          default: '',
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API key? (leave blank to use environment variable)',
          mask: '*',
        },
      ])

      // -----------------------------------------------------------------------
      // Step 2: Configure agents
      // -----------------------------------------------------------------------
      const { addAgents } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addAgents',
          message: 'Configure a default team of agents?',
          default: true,
        },
      ])

      const agents: OmaAgentConfig[] = []

      if (addAgents) {
        console.log(chalk.dim('\nAdd agents one by one. Press Enter with a blank name to stop.\n'))

        while (true) {
          const { name } = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: `Agent name (${agents.length + 1})? (blank to finish)`,
            },
          ])

          if (!name.trim()) break

          const agentAnswers = await inquirer.prompt([
            {
              type: 'input',
              name: 'systemPrompt',
              message: `  Role / system prompt for "${name}":`,
              default: `You are a helpful assistant named ${name}.`,
            },
            {
              type: 'checkbox',
              name: 'tools',
              message: `  Tools for "${name}":`,
              choices: ALL_TOOLS,
              default: ['bash', 'file_read', 'file_write'],
            },
            {
              type: 'number',
              name: 'maxTurns',
              message: `  Max turns for "${name}":`,
              default: 10,
            },
          ])

          agents.push({
            name: name.trim(),
            systemPrompt: agentAnswers.systemPrompt,
            tools: agentAnswers.tools,
            maxTurns: agentAnswers.maxTurns,
          })

          console.log(chalk.green(`  ✓ Agent "${name}" added\n`))
        }
      }

      // -----------------------------------------------------------------------
      // Step 3: Build and save config
      // -----------------------------------------------------------------------
      const config: OmaConfig = {
        version: 1,
        provider: base.provider,
        model: base.model,
        ...(base.baseURL ? { baseURL: base.baseURL } : {}),
        ...(base.apiKey ? { apiKey: base.apiKey } : {}),
        team: {
          sharedMemory: agents.length > 1,
          agents,
        },
      }

      saveGlobalConfig(config)

      console.log(chalk.bold.green('\n✓ Config saved to ' + globalConfigPath()))
      if (base.apiKey) {
        console.log(chalk.yellow('  ⚠ API key stored in plaintext — keep the file private (permissions: 600)'))
      }
      console.log(chalk.dim('\nNext steps:'))
      console.log(chalk.dim('  oma config show          — review your settings'))
      console.log(chalk.dim('  oma agent "your prompt"  — run a single agent'))
      console.log(chalk.dim('  oma run "your goal"      — run the full team\n'))
    })
}
