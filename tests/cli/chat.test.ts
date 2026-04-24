import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:readline', () => ({
  default: { createInterface: vi.fn() },
  createInterface: vi.fn(),
}))
vi.mock('../../src/agent/agent.js', () => ({ Agent: vi.fn() }))
vi.mock('../../src/tool/framework.js', () => ({ ToolRegistry: vi.fn() }))
vi.mock('../../src/tool/executor.js', () => ({ ToolExecutor: vi.fn() }))
vi.mock('../../src/tool/built-in/index.js', () => ({ registerBuiltInTools: vi.fn() }))
vi.mock('../../cli/lib/config-loader.js', () => ({
  loadConfig: vi.fn(() => ({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })),
  assertApiKey: vi.fn(() => 'sk-fake'),
}))
vi.mock('../../cli/lib/error-handler.js', () => ({ exitWithError: vi.fn() }))
vi.mock('../../cli/lib/history.js', () => ({ writeHistory: vi.fn().mockResolvedValue(undefined) }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock readline interface that delivers `inputs` one by one via the
 * `question` callback.  When `rl.close()` is called, the registered `close`
 * event handler fires synchronously so the REPL terminates cleanly.
 */
function buildMockRl(inputs: string[]) {
  let questionIndex = 0
  let closeHandler: (() => void) | null = null

  const mockRl = {
    question: vi.fn().mockImplementation((_prompt: string, cb: (s: string) => void) => {
      const input = inputs[questionIndex]
      if (input !== undefined) {
        questionIndex++
        setImmediate(() => cb(input))
      }
      // If no more inputs, leave the rl hanging (no more cb calls)
    }),
    close: vi.fn().mockImplementation(() => {
      closeHandler?.()
    }),
    on: vi.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === 'close') closeHandler = cb
    }),
  }
  return mockRl
}

/** Default mock agent — callers may override individual methods. */
async function makeMockAgent(overrides: Record<string, unknown> = {}) {
  const defaultPromptResult = {
    output: 'mock response',
    success: true,
    tokenUsage: { input_tokens: 5, output_tokens: 10 },
    messages: [],
    toolCalls: [],
  }

  const mockAgent = {
    prompt: vi.fn().mockResolvedValue(defaultPromptResult),
    reset: vi.fn(),
    ...overrides,
  }

  const { Agent } = await import('../../src/agent/agent.js')
  vi.mocked(Agent).mockImplementation(() => mockAgent as any)
  return mockAgent
}

/**
 * Wire up the readline mock, register the chat command, and invoke it.
 * Resolves once the REPL has processed all queued inputs.
 *
 * `tickCount` controls how many setImmediate cycles we drain after
 * parseAsync starts.  Increase it for longer input sequences.
 */
async function simulateChat(inputs: string[], tickCount = 8) {
  const mockRl = buildMockRl(inputs)

  // The chat.ts source uses: import readline from 'node:readline'  then
  // readline.createInterface(…).  The default export mock must expose it.
  const readline = await import('node:readline')
  ;(readline as any).default = { createInterface: vi.fn().mockReturnValue(mockRl) }
  vi.mocked(readline.createInterface).mockReturnValue(mockRl as any)

  const { registerChatCommand } = await import('../../cli/commands/chat.js')
  const program = new Command()
  program.exitOverride()
  registerChatCommand(program)

  // Start running — the REPL is driven by setImmediate callbacks.
  const parsePromise = program.parseAsync(['node', 'oma', 'chat'])

  // Drain enough event-loop ticks to process all inputs.
  for (let i = 0; i < tickCount; i++) {
    await new Promise(resolve => setImmediate(resolve))
  }

  // Don't await parsePromise in tests where process.exit isn't mocked out —
  // return it so callers can decide.
  return { mockRl, parsePromise }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let exitSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  // Prevent process.exit() from actually terminating the test process.
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: any) => {
    // no-op
  })
  // Each test registers a SIGINT handler; increase the limit to avoid warnings.
  process.setMaxListeners(50)
})

