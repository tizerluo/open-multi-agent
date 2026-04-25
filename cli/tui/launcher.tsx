import React from 'react'
import { render } from 'ink'
import { App } from './App.js'
import { dispatch } from './bridge.js'
import { OpenMultiAgent } from '../../src/index.js'
import { writeHistory } from '../lib/history.js'
import type { AgentConfig } from '../../src/types.js'

export interface TuiLaunchOpts {
  goal: string
  agentConfigs: AgentConfig[]
  provider: string
  model: string
  apiKey: string
  baseURL?: string
  startTime: number
}

export async function launchTui(opts: TuiLaunchOpts): Promise<void> {
  const { goal, agentConfigs, provider, model, apiKey, baseURL, startTime } = opts
  const agentNames = agentConfigs.map(a => a.name)

  const { waitUntilExit } = render(<App goal={goal} agentNames={agentNames} />)

  const orchestrator = new OpenMultiAgent({
    defaultModel: model,
    defaultProvider: provider as 'anthropic' | 'openai' | 'gemini' | 'grok' | 'copilot',
    defaultApiKey: apiKey,
    defaultBaseURL: baseURL,
    onAgentStream: (agentName, event) => dispatch({ type: 'AGENT_STREAM', agentName, event }),
    onProgress: (event) => dispatch({ type: 'PROGRESS', event }),
  })

  const team = orchestrator.createTeam('oma-tui-team', {
    name: 'oma-tui-team',
    agents: agentConfigs,
    sharedMemory: true,
  })

  orchestrator.runTeam(team, goal)
    .then(async (result) => {
      dispatch({ type: 'DONE' })
      const coordinatorResult = result.agentResults.get('coordinator')
      const finalOutput = coordinatorResult?.output ?? ''
      await writeHistory({
        mode: 'run',
        goal,
        provider,
        model,
        agents: agentNames,
        output: finalOutput,
        tokenUsage: result.totalTokenUsage,
        durationMs: Date.now() - startTime,
        success: result.success,
      }).catch(() => {})
    })
    .catch((err: unknown) => {
      dispatch({ type: 'ERROR', message: err instanceof Error ? err.message : String(err) })
    })

  await waitUntilExit()
}
