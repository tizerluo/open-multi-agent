/**
 * DeepSeek Test — Single Agent
 *
 * DeepSeek uses OpenAI-compatible API, so set provider='openai' + baseURL.
 *
 * Run:
 *   DEEPSEEK_API_KEY=sk-xxx npx tsx examples/deepseek-test.ts
 */

import { Agent, ToolRegistry, ToolExecutor } from '../src/index.js'

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error('Missing DEEPSEEK_API_KEY')
  process.exit(1)
}

const registry = new ToolRegistry()
const executor = new ToolExecutor(registry)

const agent = new Agent(
  {
    name: 'assistant',
    model: 'deepseek-chat',
    provider: 'openai',
    baseURL: 'https://api.deepseek.com',
    apiKey,
    systemPrompt: 'You are a helpful assistant. Be concise.',
    maxTurns: 3,
  },
  registry,
  executor,
)

console.log('Streaming from DeepSeek...\n')

for await (const event of agent.stream('Write a one-line Python function that reverses a string, then briefly explain it.')) {
  console.log(`[event] type=${event.type}`, JSON.stringify(event.data).slice(0, 200))
}
