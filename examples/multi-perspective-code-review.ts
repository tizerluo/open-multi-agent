/**
 * Multi-Perspective Code Review
 *
 * Demonstrates:
 * - Dependency chain: generator produces code, three reviewers depend on it
 * - Parallel execution: security, performance, and style reviewers run concurrently
 * - Shared memory: generator writes code, reviewers read it and write feedback,
 *   synthesizer reads all feedback and produces a unified report
 *
 * Flow:
 *   generator → [security-reviewer, performance-reviewer, style-reviewer] (parallel) → synthesizer
 *
 * Run:
 *   npx tsx examples/multi-perspective-code-review.ts
 *
 * Prerequisites:
 *   ANTHROPIC_API_KEY env var must be set.
 */

import { OpenMultiAgent } from '../src/index.js'
import type { AgentConfig, OrchestratorEvent, Task } from '../src/types.js'

// ---------------------------------------------------------------------------
// API spec to implement
// ---------------------------------------------------------------------------

const API_SPEC = `POST /users endpoint that:
- Accepts JSON body with name (string, required), email (string, required), age (number, optional)
- Validates all fields
- Inserts into a PostgreSQL database
- Returns 201 with the created user or 400/500 on error`

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const generator: AgentConfig = {
  name: 'generator',
  model: 'claude-sonnet-4-6',
  systemPrompt: `You are a Node.js backend developer. Given an API spec, write a complete
Express route handler. Include imports, validation, database query, and error handling.
Store the generated code in shared memory under the key "generated_code".
Write only the code, no explanation. Keep it under 80 lines.`,
  maxTurns: 2,
}

const securityReviewer: AgentConfig = {
  name: 'security-reviewer',
  model: 'claude-sonnet-4-6',
  systemPrompt: `You are a security reviewer. Read the code from shared memory key
"generated_code" and check for OWASP top 10 vulnerabilities: SQL injection, XSS,
broken authentication, sensitive data exposure, etc. Write your findings as a
markdown checklist. Store your review in shared memory under "security_review".
Keep it to 150-200 words.`,
  maxTurns: 2,
}

const performanceReviewer: AgentConfig = {
  name: 'performance-reviewer',
  model: 'claude-sonnet-4-6',
  systemPrompt: `You are a performance reviewer. Read the code from shared memory key
"generated_code" and check for N+1 queries, memory leaks, blocking calls, missing
connection pooling, and inefficient patterns. Write your findings as a markdown
checklist. Store your review in shared memory under "performance_review".
Keep it to 150-200 words.`,
  maxTurns: 2,
}

const styleReviewer: AgentConfig = {
  name: 'style-reviewer',
  model: 'claude-sonnet-4-6',
  systemPrompt: `You are a code style reviewer. Read the code from shared memory key
"generated_code" and check naming conventions, function structure, readability,
error message clarity, and consistency. Write your findings as a markdown checklist.
Store your review in shared memory under "style_review".
Keep it to 150-200 words.`,
  maxTurns: 2,
}

const synthesizer: AgentConfig = {
  name: 'synthesizer',
  model: 'claude-sonnet-4-6',
  systemPrompt: `You are a lead engineer synthesizing code review feedback. Read all
reviews from shared memory (security_review, performance_review, style_review) and
the original code (generated_code). Produce a unified report with:

1. Critical issues (must fix before merge)
2. Recommended improvements (should fix)
3. Minor suggestions (nice to have)

Deduplicate overlapping feedback. Keep the report to 200-300 words.`,
  maxTurns: 2,
}

// ---------------------------------------------------------------------------
// Orchestrator + team
// ---------------------------------------------------------------------------

function handleProgress(event: OrchestratorEvent): void {
  if (event.type === 'task:start') {
    console.log(`  [START] ${event.taskTitle} → ${event.agentName}`)
  }
  if (event.type === 'task:complete') {
    console.log(`  [DONE]  ${event.taskTitle} (${event.success ? 'OK' : 'FAIL'})`)
  }
}

const orchestrator = new OpenMultiAgent({
  defaultModel: 'claude-sonnet-4-6',
  onProgress: handleProgress,
})

const team = orchestrator.createTeam('code-review-team', {
  name: 'code-review-team',
  agents: [generator, securityReviewer, performanceReviewer, styleReviewer, synthesizer],
  sharedMemory: true,
})

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const tasks: Task[] = [
  {
    title: 'Generate code',
    description: `Write a Node.js Express route handler for this API spec:\n\n${API_SPEC}\n\nStore the complete code in shared memory as "generated_code".`,
    assignee: 'generator',
  },
  {
    title: 'Security review',
    description: 'Read "generated_code" from shared memory and perform a security review. Store findings in shared memory as "security_review".',
    assignee: 'security-reviewer',
    dependsOn: ['Generate code'],
  },
  {
    title: 'Performance review',
    description: 'Read "generated_code" from shared memory and perform a performance review. Store findings in shared memory as "performance_review".',
    assignee: 'performance-reviewer',
    dependsOn: ['Generate code'],
  },
  {
    title: 'Style review',
    description: 'Read "generated_code" from shared memory and perform a style review. Store findings in shared memory as "style_review".',
    assignee: 'style-reviewer',
    dependsOn: ['Generate code'],
  },
  {
    title: 'Synthesize feedback',
    description: 'Read all reviews (security_review, performance_review, style_review) and the original generated_code from shared memory. Produce a unified, prioritized action item report.',
    assignee: 'synthesizer',
    dependsOn: ['Security review', 'Performance review', 'Style review'],
  },
]

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Multi-Perspective Code Review')
console.log('='.repeat(60))
console.log(`Spec: ${API_SPEC.split('\n')[0]}`)
console.log('Pipeline: generator → 3 reviewers (parallel) → synthesizer')
console.log('='.repeat(60))
console.log()

const result = await orchestrator.runTasks(team, tasks)

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(60))
console.log(`Overall success: ${result.success}`)
console.log(`Tokens — input: ${result.totalTokenUsage.input_tokens}, output: ${result.totalTokenUsage.output_tokens}`)
console.log()

for (const [name, r] of result.agentResults) {
  const icon = r.success ? 'OK  ' : 'FAIL'
  const tokens = `in:${r.tokenUsage.input_tokens} out:${r.tokenUsage.output_tokens}`
  console.log(`  [${icon}] ${name.padEnd(22)} ${tokens}`)
}

const synthResult = result.agentResults.get('synthesizer')
if (synthResult?.success) {
  console.log('\n' + '='.repeat(60))
  console.log('UNIFIED REVIEW REPORT')
  console.log('='.repeat(60))
  console.log()
  console.log(synthResult.output)
}

console.log('\nDone.')
