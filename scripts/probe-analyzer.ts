/**
 * Analyzer probe: pushes single learner turns through the real Tier 0/1/2 path
 * and reports which gate each one dies at.
 *
 * `check-analyzer.ts` asks "can the seeded demo still find its gaps". This asks
 * the opposite and more useful question: given an arbitrary sentence on an
 * arbitrary node, what does the analyzer actually do with it, and why. Run with
 * `npm run probe`.
 *
 * Two things this cannot show. Node has no MiniLM, so every cosine below is the
 * hashed n-gram backend — lexical overlap rather than meaning, so treat the
 * numbers as a floor on the browser's recall. And there is no API key here, so
 * mining and the LLM judge are both reported as "would run" rather than run.
 */
import { allClaims, resetClaimsForTest, scopeToTopic } from '@/ai/claims'
import { cosine, ngramVector } from '@/ai/embedder'
import { heuristicConfirm } from '@/ai/llm/heuristic'
import { worthMining } from '@/ai/llm/mine'
import { candidatesFor, claimText, isLeadingQuestion } from '@/ai/llm/tier1'
import type { Message } from '@/types'

/** Mirrors the private constants in tier1.ts / heuristic.ts, for reporting only. */
const SIMILARITY_FLOOR = 0.38
const MIN_CHARS = 16
const HEURISTIC_FLOOR = 0.58

/**
 * Expectations deliberately assert Tier 1's nomination rather than Tier 2's
 * verdict. Tier 1 is deterministic and identical in both environments; Tier 2 is
 * either the LLM judge or the MiniLM-gated heuristic, neither of which exists
 * here. Severity is asserted only when the heuristic does reach a decision.
 */
interface Probe {
  node: string
  prompt: string
  /** Claim Tier 1 must nominate, or null for "nominate nothing". */
  candidate: string | null
  /** Severity the finding must carry, checked only if Tier 2 confirms locally. */
  severity?: 'high' | 'medium'
  /** Whether this node should reach the mining step. */
  mines?: boolean
  note: string
}

const PROBES: Probe[] = [
  {
    node: 'A* Search',
    prompt: 'So A* search only works on trees?',
    candidate: null,
    mines: true,
    note: 'the reported case — no claim covers A*, so mining is the only route',
  },
  {
    node: 'Graph Traversal',
    prompt: 'So BFS always finds the shortest path in any graph?',
    candidate: 'bfs-weighted',
    severity: 'medium',
    note: 'leading question on a curated claim — shaky, not a gap',
  },
  {
    node: 'Graph Traversal',
    prompt: 'BFS gives the shortest path even when the edges have different weights.',
    candidate: 'bfs-weighted',
    note: 'paraphrase, no regex — candidate only, confirmation needs MiniLM or the judge',
  },
  {
    node: 'Hash Tables',
    prompt: 'Hash table lookup is always O(1) no matter what keys you use.',
    candidate: 'hash-always-o1',
    severity: 'high',
    note: 'regex baseline — flat assertion stays a full gap',
  },
  {
    node: 'Trees & BSTs',
    prompt: 'Is a BST always log n?',
    candidate: 'bst-always-logn',
    severity: 'medium',
    note: 'short leading question — used to die under MIN_CHARS',
  },
  {
    node: 'Graph Traversal',
    prompt: 'Dijkstra is just BFS with a priority queue, right?',
    candidate: null,
    mines: true,
    note: 'correct statement — no flag; graphs has one claim, so the shelf is thin',
  },
  {
    node: 'Graph Traversal',
    prompt: 'How does A* choose which node to expand next?',
    candidate: null,
    mines: true,
    note: 'open question, no embedded claim — no flag',
  },
  {
    node: 'Hash Tables',
    prompt: 'ok that makes sense, thanks',
    candidate: null,
    note: 'acknowledgement — no flag, and not worth a mining spend',
  },
]

const msg = (content: string): Message => ({
  id: 'probe-1',
  role: 'user',
  content,
  createdAt: Date.now(),
})

resetClaimsForTest()
const library = await allClaims()

