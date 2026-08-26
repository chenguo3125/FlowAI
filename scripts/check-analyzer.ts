/**
 * Dev sanity check: confirms every misconception rule is reachable from the
 * seeded transcripts, so the demo's headline action always has something to find.
 * Run with `npm run check`.
 */
import { MISCONCEPTION_RULES } from '@/ai/knowledge'
import { mockProvider } from '@/ai/provider'
import { seedCanvas } from '@/data/seed'
import { correctionDigest } from '@/lib/digest'

const { nodes } = seedCanvas()
const userMessages = nodes.flatMap((n) =>
  [...n.data.sessions.flatMap((s) => s.messages), ...n.data.active.messages]
    .filter((m) => m.role === 'user')
    .map((m) => ({ node: n.data.title, content: m.content })),
)

let missing = 0
for (const rule of MISCONCEPTION_RULES) {
  const hit = userMessages.find((m) => rule.pattern.test(m.content))
  if (hit) {
    console.log(`  ok    ${rule.id.padEnd(28)} ← ${hit.node}`)
  } else {
    missing += 1
    console.log(`  MISS  ${rule.id}`)
  }
}

console.log(
  `\n${MISCONCEPTION_RULES.length - missing}/${MISCONCEPTION_RULES.length} rules reachable from ${userMessages.length} seeded learner messages`,
)

// Drill questions quote the misconception back at the learner, so they match
// their own rule. That is why `runAnalyzer` excludes correction nodes — without
// the exclusion, every sweep would breed a fresh node off the previous fix.
const selfMatching = MISCONCEPTION_RULES.filter((r) => r.pattern.test(r.drillQuestion))
console.log(
  `${selfMatching.length}/${MISCONCEPTION_RULES.length} drill questions match their own rule — correction nodes must stay out of the analyzer's scan`,
)

// Once a gap is closed its correction node is deleted. A later sweep must not
// grow it back, which relies on resolved misconceptions staying in the known
// set. Simulate two consecutive runs to prove the second finds nothing.
const targets = nodes
  .filter((n) => n.data.kind !== 'correction')
  .map((n) => ({
    nodeId: n.id,
    nodeTitle: n.data.title,
    messages: [...n.data.sessions.flatMap((s) => s.messages), ...n.data.active.messages],
  }))

const first = await mockProvider.analyze(targets, new Set())
// Mirrors the key format the store derives from `Misconception.id`.
const knownAfterResolve = new Set(first.map((d) => `${d.ruleId}:${d.nodeId}`))
const second = await mockProvider.analyze(targets, knownAfterResolve)

console.log(`\nfirst sweep: ${first.length} gaps · second sweep: ${second.length} gaps`)
if (second.length !== 0) {
  console.log('  FAIL resolved gaps would regenerate their correction nodes')
  process.exit(1)
}
console.log('  ok    closed gaps stay closed across re-runs')

const sample = first[0]!
const digest = correctionDigest(sample.concept, [
  { id: 'a', role: 'user', content: sample.drillQuestion, createdAt: 0 },
  { id: 'b', role: 'assistant', content: sample.drillAnswer, createdAt: 0 },
  { id: 'c', role: 'user', content: 'So what about open addressing?', createdAt: 0 },
])
console.log(`\ndeterministic fallback (used when the LLM call fails):`)
console.log(`  title:   ${digest.title}`)
console.log(`  summary: ${digest.summary}`)

if (missing > 0) process.exit(1)
