/**
 * Dev sanity check: confirms every misconception rule is reachable from the
 * seeded transcripts, so the demo's headline action always has something to find.
 * Run with `npm run check`.
 */
import { cosine, ngramVector } from '@/ai/embedder'
import { MISCONCEPTION_RULES } from '@/ai/knowledge'
import { analyzeCanvas } from '@/ai/llm/analyze'
import { claimText } from '@/ai/llm/tier1'
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

const selfMatching = MISCONCEPTION_RULES.filter((r) => r.pattern.test(r.drillQuestion))
console.log(
  `${selfMatching.length}/${MISCONCEPTION_RULES.length} drill questions match their own rule — correction nodes must stay out of the analyzer's scan`,
)

const targets = nodes
  .filter((n) => n.data.kind !== 'correction')
  .map((n) => ({
    nodeId: n.id,
    nodeTitle: n.data.title,
    messages: [...n.data.sessions.flatMap((s) => s.messages), ...n.data.active.messages],
  }))

const first = await mockProvider.analyze(targets, new Set())
const knownAfterResolve = new Set(first.map((d) => `${d.ruleId}:${d.nodeId}`))
const second = await mockProvider.analyze(targets, knownAfterResolve)

console.log(`\nregex sweep: ${first.length} gaps · second sweep: ${second.length} gaps`)
if (second.length !== 0) {
  console.log('  FAIL resolved gaps would regenerate their correction nodes')
  process.exit(1)
}
console.log('  ok    closed gaps stay closed across re-runs')

const embedded = await analyzeCanvas(targets, new Set())
const embeddedIds = new Set(embedded.map((d) => d.ruleId))
let embedMiss = 0
for (const rule of MISCONCEPTION_RULES) {
  if (embeddedIds.has(rule.id)) {
    console.log(`  ok    embed ${rule.id}`)
  } else {
    embedMiss += 1
    console.log(`  MISS  embed ${rule.id}`)
  }
}
console.log(
  `embedding pipeline (ngram in Node): ${embedded.length}/${MISCONCEPTION_RULES.length} seed gaps`,
)

const closed = await analyzeCanvas(targets, knownAfterResolve)
if (closed.length !== 0) {
  console.log('  FAIL embedding pipeline reopened closed gaps')
  process.exit(1)
}
console.log('  ok    embedding pipeline also keeps closed gaps closed')

const sampleBelief = MISCONCEPTION_RULES[0]!
const paraphrase =
  'I think looking something up in a hash table is always O(1) no matter what keys you throw at it'
const sim = cosine(ngramVector(claimText(sampleBelief)), ngramVector(paraphrase))
console.log(`\nngram cosine (paraphrase of ${sampleBelief.id}): ${sim.toFixed(3)}`)
if (sim < 0.38) {
  console.log('  FAIL paraphrase scored below the Tier 1 candidate floor')
  process.exit(1)
}
console.log('  ok    paraphrase is a Tier 1 candidate (confirmation waits on MiniLM or the LLM judge)')

const sample = first[0]!
const digest = correctionDigest(sample.concept, [
  { id: 'a', role: 'user', content: sample.drillQuestion, createdAt: 0 },
  { id: 'b', role: 'assistant', content: sample.drillAnswer, createdAt: 0 },
  { id: 'c', role: 'user', content: 'So what about open addressing?', createdAt: 0 },
])
console.log(`\ndeterministic fallback (used when the LLM call fails):`)
console.log(`  title:   ${digest.title}`)
console.log(`  summary: ${digest.summary}`)

if (missing > 0 || embedMiss > 0) process.exit(1)