console.log(`claim library: ${library.length} claims (all curated — nothing mined in Node)`)
console.log(`  ${library.map((r) => r.id).join(', ')}\n`)

let wrong = 0

for (const probe of PROBES) {
  const message = msg(probe.prompt)
  console.log('─'.repeat(78))
  console.log(`[${probe.node}] "${probe.prompt}"`)
  const wants = [
    probe.candidate ? `nominate ${probe.candidate}` : 'nominate nothing',
    probe.severity ? `severity ${probe.severity}` : '',
    probe.mines ? 'reach mining' : '',
  ].filter(Boolean)
  console.log(`  want: ${wants.join(', ')}  ·  ${probe.note}`)

  const scope = scopeToTopic(library, probe.node, [message])
  console.log(
    `  tier 0 scope: ${scope.claims.length}/${library.length} claims${
      scope.matched
        ? ` → ${scope.claims.map((c) => c.id).join(', ')}`
        : ' (no claim belongs to this topic — full library as fallback)'
    }`,
  )

  const length = probe.prompt.trim().length
  if (length < MIN_CHARS) {
    console.log(`  GATE  length ${length} < MIN_CHARS ${MIN_CHARS} — never reaches Tier 1`)
    if (probe.candidate !== null) wrong += 1
    continue
  }

  console.log(`  leading question: ${isLeadingQuestion(probe.prompt) ? 'yes → shaky' : 'no'}`)

  const promptVector = ngramVector(probe.prompt)
  const ranked = scope.claims
    .map((rule) => ({ id: rule.id, sim: cosine(promptVector, ngramVector(claimText(rule))) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
  console.log(
    `  cosine top 3: ${ranked
      .map((r) => `${r.id} ${r.sim.toFixed(3)}${r.sim >= SIMILARITY_FLOOR ? '*' : ''}`)
      .join('  ')}`,
  )

  const candidates = await candidatesFor([message], scope.claims)
  const candidateIds = candidates.map((c) => c.rule.id)
  console.log(
    `  tier 1 → ${candidates.length} candidate(s): ${
      candidates.map((c) => `${c.rule.id}${c.viaRegex ? '(regex)' : ''}`).join(', ') || '—'
    }`,
  )

  let mines = false
  if (candidates.length === 0) {
    mines = worthMining([message], scope)
    console.log(
      `  tier 1½ → ${
        mines
          ? 'would mine this topic once (needs a key; skipped in Node)'
          : 'no mining: shelf already stocked, or too little learner text'
      }`,
    )
  }

  const confirmed = heuristicConfirm('probe-node', candidates)
  console.log(
    `  tier 2 (heuristic) → ${
      confirmed.map((d) => `${d.ruleId}/${d.severity}`).join(', ') ||
      (candidates.length > 0 ? 'held for the judge (no MiniLM in Node)' : 'nothing flagged')
    }`,
  )

  const problems: string[] = []
  if (probe.candidate === null) {
    if (candidateIds.length > 0) problems.push(`nominated ${candidateIds.join(', ')}`)
  } else if (!candidateIds.includes(probe.candidate)) {
    problems.push(`did not nominate ${probe.candidate}`)
  }
  if (probe.severity) {
    const got = confirmed.find((d) => d.ruleId === probe.candidate)?.severity
    if (got !== probe.severity) problems.push(`severity ${got ?? 'none'}, wanted ${probe.severity}`)
  }
  if (mines !== Boolean(probe.mines)) {
    problems.push(mines ? 'mined unexpectedly' : 'should have reached mining')
  }

  if (problems.length === 0) {
    console.log('  ok')
  } else {
    wrong += 1
    console.log(`  MISS  ${problems.join('; ')}`)
  }
}

console.log('─'.repeat(78))
console.log(`\n${PROBES.length - wrong}/${PROBES.length} probes behaved as intended`)
console.log(
  `floors in play: tier 1 cosine ≥ ${SIMILARITY_FLOOR} and median+0.08, heuristic confirm ≥ ${HEURISTIC_FLOOR} (MiniLM only), min ${MIN_CHARS} chars`,
)

if (wrong > 0) process.exit(1)
