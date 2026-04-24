import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { renderStreamEvent } from '../../cli/lib/stream-renderer.js'
import type { StreamEvent, ToolUseBlock, ToolResultBlock } from '../../src/types.js'

// Spy on process.stdout.write — do NOT replace the whole process object
const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
beforeEach(() => writeSpy.mockClear())
afterAll(() => writeSpy.mockRestore())

describe('renderStreamEvent', () => {
  it('text event — writes data directly to stdout', () => {
    const event: StreamEvent = { type: 'text', data: 'hello world' }
    renderStreamEvent(event)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    expect(writeSpy).toHaveBeenCalledWith('hello world')
  })

  it('tool_use event with short input — writes [tool: name] and JSON input', () => {
    const block: ToolUseBlock = {
      type: 'tool_use',
      id: 'tu-1',
      name: 'bash',
      input: { cmd: 'ls' },
    }
    const event: StreamEvent = { type: 'tool_use', data: block }
    renderStreamEvent(event)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const output = writeSpy.mock.calls[0][0] as string
    expect(output).toContain('[tool: bash]')
    expect(output).toContain('{"cmd":"ls"}')
  })

  it('tool_use event with long input — truncates JSON at 80 chars with ellipsis', () => {
    // Build an input whose JSON serialization is longer than 80 characters
    const block: ToolUseBlock = {
      type: 'tool_use',
      id: 'tu-2',
      name: 'bash',
      input: {
        cmd: 'find /very/long/path/that/makes/the/json/exceed/eighty/characters -type f -name "*.ts"',
      },
    }
    const event: StreamEvent = { type: 'tool_use', data: block }
    renderStreamEvent(event)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const output = writeSpy.mock.calls[0][0] as string
    // The JSON preview part should end with the ellipsis character
    expect(output).toContain('…')
    // The raw JSON is longer than 80 chars, so the truncated portion must be exactly 80 chars + '…'
    const jsonPreview = JSON.stringify(block.input)
    expect(jsonPreview.length).toBeGreaterThan(80)
    expect(output).toContain(jsonPreview.slice(0, 80) + '…')
  })

  it('tool_result with 1-line content — output contains "→ done (1 line)"', () => {
    const block: ToolResultBlock = {
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: 'ok',
      is_error: false,
    }
    const event: StreamEvent = { type: 'tool_result', data: block }
    renderStreamEvent(event)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const output = writeSpy.mock.calls[0][0] as string
    expect(output).toContain('→ done (1 line)')
  })

  it('tool_result with 3-line content — output contains "→ done (3 lines)"', () => {
    const block: ToolResultBlock = {
      type: 'tool_result',
      tool_use_id: 'tu-2',
      content: 'a\nb\nc',
      is_error: false,
    }
    const event: StreamEvent = { type: 'tool_result', data: block }
    renderStreamEvent(event)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const output = writeSpy.mock.calls[0][0] as string
    expect(output).toContain('→ done (3 lines)')
  })

  it('tool_result error — output contains "→ error"', () => {
    const block: ToolResultBlock = {
      type: 'tool_result',
      tool_use_id: 'tu-3',
      content: 'something went wrong',
      is_error: true,
    }
    const event: StreamEvent = { type: 'tool_result', data: block }
    renderStreamEvent(event)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const output = writeSpy.mock.calls[0][0] as string
    expect(output).toContain('→ error')
  })

  it('done event — write is NOT called', () => {
    const event: StreamEvent = { type: 'done', data: {} }
    renderStreamEvent(event)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('error event — write is NOT called', () => {
    const event: StreamEvent = { type: 'error', data: new Error('x') }
    renderStreamEvent(event)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('loop_detected event — write is NOT called', () => {
    const event: StreamEvent = { type: 'loop_detected', data: null }
    renderStreamEvent(event)
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
