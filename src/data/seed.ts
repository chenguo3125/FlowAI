import type { Edge } from '@xyflow/react'

import type { Message, NodeData, Session } from '@/types'
import type { FlowNode } from '@/store/canvasStore'

/**
 * A pre-walked study canvas on CS fundamentals.
 *
 * The archived transcripts deliberately contain nine latent misconceptions that
 * the Misconception Analyzer has not seen yet — running it is what turns nodes
 * amber/red and grows the correction sub-nodes.
 */

const DAY = 86_400_000
const t0 = Date.now() - 9 * DAY

let seq = 0
const nextId = () => `s${(++seq).toString(36)}`

function msg(role: Message['role'], content: string, offset: number): Message {
  return { id: nextId(), role, content, createdAt: t0 + offset }
}

let turn = 0
function thread(pairs: [string, string][]): Message[] {
  return pairs.flatMap(([u, a]) => {
    turn += 1
    return [msg('user', u, turn * 900_000), msg('assistant', a, turn * 900_000 + 60_000)]
  })
}

function closed(title: string, summary: string, messages: Message[], daysAgo: number): Session {
  return {
    id: nextId(),
    title,
    summary,
    messages,
    createdAt: t0,
    closedAt: Date.now() - daysAgo * DAY,
  }
}

function live(messages: Message[] = []): Session {
  return { id: nextId(), title: 'Live thread', summary: '', messages, createdAt: Date.now() }
}

function node(
  id: string,
  x: number,
  y: number,
  title: string,
  gist: string,
  sessions: Session[],
  active: Session,
): FlowNode {
  const hasHistory = sessions.length > 0 || active.messages.length > 0
  const data: NodeData = {
    title,
    gist,
    kind: 'topic',
    status: hasHistory ? 'solid' : 'unexplored',
    sessions,
    active,
    expandedSessions: [],
    createdAt: t0,
  }
  return { id, type: 'topic', position: { x, y }, data }
}

