import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type { StreamEvent } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/agent/agent.js', () => ({ Agent: vi.fn() }))
vi.mock('../../src/index.js', () => ({ OpenMultiAgent: vi.fn() }))
vi.mock('../../src/tool/framework.js', () => ({ ToolRegistry: vi.fn() }))
vi.mock('../../src/tool/executor.js', () => ({ ToolExecutor: vi.fn() }))
vi.mock('../../src/tool/built-in/index.js', () => ({ registerBuiltInTools: vi.fn() }))
vi.mock('../../cli/lib/config-loader.js', () => ({
  loadConfig: vi.fn(() => ({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })),
  assertApiKey: vi.fn(() => 'sk-fake'),
}))
vi.mock('../../cli/lib/error-handler.js', () => ({ exitWithError: vi.fn() }))
vi.mock('../../cli/lib/stream-renderer.js', () => ({ renderStreamEvent: vi.fn() }))
vi.mock('../../cli/lib/progress-renderer.js', () => ({
  createProgressRenderer: vi.fn(() => ({ onProgress: vi.fn(), finish: vi.fn() })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeMockAgent(streamEvents: StreamEvent[] = []) {
  async function* fakeStream() {
    for (const e of streamEvents) yield e
  }
  const mockAgent = {
    stream: vi.fn().mockReturnValue(fakeStream()),
    prompt: vi.fn(),
    reset: vi.fn(),
  }
  const { Agent } = await import('../../src/agent/agent.js')
  vi.mocked(Agent).mockImplementation(() => mockAgent as any)
  return mockAgent
}

async function makeMockOrchestrator(result: object = {}) {
  const defaultResult = {
    success: true,
    output: 'mock output',
    tokenUsage: { input_tokens: 10, output_tokens: 20 },
    messages: [],
    toolCalls: [],
  }
  const mockOrchestrator = {
    runAgent: vi.fn().mockResolvedValue({ ...defaultResult, ...result }),
  }
  const { OpenMultiAgent } = await import('../../src/index.js')
  vi.mocked(OpenMultiAgent).mockImplementation(() => mockOrchestrator as any)
  return mockOrchestrator
}

async function runAgentCommand(args: string[]) {
  // Import fresh each time (mocks are already set up)
  const { registerAgentCommand } = await import('../../cli/commands/agent.js')
  const program = new Command()
  program.exitOverride()
  registerAgentCommand(program)
  await program.parseAsync(['node', 'oma', 'agent', ...args])
}

// ---------------------------------------------------------------------------
// TTY / process.exit setup
// ---------------------------------------------------------------------------

const originalIsTTY = process.stdout.isTTY

beforeEach(() => {
  vi.clearAllMocks()
  ;(process.stdout as any).isTTY = true
})

afterEach(() => {
  ;(process.stdout as any).isTTY = originalIsTTY
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agent command', () => {
  describe('streaming path (TTY, no --no-stream)', () => {
    it('constructs Agent and calls agent.stream() when TTY and stream not disabled', async () => {
      const mockAgent = await makeMockAgent([
        { type: 'done', data: { success: true, tokenUsage: { input_tokens: 5, output_tokens: 10 }, messages: [], toolCalls: [] } },
      ])
      ;(process.stdout as any).isTTY = true

      await runAgentCommand(['hello'])

      const { Agent } = await import('../../src/agent/agent.js')
      expect(vi.mocked(Agent)).toHaveBeenCalled()
      expect(mockAgent.stream).toHaveBeenCalledWith('hello')
    })

    it('does NOT construct OpenMultiAgent when streaming', async () => {
      await makeMockAgent([
        { type: 'done', data: { success: true, tokenUsage: { input_tokens: 5, output_tokens: 10 }, messages: [], toolCalls: [] } },
      ])
      ;(process.stdout as any).isTTY = true

      await runAgentCommand(['hello'])

      const { OpenMultiAgent } = await import('../../src/index.js')
      expect(vi.mocked(OpenMultiAgent)).not.toHaveBeenCalled()
    })
  })

  describe('non-streaming path (--no-stream)', () => {
    it('constructs OpenMultiAgent and calls runAgent when --no-stream is passed', async () => {
      const mockOrch = await makeMockOrchestrator()
      ;(process.stdout as any).isTTY = true

      await runAgentCommand(['hello', '--no-stream'])

      const { OpenMultiAgent } = await import('../../src/index.js')
      expect(vi.mocked(OpenMultiAgent)).toHaveBeenCalled()
      expect(mockOrch.runAgent).toHaveBeenCalled()
    })

    it('does NOT construct Agent when --no-stream is passed', async () => {
      await makeMockOrchestrator()
      ;(process.stdout as any).isTTY = true

      await runAgentCommand(['hello', '--no-stream'])

      const { Agent } = await import('../../src/agent/agent.js')
      expect(vi.mocked(Agent)).not.toHaveBeenCalled()
    })
  })

  describe('non-streaming path (non-TTY)', () => {
    it('constructs OpenMultiAgent when stdout is not a TTY', async () => {
      const mockOrch = await makeMockOrchestrator()
      ;(process.stdout as any).isTTY = undefined

      await runAgentCommand(['hello'])

      const { OpenMultiAgent } = await import('../../src/index.js')
      expect(vi.mocked(OpenMultiAgent)).toHaveBeenCalled()
      expect(mockOrch.runAgent).toHaveBeenCalled()
    })

    it('does NOT construct Agent when stdout is not a TTY', async () => {
      await makeMockOrchestrator()
      ;(process.stdout as any).isTTY = undefined

      await runAgentCommand(['hello'])

      const { Agent } = await import('../../src/agent/agent.js')
      expect(vi.mocked(Agent)).not.toHaveBeenCalled()
    })
  })

  describe('--max-turns validation', () => {
    it('calls exitWithError when --max-turns is NaN (non-numeric string)', async () => {
      await makeMockOrchestrator()

      await runAgentCommand(['hello', '--no-stream', '--max-turns', 'abc'])

      const { exitWithError } = await import('../../cli/lib/error-handler.js')
      expect(vi.mocked(exitWithError)).toHaveBeenCalled()
    })

    it('calls exitWithError when --max-turns is 0', async () => {
      await makeMockOrchestrator()

      await runAgentCommand(['hello', '--no-stream', '--max-turns', '0'])

      const { exitWithError } = await import('../../cli/lib/error-handler.js')
      expect(vi.mocked(exitWithError)).toHaveBeenCalled()
    })
  })

  describe('--tools parsing', () => {
    it('passes parsed tools array to agentConfig when --tools is provided', async () => {
      const mockAgent = await makeMockAgent([
        { type: 'done', data: { success: true, tokenUsage: { input_tokens: 5, output_tokens: 10 }, messages: [], toolCalls: [] } },
      ])
      ;(process.stdout as any).isTTY = true

      await runAgentCommand(['hello', '--tools', 'bash,file_read'])

      const { Agent } = await import('../../src/agent/agent.js')
      // Agent constructor receives (agentConfig, registry, executor)
      const constructorCall = vi.mocked(Agent).mock.calls[0]
      expect(constructorCall).toBeDefined()
      const agentConfig = constructorCall![0]
      expect(agentConfig.tools).toEqual(['bash', 'file_read'])
    })
  })

  describe('stream event handling', () => {
    it('logs token info when stream yields done event with tokenUsage', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await makeMockAgent([
        {
          type: 'done',
          data: {
            success: true,
            tokenUsage: { input_tokens: 42, output_tokens: 84 },
            messages: [],
            toolCalls: [],
          },
        },
      ])
      ;(process.stdout as any).isTTY = true

      await runAgentCommand(['hello'])

      const allLogs = consoleLogSpy.mock.calls.map(c => String(c[0] ?? '')).join('\n')
      expect(allLogs).toContain('42')
      expect(allLogs).toContain('84')

      consoleLogSpy.mockRestore()
    })

    it('calls exitWithError when stream yields an error event', async () => {
      await makeMockAgent([
        { type: 'error', data: new Error('stream blew up') },
      ])
      ;(process.stdout as any).isTTY = true

      await runAgentCommand(['hello'])

      const { exitWithError } = await import('../../cli/lib/error-handler.js')
      expect(vi.mocked(exitWithError)).toHaveBeenCalledWith('stream blew up')
    })
  })

  describe('non-streaming result handling', () => {
    it('calls process.exit(1) when runAgent returns success=false', async () => {
      await makeMockOrchestrator({ success: false })
      ;(process.stdout as any).isTTY = true

      // process.exit is inside a try block; when it throws the catch swallows
      // the error and calls exitWithError (also mocked, so it's a no-op).
      // We just need to verify process.exit(1) was called.
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: any) => {
        // Throw so execution stops at the call site, but don't let the error propagate
        // further than the enclosing catch; the whole command will still resolve.
        throw new Error('process.exit called')
      })

      // The command promise resolves because the catch block swallows the thrown error
      await runAgentCommand(['hello', '--no-stream'])

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })
  })
})