afterEach(() => {
  exitSpy.mockRestore()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chat command — REPL behaviour', () => {
  describe('empty input skipped', () => {
    it('does not call agent.prompt() for empty string but does call it for the next real input', async () => {
      const mockAgent = await makeMockAgent()
      // '' → skip, 'hello' → prompt, '/exit' → stop
      await simulateChat(['', 'hello', '/exit'])

      expect(mockAgent.prompt).toHaveBeenCalledTimes(1)
      expect(mockAgent.prompt).toHaveBeenCalledWith('hello')
    })
  })

  describe('normal input', () => {
    it('calls agent.prompt() with the trimmed user input', async () => {
      const mockAgent = await makeMockAgent()
      await simulateChat(['hello', '/exit'])

      expect(mockAgent.prompt).toHaveBeenCalledWith('hello')
    })

    it('does not call agent.prompt() for slash commands', async () => {
      const mockAgent = await makeMockAgent()
      await simulateChat(['/help', '/exit'])

      expect(mockAgent.prompt).not.toHaveBeenCalled()
    })
  })

  describe('token accumulation', () => {
    it('sums input and output tokens across multiple turns and prints them in the session summary', async () => {
      const mockAgent = await makeMockAgent()
      // Override prompt to return different token counts per call
      mockAgent.prompt
        .mockResolvedValueOnce({
          output: 'first',
          success: true,
          tokenUsage: { input_tokens: 10, output_tokens: 20 },
        })
        .mockResolvedValueOnce({
          output: 'second',
          success: true,
          tokenUsage: { input_tokens: 30, output_tokens: 40 },
        })

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await simulateChat(['first msg', 'second msg', '/exit'])

      const allLogs = consoleLogSpy.mock.calls.map(c => String(c[0] ?? '')).join('\n')

      // totalIn = 10+30 = 40, totalOut = 20+40 = 60
      expect(allLogs).toContain('40')
      expect(allLogs).toContain('60')

      consoleLogSpy.mockRestore()
    })
  })

  describe('/clear command', () => {
    it('calls agent.reset() and continues the REPL', async () => {
      const mockAgent = await makeMockAgent()
      await simulateChat(['/clear', '/exit'])

      expect(mockAgent.reset).toHaveBeenCalledTimes(1)
    })

    it('does not call agent.prompt() for /clear', async () => {
      const mockAgent = await makeMockAgent()
      await simulateChat(['/clear', '/exit'])

      expect(mockAgent.prompt).not.toHaveBeenCalled()
    })
  })

  describe('/exit command', () => {
    it('calls rl.close()', async () => {
      await makeMockAgent()
      const { mockRl } = await simulateChat(['/exit'])

      expect(mockRl.close).toHaveBeenCalled()
    })

    it('does not call agent.prompt()', async () => {
      const mockAgent = await makeMockAgent()
      await simulateChat(['/exit'])

      expect(mockAgent.prompt).not.toHaveBeenCalled()
    })
  })

  describe('/quit command', () => {
    it('calls rl.close() (same as /exit)', async () => {
      await makeMockAgent()
      const { mockRl } = await simulateChat(['/quit'])

      expect(mockRl.close).toHaveBeenCalled()
    })
  })

  describe('/tools command', () => {
    it('does not call agent.prompt()', async () => {
      const mockAgent = await makeMockAgent()
      await simulateChat(['/tools', '/exit'])

      expect(mockAgent.prompt).not.toHaveBeenCalled()
    })
  })

  describe('/help command', () => {
    it('does not call agent.prompt()', async () => {
      const mockAgent = await makeMockAgent()
      await simulateChat(['/help', '/exit'])

      expect(mockAgent.prompt).not.toHaveBeenCalled()
    })
  })

  describe('unknown slash command', () => {
    it('does not crash and does not call agent.prompt()', async () => {
      const mockAgent = await makeMockAgent()
      // Should not throw
      await simulateChat(['/unknown', '/exit'])

      expect(mockAgent.prompt).not.toHaveBeenCalled()
    })
  })

  describe('prompt error handling', () => {
    it('does not propagate the error — REPL continues after agent.prompt() rejects', async () => {
      const mockAgent = await makeMockAgent()
      mockAgent.prompt
        .mockRejectedValueOnce(new Error('LLM failed'))
        .mockResolvedValueOnce({
          output: 'recovered',
          success: true,
          tokenUsage: { input_tokens: 1, output_tokens: 1 },
        })

      // Should not throw — error is caught internally
      await simulateChat(['bad input', 'good input', '/exit'], 12)

      // Both calls were made, proving the REPL did not stop after the error
      expect(mockAgent.prompt).toHaveBeenCalledTimes(2)
    })
  })
})

describe('chat command — SIGINT guard', () => {
  it('calls process.exit() only once even when SIGINT is fired twice', async () => {
    await makeMockAgent()

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: any) => {
      // Don't actually exit
    })
    const processOnSpy = vi.spyOn(process, 'on')

    // Run the command so the SIGINT handler gets registered
    await simulateChat(['/exit'])

    // Find the SIGINT handler that was registered
    const sigintCall = processOnSpy.mock.calls.find(c => c[0] === 'SIGINT')
    const sigintHandler = sigintCall?.[1] as (() => void) | undefined

    expect(sigintHandler).toBeDefined()

    // Fire it twice
    sigintHandler?.()
    sigintHandler?.()

    // process.exit should only be called once due to the `exiting` guard
    expect(exitSpy).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(0)

    exitSpy.mockRestore()
    processOnSpy.mockRestore()
  })
})