export function seedCanvas() {
  seq = 0
  turn = 0

  const nodes: FlowNode[] = [
    node(
      'hub',
      0,
      360,
      'Algorithms & Complexity',
      'Unit hub. Everything below hangs off cost analysis.',
      [
        closed(
          'What the whole unit is actually about',
          '2 questions on scoping the unit. Established that every topic below is a claim about cost under growth. Left open: which structure to reach for by default.',
          thread([
            [
              'I have a midterm on data structures and algorithms in two weeks. What is the through-line here?',
              'Almost everything in this unit is one question wearing different clothes: **what does this operation cost as the input grows?**\n\nData structures are bets about which operations you want cheap. Algorithms are strategies for reducing a problem to a smaller version of itself. Complexity analysis is the shared language for pricing both.\n\nIf you can price an operation and justify the price, you can usually reconstruct the rest.',
            ],
            [
              'So what should I actually be able to do by exam day?',
              'Four things, in order of how often they are tested:\n\n1. Derive the complexity of code you have never seen, by counting how often the innermost statement runs.\n2. Choose a structure given a described workload, and defend the choice.\n3. State the worst case, not just the typical case — this is where most marks are lost.\n4. Recognise when a precondition (sorted, unweighted, balanced) is doing load-bearing work.',
            ],
          ]),
          8,
        ),
      ],
      live(),
    ),

    node(
      'bigo',
      420,
      40,
      'Big-O Notation',
      'Growth rates, dropping constants, worst vs average.',
      [
        closed(
          'Why constants get dropped',
          '3 questions on Big-O. Worked from counting operations to why O(3n+50) collapses to O(n). Left open: is O(n log n) always better than O(n²)?',
          thread([
            [
              'Why do we drop the constants in Big-O? O(3n) and O(n) are obviously different amounts of work.',
              'They are different amounts of work, but Big-O is not measuring the amount of work — it is measuring the *shape* of the growth.\n\nPick any constant c. For large enough n, an O(n) algorithm with a terrible constant still beats an O(n²) one with a great constant, because n² outgrows any multiple of n. Since the classification exists to predict behaviour under growth, constants get discarded as noise.',
            ],
            [
              'How do I get the complexity of a nested loop?',
              'Count how many times the innermost statement runs, as a function of n.\n\nTwo loops each running n times, nested → n × n = O(n²). If the inner loop runs to `i` instead of `n`, the total is 1+2+…+n = n(n+1)/2, which is still O(n²). If the inner loop halves its range each pass, it contributes log n, so the pair is O(n log n).\n\nIgnore line count entirely and follow the innermost statement.',
            ],
            [
              'Okay so a lower Big-O always means the program runs faster, right? That is the point of it.',
              'That is the usual takeaway, and for large inputs it holds up well — asymptotically dominant terms decide the outcome once n is big enough.\n\nSorting at O(n log n) will beat a bubble sort at O(n²) on any serious dataset, and that is normally the comparison you care about when you are choosing between two approaches.',
            ],
          ]),
          6,
        ),
      ],
      live([
        msg(
          'user',
          'One more: is O(n log n) always faster than O(n²) even for tiny inputs?',
          40 * 900_000,
        ),
        msg(
          'assistant',
          'For tiny inputs the ordering can invert, because the constants Big-O discards are exactly what dominates when n is small.\n\nThis is why production sort implementations switch to insertion sort below roughly 16–32 elements: O(n²) with a tight cache-friendly inner loop beats O(n log n) with partitioning overhead at that size.',
          40 * 900_000 + 60_000,
        ),
      ]),
    ),

    node(
      'hash',
      880,
      -120,
      'Hash Tables',
      'Hashing, collisions, load factor, resize.',
      [
        closed(
          'Hashing and collision handling',
          '2 questions on hash tables. Covered hashing to a bucket index and chaining. Left open: what happens when every key collides.',
          thread([
            [
              'How does a hash table get O(1) lookup? It feels like cheating.',
              'It converts the key into an array index. You hash the key to a number, take it modulo the bucket count, and index straight into the array — no searching involved.\n\nThe cost is that two keys can land in the same bucket. Chaining keeps a small list per bucket; open addressing probes forward for a free slot. Either way you compare against a handful of entries rather than n.',
            ],
            [
              'So hash tables are basically always O(1) for lookup, I can treat it as constant no matter what the data looks like',
              'For everyday use that is a reasonable working assumption — with a decent hash function and a sensible load factor, lookups really do behave like constant time, and that is why dictionaries are the default tool for membership and keyed access in most languages.',
            ],
          ]),
          5,
        ),
      ],
      live(),
    ),

    node(
      'lists',
      880,
      280,
      'Arrays vs Linked Lists',
      'Contiguous memory, indexing, insertion cost.',
      [
        closed(
          'Which one for a queue of jobs',
          '2 questions on arrays versus linked lists. Compared indexing against insertion. Left open: how cache locality changes the answer.',
          thread([
            [
              'I need a structure for a job queue that gets appends at the end and pops from the front. Array or linked list?',
              'A linked list with head and tail pointers gives O(1) at both ends cleanly. A plain array is O(1) to append but O(n) to pop from the front, since everything shifts.\n\nThe usual production answer is neither: a **ring buffer** (circular array) gives O(1) at both ends with array cache behaviour, which is what most standard-library deques actually are.',
            ],
            [
              'Got it. And linked lists give constant time access by index too, do they not? Since following pointers is cheap.',
              'Following a single pointer is indeed very cheap — it is one memory dereference, and the per-hop cost is small enough that people often reason about linked structures as if traversal were free.\n\nThat intuition is why linked lists feel fast in small examples, where the whole list sits in cache anyway.',
            ],
          ]),
          5,
        ),
      ],
      live(),
    ),

    node(
      'recursion',
      420,
      520,
      'Recursion',
      'Base cases, call stack, depth budget.',
      [
        closed(
          'Base cases and trusting the recursion',
          '2 questions on recursion. Established the base case plus shrinking step pattern. Left open: recursion versus iteration cost.',
          thread([
            [
              'I keep writing infinite recursion. How do I know my base case is right?',
              'Check two properties independently.\n\n**Termination:** every recursive call must move strictly closer to the base case. If a branch can call itself with an unchanged argument, it will loop forever.\n\n**Coverage:** the base case must catch every input the recursion can actually reach — including the empty and negative cases, which is where the bugs hide.\n\nOnce both hold, correctness follows by induction and you can stop tracing the tree by hand.',
            ],
            [
              'I read that recursion is more efficient than iteration because the compiler optimizes it away. Is that the general rule?',
              'Compilers can do real work here — tail-call optimisation lets a recursive call reuse the current frame instead of pushing a new one, so some recursive functions compile down to something loop-shaped.\n\nRecursive code also tends to be shorter and closer to the mathematical definition, which is a genuine advantage when you are reasoning about correctness.',
            ],
          ]),
          4,
        ),
      ],
      live(),
    ),

    node(
      'bsearch',
      420,
      940,
      'Binary Search',
      'Halving a sorted range; the invariant.',
      [
        closed(
          'Getting the midpoint right',
          '2 questions on binary search. Covered the halving argument and the loop invariant. Left open: what the sortedness precondition is doing.',
          thread([
            [
              'Why is binary search O(log n)? I want the actual argument, not just "it halves".',
              'Ask how many halvings it takes to reduce n candidates to 1. After k steps the range has size n/2ᵏ, and you stop when n/2ᵏ = 1, so k = log₂ n.\n\nThat is the whole proof. A million elements needs about 20 comparisons, a billion about 30 — which is why log n is effectively "free" at any realistic scale.',
            ],
            [
              'Can I just run binary search on any array to find something fast? It seems strictly better than scanning.',
              'It is dramatically faster than scanning when it applies — 20 comparisons against a million, as above — so reaching for it first is a good instinct when lookup performance matters.\n\nThe implementation is also short enough to write from memory once you have the invariant straight: keep the target inside `[lo, hi]` and make sure every branch shrinks the range.',
            ],
          ]),
          3,
        ),
      ],
      live(),
    ),

    node(
      'sorting',
      880,
      1080,
      'Sorting Algorithms',
      'Merge, quick, heap; stability and pivots.',
      [
        closed(
          'Picking a sort for the assignment',
          '2 questions on sorting. Compared merge, quick and heap sort on space and stability. Left open: quicksort worst case.',
          thread([
            [
              'Merge sort versus quicksort — which should I use for the assignment?',
              'They sit at the same asymptotic bound with opposite trade-offs.\n\n**Merge sort:** Θ(n log n) guaranteed, stable, but needs O(n) auxiliary space.\n**Quicksort:** in-place, best constants in practice, and the fastest of the two on typical data.\n\nIf the spec mentions stability or guaranteed bounds, merge sort. If it mentions memory limits or raw speed, quicksort.',
            ],
            [
              'Then I will use quicksort — it is always O(n log n) and in-place, so I should just default to it everywhere.',
              'It is a very sensible default, and it is what most standard libraries reach for. In-place operation plus low constant factors makes it hard to beat on general-purpose data.\n\nMost of the tuning you will see in real implementations is about pivot selection, which is worth a look if you want to understand why library sorts are structured the way they are.',
            ],
          ]),
          3,
        ),
      ],
      live(),
    ),

    node(
      'trees',
      1340,
      320,
      'Trees & BSTs',
      'Ordering invariant, height, balancing.',
      [
        closed(
          'BST versus hash map for a lookup table',
          '2 questions on BSTs. Covered the ordering invariant and in-order traversal. Left open: what guarantees the height stays logarithmic.',
          thread([
            [
              'When would I use a BST instead of a hash map? The hash map seems better on paper.',
              'When you need **order**. Hash tables answer "is this key present" and nothing else; a BST additionally answers:\n\n- give me all keys between x and y (range query)\n- give me the next key above x (successor)\n- iterate everything in sorted order\n\nEach of those is O(log n) on a BST and requires a full sort on a hash table.',
            ],
            [
              'Right. And a BST always gives log n search, so it beats a list for anything sorted.',
              'The descent certainly looks like that: at each node you compare once and discard an entire subtree, so you are cutting the search space aggressively rather than stepping one element at a time like a list scan.\n\nThat discard-a-subtree step is the core intuition worth keeping.',
            ],
          ]),
          2,
        ),
      ],
      live(),
    ),

    node(
      'graphs',
      1340,
      760,
      'Graph Traversal',
      'BFS/DFS frontiers, visited sets, weights.',
      [
        closed(
          'BFS and DFS on the route planner',
          '2 questions on traversal. Covered queue versus stack and the visited set. Left open: whether BFS survives edge weights.',
          thread([
            [
              'What is the real difference between BFS and DFS? They look like the same code to me.',
              'They *are* the same code with one substitution. Both pull a node from a frontier, mark it visited, and push its unvisited neighbours.\n\nBFS uses a **queue**, so it drains the frontier in arrival order and sweeps outward by distance. DFS uses a **stack**, so it takes the most recently discovered node and dives. Swap the container and the behaviour flips completely.',
            ],
            [
              'For my project I will use BFS to get the shortest path in the weighted road network between two cities.',
              'BFS is a natural fit for shortest-path work — it explores outward in layers, so the first time it reaches the destination it has done so in the fewest steps, and the O(V + E) cost is about as cheap as traversal gets.\n\nYou will want a `prev` map alongside the visited set so you can reconstruct the actual route once the target is reached.',
            ],
          ]),
          1,
        ),
      ],
      live(),
    ),

    node(
      'dp',
      880,
      680,
      'Dynamic Programming',
      'Overlapping subproblems, memo vs table.',
      [
        closed(
          'Recognising a DP problem',
          '2 questions on dynamic programming. Covered overlapping subproblems and state definition. Left open: memoisation versus tabulation.',
          thread([
            [
              'How do I recognise that a problem wants dynamic programming?',
              'Look for two properties together.\n\n**Overlapping subproblems** — the naive recursion solves the same input repeatedly. **Optimal substructure** — the best answer is assembled from best answers to smaller instances.\n\nIf only the second holds and a locally best choice is provably safe, greedy is enough and cheaper. If both hold, you need DP.',
            ],
            [
              'And memoization is the same as tabulation, just written differently, so it does not matter which I pick?',
              'They do compute the same set of values, and for most textbook problems either one earns full marks — the recurrence is the part that carries the insight.\n\nMemoisation is usually the easier one to write, since it is a direct transcription of the recursive definition with a cache bolted on.',
            ],
          ]),
          2,
        ),
      ],
      live(),
    ),

    node(
      'amortized',
      0,
      760,
      'Amortized Analysis',
      'Not started — queued after the midterm review.',
      [],
      live(),
    ),
  ]

  // 'across' uses the side handles; the two vertical links use top/bottom.
  const links: [string, string, 'across' | 'down'][] = [
    ['hub', 'bigo', 'across'],
    ['hub', 'recursion', 'across'],
    ['hub', 'bsearch', 'across'],
    ['hub', 'amortized', 'down'],
    ['bigo', 'hash', 'across'],
    ['bigo', 'lists', 'across'],
    ['recursion', 'dp', 'across'],
    ['bsearch', 'sorting', 'across'],
    ['lists', 'trees', 'across'],
    ['trees', 'graphs', 'down'],
  ]

  const edges: Edge[] = links.map(([source, target, orientation]) => ({
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    ...(orientation === 'across' ? { sourceHandle: 'r', targetHandle: 'l' } : {}),
  }))

  return {
    nodes,
    edges,
    selectedNodeId: 'hash' as string | null,
    misconceptions: [],
    lastRun: null,
  }
}
