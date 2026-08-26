/**
 * Canned domain knowledge for the CS-fundamentals demo.
 *
 * The mock provider matches learner text against `triggers` to pick a reply,
 * and against `MISCONCEPTION_RULES` to populate the Mistake Graph. Swapping in
 * a real model means replacing `src/ai/provider.ts` — nothing here is imported
 * by the UI directly.
 */

export interface TopicEntry {
  id: string
  label: string
  triggers: RegExp[]
  /** Opening explanation when a learner lands on this topic cold. */
  overview: string
  /** Follow-up angles, cycled through so repeated questions don't repeat text. */
  depth: string[]
  /** Suggested next questions surfaced under the composer. */
  prompts: string[]
}

export const TOPICS: TopicEntry[] = [
  {
    id: 'big-o',
    label: 'Big-O Notation',
    triggers: [/big[- ]?o/i, /asymptotic/i, /time complexity/i, /growth rate/i],
    overview:
      'Big-O describes how the *cost* of an algorithm grows as the input grows — it is a statement about shape, not about seconds.\n\nWhen we say search is O(n), we mean: double the input, roughly double the work. Constants and lower-order terms are dropped because they stop mattering as n gets large. O(3n + 50) and O(n) are the same claim.\n\nThe practical use is comparison: it tells you which algorithm wins *eventually*, and how badly it degrades under growth.',
    depth: [
      'Worth separating the three bounds people conflate:\n\n- **O(f)** — upper bound, "grows no faster than".\n- **Ω(f)** — lower bound, "grows no slower than".\n- **Θ(f)** — both, "grows exactly like".\n\nCasual usage says "O" but usually means Θ. That is fine in conversation, but it hides real cases: quicksort is O(n²) *and* Θ(n log n) on average, and both facts matter when you pick it.',
      'The step that trips people is counting the dominant operation rather than lines of code.\n\nA nested loop over the same collection is n × n → O(n²). A loop that halves its range each pass is O(log n). A loop that halves the range but does linear work each pass is O(n log n).\n\nAsk: how many times does the *innermost* statement run, as a function of n?',
      'Where the abstraction leaks: an O(n) scan over a contiguous array frequently beats an O(log n) walk through a pointer-chasing tree at small n, because cache locality is a constant factor and Big-O deliberately throws constant factors away.\n\nSo Big-O answers "how does this scale", not "which is faster on my machine for my n". You need both questions.',
    ],
    prompts: [
      'Why do we drop constants in Big-O?',
      'Is O(n log n) always better than O(n²)?',
      'How do I find the complexity of a nested loop?',
    ],
  },
  {
    id: 'recursion',
    label: 'Recursion',
    triggers: [/recursi/i, /base case/i, /call stack/i, /stack overflow/i],
    overview:
      'A recursive function solves a problem by calling itself on a strictly smaller version of the same problem.\n\nTwo parts are mandatory:\n1. **Base case** — an input small enough to answer outright, with no further call.\n2. **Recursive step** — reduce the input, then trust the function to handle the remainder.\n\nThat second word, *trust*, is the actual skill. You do not trace the whole tree in your head; you verify one level is correct and that the input shrinks toward the base case.',
    depth: [
      "Each pending call occupies a frame on the call stack holding its own parameters and locals. That is why recursion has O(depth) space cost that the iterative version usually does not.\n\nRecursing 10⁶ deep overflows the stack in most runtimes. Recursing log n deep — as in binary search or balanced-tree descent — is completely safe. Depth, not the presence of recursion, is what you budget for.",
      'Naive recursion can be catastrophically redundant. `fib(n) = fib(n-1) + fib(n-2)` recomputes `fib(30)` millions of times, giving O(2ⁿ).\n\nMemoising the results collapses it to O(n) because each distinct subproblem is solved once. The recursion was never the problem — the *overlapping subproblems* were.',
      'Tail recursion is the case where the recursive call is the very last action, so the current frame has nothing left to do and can be reused.\n\nScheme and Lua guarantee this optimisation; Python and JavaScript engines generally do not. So "rewrite it as tail recursion for O(1) space" is language-dependent advice, not universal.',
    ],
    prompts: [
      'Is recursion slower than a loop?',
      'When does recursion cause stack overflow?',
      'How is recursion related to dynamic programming?',
    ],
  },
  {
    id: 'arrays-lists',
    label: 'Arrays vs Linked Lists',
    triggers: [/linked list/i, /array/i, /contiguous/i, /dynamic array/i],
    overview:
      'Arrays store elements in one contiguous block, so element i lives at a computable address: indexing is O(1).\n\nLinked lists store each element in its own node holding a pointer to the next, so reaching element i means walking i pointers: indexing is O(n).\n\nThe trade flips for structural edits. Inserting mid-array shifts every later element, O(n). Inserting into a linked list, *given the node*, is O(1) pointer rewiring.',
    depth: [
      'The subtlety in "linked list insertion is O(1)": that is true only once you already hold a reference to the position. If you have to *find* it first, the search is O(n) and dominates. Benchmarks that ignore the search step flatter linked lists unfairly.',
      "Dynamic arrays (Python `list`, Java `ArrayList`, C++ `vector`) grow by allocating a larger block and copying. Any single append can therefore be O(n).\n\nBut because capacity doubles, the copies are rare enough that appending is O(1) *amortized* — n appends cost O(n) total. Amortized is a real guarantee about the sequence, not a hopeful average.",
      'Hardware makes the asymptotic story misleading in practice. Arrays are prefetch-friendly and cache-resident; linked lists scatter nodes across the heap and pay a cache miss per hop.\n\nThis is why real codebases reach for arrays by default and linked lists rarely — the constant factor is often 10× or worse.',
    ],
    prompts: [
      'Why is appending to a dynamic array O(1) amortized?',
      'When is a linked list actually the right choice?',
      'How does cache locality change the comparison?',
    ],
  },
  {
    id: 'hash-tables',
    label: 'Hash Tables',
    triggers: [/hash ?(table|map|set)/i, /dictionary/i, /collision/i, /load factor/i],
    overview:
      'A hash table turns a key into an array index by hashing it, giving expected O(1) lookup, insert, and delete.\n\nTwo keys can hash to the same slot — a collision — resolved either by chaining (a list per bucket) or open addressing (probe for the next free slot).\n\nThe O(1) claim is an *average* over a good hash function and a bounded load factor. It is not a worst-case guarantee.',
    depth: [
      'Worst case is O(n). If every key collides — a degenerate hash, or adversarial input chosen to collide — the table degrades to a linear scan of one bucket.\n\nThis is a real attack class (hash-flooding DoS), which is why modern runtimes randomise their hash seed per process. Java 8+ additionally converts long buckets into red-black trees, capping the worst case at O(log n).',
      'Load factor α = entries / buckets governs performance. As α approaches 1, collisions dominate, so tables resize (typically doubling) once α crosses a threshold like 0.75.\n\nThat resize rehashes everything: a single O(n) operation, amortized O(1) across inserts. Same amortization argument as the dynamic array.',
      'Hash tables give you no ordering. Iteration order is unspecified and can change across resizes or runs.\n\nIf you need ordered traversal, range queries, or "next largest key", a balanced BST at O(log n) is the correct structure. Python dicts preserving insertion order is an implementation guarantee about insertion order, not about sorted order.',
    ],
    prompts: [
      'Is hash table lookup ever worse than O(1)?',
      'What is a load factor and why does it trigger a resize?',
      'Hash table or balanced BST — how do I choose?',
    ],
  },
  {
    id: 'binary-search',
    label: 'Binary Search',
    triggers: [/binary search/i, /bisect/i, /midpoint/i, /log ?n lookup/i],
    overview:
      'Binary search finds a target by repeatedly halving a **sorted** range: compare the middle, discard the half that cannot contain the target, repeat.\n\nEach step throws away half the candidates, so it takes O(log n) comparisons — about 20 steps for a million elements.\n\nThe sortedness precondition is not a detail. On unsorted input the algorithm does not run slowly; it returns wrong answers.',
    depth: [
      'If your data is unsorted and you need one lookup, sorting first costs O(n log n) — strictly worse than a single O(n) linear scan.\n\nBinary search pays off when you amortize the sort over many queries, or when the data arrives sorted already. One-shot lookup on unsorted data is the classic misapplication.',
      'The invariant is what makes implementations correct: the target, if present, is always inside `[lo, hi]`. Every branch must preserve that while strictly shrinking the range.\n\nOff-by-one bugs are almost always a step that fails to shrink (infinite loop) or one that excludes the target (false negative).',
      'Binary search generalises past arrays to any monotonic predicate — "smallest x where f(x) is true". That covers `sqrt` by bisection, rate-limit tuning, and "first failing commit" bisects.\n\nSortedness is really just monotonicity of the comparison, which is a much broader condition than a sorted array.',
    ],
    prompts: [
      'What happens if I binary search an unsorted array?',
      'Why is the midpoint sometimes computed as lo + (hi-lo)/2?',
      'How do I binary search on an answer rather than an array?',
    ],
  },
  {
    id: 'sorting',
    label: 'Sorting Algorithms',
    triggers: [/sort/i, /quicksort/i, /merge ?sort/i, /heap ?sort/i, /pivot/i, /stable/i],
    overview:
      'Comparison sorts cannot beat Ω(n log n) in the worst case — that bound is information-theoretic, from the number of orderings that must be distinguished.\n\nThe three workhorses sit at that bound with different trade-offs:\n- **Merge sort** — Θ(n log n) guaranteed, stable, needs O(n) extra space.\n- **Quicksort** — Θ(n log n) average but O(n²) worst case, in-place, fastest constants in practice.\n- **Heap sort** — Θ(n log n) guaranteed, in-place, not stable, poor cache behaviour.',
    depth: [
      "Quicksort's worst case comes from pathological pivots: already-sorted input with a first-element pivot yields partitions of size n-1 and 0, so the recursion is n deep and the work is O(n²).\n\nRandomised or median-of-three pivots make that case vanishingly unlikely. Introsort (what C++ `std::sort` uses) detects deep recursion and switches to heap sort, buying a hard O(n log n) ceiling.",
      'Stability means equal elements keep their original relative order. It matters when you sort by successive keys — sort by name, then stably by department, and names stay ordered within each department.\n\nMerge sort and Timsort are stable; quicksort and heap sort are not. This is often the deciding factor rather than raw speed.',
      'The Ω(n log n) bound only binds *comparison* sorts. Counting sort, radix sort, and bucket sort read the keys instead of comparing them and run in O(n + k) or O(nk).\n\nThey are not free lunch: they need bounded, structured keys. Sorting a million 32-bit integers with radix sort is a genuine win; sorting arbitrary objects is not.',
    ],
    prompts: [
      'Is quicksort always O(n log n)?',
      'When does stability actually matter?',
      'How can radix sort beat the n log n bound?',
    ],
  },
  {
    id: 'trees',
    label: 'Trees & BSTs',
    triggers: [/\bbst\b/i, /binary (search )?tree/i, /avl/i, /red[- ]black/i, /balanced/i],
    overview:
      'A binary search tree keeps every left descendant less than a node and every right descendant greater, so search descends one path and discards a subtree at each step.\n\nOn a balanced tree the height is O(log n), giving O(log n) search, insert, and delete.\n\nHeight — not node count — is what those bounds depend on, and nothing about the BST property forces the height to stay small.',
    depth: [
      'Insert 1, 2, 3, 4, 5 into a plain BST in order and you get a right-leaning chain of height n: a linked list with extra pointers, O(n) per operation.\n\nSelf-balancing variants exist precisely to prevent this. AVL trees rebalance by rotation on a strict height-difference rule; red-black trees use looser colour invariants, so they rebalance less and insert faster while searching slightly slower.',
      'In-order traversal of a BST emits keys in sorted order. That single property is why BSTs beat hash tables for range queries, `floor`/`ceiling` lookups, and ordered iteration — none of which a hash table can answer without a full sort.',
      'A heap is not a BST, though both are binary trees. A heap only guarantees parent ≤ children (min-heap), which is enough for O(1) peek and O(log n) push/pop, but says nothing about left-right order.\n\nSo you cannot search a heap in O(log n). Different invariant, different capability.',
    ],
    prompts: [
      'What makes a BST degenerate to O(n)?',
      'AVL or red-black — when does the difference matter?',
      'Why can a heap not be searched in O(log n)?',
    ],
  },
  {
    id: 'graphs',
    label: 'Graph Traversal',
    triggers: [/\bbfs\b/i, /\bdfs\b/i, /graph/i, /dijkstra/i, /shortest path/i, /traversal/i],
    overview:
      'BFS explores by distance, expanding all nodes one hop away before going deeper, using a **queue**. DFS drives down one branch until it dead-ends, using a **stack** (often the call stack).\n\nBoth visit every vertex and edge once: O(V + E).\n\nThe data structure is the entire difference. Swap the queue for a stack and BFS becomes DFS.',
    depth: [
      'BFS finds shortest paths only on **unweighted** graphs, where "shortest" means fewest edges. Add weights and BFS breaks, because a two-hop path can be cheaper than a one-hop path.\n\nDijkstra fixes this by replacing the queue with a priority queue keyed on distance — O((V + E) log V). With negative edges even Dijkstra fails, and you need Bellman-Ford.',
      'Forgetting the visited set is the classic bug. On a cyclic graph, traversal without it loops forever; on a DAG with diamonds, it revisits exponentially.\n\nMark nodes visited when you *enqueue*, not when you dequeue — otherwise duplicates pile up in the frontier before the first copy is processed.',
      'DFS suits problems about structure: cycle detection, topological sort, strongly connected components, connectivity. BFS suits problems about distance: shortest unweighted path, level ordering, nearest match.\n\nAsk whether the question is "is there a path / what shape is this" (DFS) or "how far" (BFS).',
    ],
    prompts: [
      'Why does BFS fail on weighted graphs?',
      'How do I detect a cycle with DFS?',
      'When do I need Dijkstra instead of BFS?',
    ],
  },
  {
    id: 'dp',
    label: 'Dynamic Programming',
    triggers: [/dynamic programming/i, /\bdp\b/i, /memoi/i, /tabulation/i, /subproblem/i],
    overview:
      'Dynamic programming applies when a problem has **overlapping subproblems** and an **optimal substructure** — the best answer is built from best answers to smaller instances.\n\nYou then solve each subproblem once and reuse it, either top-down with memoised recursion or bottom-up with a table.\n\nThe hard part is never the caching. It is defining a state that captures everything the future depends on.',
    depth: [
      'Memoisation and tabulation compute the same values with different control flow. Memoisation recurses lazily and touches only reachable states; tabulation iterates eagerly and fills everything.\n\nMemoisation wins on sparse state spaces and is easier to derive from a recursive definition. Tabulation avoids call-stack depth limits and permits space tricks like keeping only the last row.',
      "Greedy versus DP is the distinction that actually bites. Greedy commits to the locally best choice and never reconsiders; DP explores all choices and keeps the best.\n\nGreedy is correct only when the problem has the greedy-choice property. Coin change with {1, 5, 10, 25} works greedily; with {1, 3, 4} it fails — greedy makes 6 as 4+1+1 while the optimum is 3+3.",
      'Complexity is states × transitions per state. Knapsack with n items and capacity W has nW states and O(1) transitions → O(nW).\n\nNote that O(nW) is *pseudo*-polynomial: W is a value, not an input length, so the runtime is exponential in the number of bits of W. This is why knapsack remains NP-hard despite the DP.',
    ],
    prompts: [
      'Is memoization the same thing as tabulation?',
      'How do I know if a problem is greedy or DP?',
      'Why is knapsack still NP-hard if DP solves it?',
    ],
  },
]

export interface MisconceptionRule {
  id: string
  /** Fires only if the learner's own words match. */
  pattern: RegExp
  /** Only consider messages on nodes whose topic matches, if set. */
  topicHint?: string
  concept: string
  belief: string
  correction: string
  severity: 'high' | 'medium'
  /** Title of the generated correction sub-node. */
  fixTitle: string
  /** Seeded opening turn inside the generated sub-node. */
  drillQuestion: string
  drillAnswer: string
}

export const MISCONCEPTION_RULES: MisconceptionRule[] = [
  {
    id: 'hash-always-o1',
    pattern:
      /hash[^.?!]*\b(always|guarantee\w*|constant time no matter|never slow)\b|\b(always|guaranteed)\b[^.?!]*hash[^.?!]*o\(?1\)?/i,
    concept: 'Average case vs worst case',
    belief: 'Hash table lookup is always O(1), no matter the input.',
    correction:
      'O(1) is the *expected* cost under a good hash function and bounded load factor. With heavy collisions — degenerate hashes or adversarial keys — a bucket degrades to a linear scan and lookup becomes O(n). Hash-flooding DoS attacks exploit exactly this.',
    severity: 'high',
    fixTitle: 'Fix: hash worst case is O(n)',
    drillQuestion:
      'I said hash lookups are always O(1). Show me an input where that is false.',
    drillAnswer:
      'Take a table with 8 buckets and a hash function that returns `len(key)`. Insert 10,000 keys of length 5. Every one lands in the same bucket, so the table is a single linked list and lookup is a linear scan: **O(n)**.\n\nNothing here is exotic — it is a plausible-looking hash function meeting a plausible workload. The fix is not "avoid hash tables" but knowing which guarantee you have:\n\n| | Expected | Worst case |\n|---|---|---|\n| Chaining | O(1) | O(n) |\n| Chaining + tree buckets (Java 8+) | O(1) | O(log n) |\n\nWhen worst case matters — anything adversary-facing — that distinction is the whole design decision.',
  },
  {
    id: 'recursion-faster',
    pattern:
      /recursi\w*[^.?!]*\b(faster|more efficient|quicker|better performance)\b[^.?!]*\b(loop|iterat\w+|for)\b|\b(loop|iterat\w+)\b[^.?!]*\bslower\b[^.?!]*recursi/i,
    concept: 'Recursion as control flow, not speed',
    belief: 'Recursion is inherently faster or more efficient than iteration.',
    correction:
      'Recursion is usually *slower* and always heavier on memory: every pending call holds a stack frame, so depth costs O(depth) space that a loop does not pay. Recursion buys clarity on self-similar structures like trees, not throughput.',
    severity: 'medium',
    fixTitle: 'Fix: recursion costs stack space',
    drillQuestion: 'If recursion is not faster than a loop, why use it at all?',
    drillAnswer:
      'Because the cost you pay is runtime and the thing you buy is *fit to the problem shape*.\n\nSumming an array recursively is worse on every axis — same O(n) work, plus O(n) stack, plus call overhead, and it overflows around 10⁴–10⁶ depth. A loop is strictly better.\n\nWalking a binary tree recursively is three lines and obviously correct. The iterative version needs an explicit stack that you now maintain by hand — the same O(log n) memory, just moved from the call stack to the heap and made your problem.\n\nSo the rule is: recurse when the data is self-similar and the depth is logarithmic. Loop when the data is flat or the depth is linear.',
  },
  {
    id: 'binary-search-unsorted',
    pattern:
      /binary search[^.?!]*\b(any|unsorted|not sorted|whatever) (array|list|data|collection)\b|\b(unsorted|not sorted)\b[^.?!]*binary search|binary search[^.?!]*(dont|don't|do not|doesnt|doesn't) (need|require)[^.?!]*sort/i,
    concept: 'Preconditions are part of the algorithm',
    belief: 'Binary search works on any array, sorted or not.',
    correction:
      'Binary search requires sorted input. On unsorted data it does not run slowly — it silently returns wrong answers, because discarding "the half that cannot contain the target" is only valid under order. And if you must sort first for a single lookup, that O(n log n) is worse than one O(n) linear scan.',
    severity: 'high',
    fixTitle: 'Fix: sortedness is a precondition',
    drillQuestion: 'Walk me through binary search failing on unsorted data.',
    drillAnswer:
      'Search for `7` in `[9, 2, 7, 4, 1]`.\n\n1. Range is the whole array, midpoint is index 2 → value `7`. Found, by luck.\n\nNow search for `4`:\n\n1. Midpoint index 2 → `7`. Since 4 < 7, discard the right half.\n2. Range `[9, 2]`, midpoint → `9`. Since 4 < 9, discard right.\n3. Range `[9]` → not 4. **Reports "not present."**\n\nBut `4` is sitting at index 3, in the half we threw away at step 1. The algorithm did not error, did not slow down, and returned a confidently wrong answer. Silent incorrectness is far more dangerous than slowness, which is why the precondition is load-bearing rather than advisory.',
  },
  {
    id: 'quicksort-always-nlogn',
    pattern:
      /quick ?sort[^.?!]*\b(always|guarantee\w*)\b[^.?!]*(n ?log ?n|nlogn)|\b(always|guaranteed)\b[^.?!]*quick ?sort[^.?!]*(n ?log ?n|nlogn)|quick ?sort[^.?!]*\bnever\b[^.?!]*o\(?n\^?2\)?/i,
    concept: 'Average case vs worst case',
    belief: 'Quicksort is always O(n log n).',
    correction:
      'Quicksort is Θ(n log n) on average but O(n²) in the worst case. Pathological pivots — a first-element pivot on already-sorted input — produce partitions of size n-1 and 0, making the recursion n levels deep.',
    severity: 'medium',
    fixTitle: 'Fix: quicksort worst case is O(n²)',
    drillQuestion: 'What input makes quicksort quadratic, and how do real libraries avoid it?',
    drillAnswer:
      'Sorted input with a fixed first-element pivot. Partitioning `[1,2,3,4,5]` splits into `[]` and `[2,3,4,5]` — you removed exactly one element for O(n) of work, n times over, so O(n²). Reverse-sorted input does the same.\n\nProduction sorts defend in three ways:\n\n- **Randomised pivot** — an adversary cannot predict the split, so the bad case becomes vanishingly unlikely.\n- **Median-of-three** — sample first, middle, last and pivot on the median, which kills the sorted-input case outright.\n- **Introsort** — track recursion depth and switch to heap sort past ~2 log n, converting the O(n²) tail into a hard O(n log n) ceiling. This is what C++ `std::sort` does.\n\nNote what the mitigations do: they make the worst case unlikely or bounded. They do not make quicksort worst-case O(n log n) on its own.',
  },
  {
    id: 'linked-list-random-access',
    pattern:
      /linked list[^.?!]*\b(o\(?1\)?|constant|fast|instant)\b[^.?!]*\b(access|index|lookup|get)\b|\b(index|access)\w*\b[^.?!]*linked list[^.?!]*o\(?1\)?/i,
    concept: 'Pointer chasing vs address arithmetic',
    belief: 'Linked lists give O(1) access to an element by index.',
    correction:
      'Reaching index i in a linked list means walking i pointers from the head: O(n). Only arrays get O(1) indexing, because a contiguous block lets you *compute* the address. The linked list O(1) claim applies to insert/delete once you already hold the node.',
    severity: 'medium',
    fixTitle: 'Fix: linked list indexing is O(n)',
    drillQuestion: 'Which linked list operations are actually O(1)?',
    drillAnswer:
      'Only the ones that need no search. The distinction is *given a node* versus *find then act*:\n\n| Operation | Linked list | Array |\n|---|---|---|\n| Access index i | O(n) | **O(1)** |\n| Insert at head | **O(1)** | O(n) |\n| Insert after a node you hold | **O(1)** | O(n) |\n| Insert at index i | O(n) | O(n) |\n| Search by value | O(n) | O(n) |\n\nThe two O(1) wins both assume you already have the pointer. `insert_at(i)` has to walk there first, so it collapses back to O(n) — the search dominates the cheap rewiring.\n\nThis is why the "linked lists are better for insertion" folklore misleads: true for the rewiring step, usually irrelevant once you count getting there.',
  },
  {
    id: 'bigo-wallclock',
    pattern:
      /o\(?n ?log ?n\)?[^.?!]*\balways\b[^.?!]*\b(faster|better)\b|\bbig[- ]?o\b[^.?!]*\b(exact|actual|real)\b[^.?!]*\b(time|speed|seconds|runtime)\b|lower big[- ]?o[^.?!]*\balways\b[^.?!]*\bfaster\b/i,
    concept: 'Asymptotic growth vs measured runtime',
    belief: 'A lower Big-O always means a faster program.',
    correction:
      'Big-O describes growth as n → ∞ with constants discarded. At realistic n those discarded constants often decide the race: an O(n) scan over a contiguous array routinely beats an O(log n) pointer walk, and insertion sort beats quicksort below ~20 elements.',
    severity: 'medium',
    fixTitle: 'Fix: constants decide small-n races',
    drillQuestion: 'Give me a case where the worse Big-O is the faster program.',
    drillAnswer:
      'Insertion sort versus quicksort on 16 elements. Insertion sort is O(n²) but its inner loop is a compare and a shift with near-perfect cache behaviour; quicksort is O(n log n) but pays partitioning overhead and recursive calls. Insertion sort wins — which is why `std::sort` and Timsort both switch to it under a threshold around 16–32.\n\nThe general shape: Big-O is a claim about the *limit*. Real cost is roughly `c · f(n)`, and Big-O deletes `c`. When two algorithms have similar f and very different c, or when n is small enough that c dominates, the asymptotics predict the wrong winner.\n\nUse Big-O to rule out algorithms that will not survive growth. Use a profiler to choose among the survivors.',
  },
  {
    id: 'memo-tabulation-same',
    pattern:
      /memoi\w*[^.?!]*\b(same as|identical to|no different|exactly like)\b[^.?!]*tabulation|tabulation[^.?!]*\b(same as|identical to|no different)\b[^.?!]*memoi/i,
    concept: 'Top-down vs bottom-up DP',
    belief: 'Memoisation and tabulation are interchangeable.',
    correction:
      'They compute the same values but differ operationally. Memoisation is lazy and recursive — it visits only reachable states but risks stack overflow. Tabulation is eager and iterative — no stack limit, and it permits space optimisation like keeping only the previous row.',
    severity: 'medium',
    fixTitle: 'Fix: memoisation ≠ tabulation',
    drillQuestion: 'When does the choice between memoisation and tabulation actually matter?',
    drillAnswer:
      'Three situations where they diverge:\n\n**Sparse state spaces.** If the recursion only reaches 1% of the theoretical states, memoisation touches 1% and tabulation fills 100%. Top-down can be asymptotically better on wasted work.\n\n**Deep recursion.** A DP over a 10⁶-element string recurses 10⁶ deep and blows the stack. Tabulation just loops.\n\n**Space optimisation.** When `dp[i]` depends only on `dp[i-1]`, tabulation can keep two rows instead of n — O(W) instead of O(nW). Memoisation cannot, because it has no control over visit order and any cached state may be needed later.\n\nDefault to memoisation while deriving the recurrence, then convert to tabulation if you hit depth or memory limits.',
  },
  {
    id: 'bfs-weighted',
    pattern:
      /\bbfs\b[^.?!]*shortest path[^.?!]*\b(weight|weighted|cost)\b|\bbfs\b[^.?!]*\b(always|any graph)\b[^.?!]*shortest|shortest path[^.?!]*\bbfs\b[^.?!]*weighted/i,
    concept: 'Unweighted vs weighted shortest paths',
    belief: 'BFS finds the shortest path on any graph.',
    correction:
      'BFS minimises the *number of edges*, which equals shortest distance only when all weights are equal. On a weighted graph a two-hop path can be cheaper than a one-hop path, so BFS returns the wrong path. Use Dijkstra — a priority queue keyed on cumulative distance.',
    severity: 'high',
    fixTitle: 'Fix: BFS needs uniform weights',
    drillQuestion: 'Show me BFS returning the wrong shortest path.',
    drillAnswer:
      'Three nodes: `A→C` with weight 100, `A→B` weight 1, `B→C` weight 1.\n\nBFS from A explores one hop first, finds C, and reports the path `A→C` at cost **100**. The true shortest path is `A→B→C` at cost **2** — but it is two hops, so BFS never considers it after finding a one-hop answer.\n\nBFS was not buggy. It correctly minimised hop count, which is simply not the question you asked.\n\nThe fix is to make the frontier ordered by cost rather than by insertion:\n\n| Graph | Algorithm | Cost |\n|---|---|---|\n| Unweighted | BFS | O(V + E) |\n| Non-negative weights | Dijkstra | O((V+E) log V) |\n| Negative edges | Bellman-Ford | O(VE) |\n\nDijkstra *is* BFS with the queue swapped for a priority queue. And it fails on negative edges for the same class of reason — a node popped as "final" can still be improved later.',
  },
  {
    id: 'bst-always-logn',
    pattern:
      /\b(bst|binary search tree)\b[^.?!]*\b(always|guarantee\w*)\b[^.?!]*(log ?n|o\(?log)|\b(always|guaranteed)\b[^.?!]*(bst|binary search tree)[^.?!]*log ?n/i,
    concept: 'Balance is not automatic',
    belief: 'A BST always gives O(log n) operations.',
    correction:
      'BST cost is O(height), and nothing in the BST property bounds the height. Inserting sorted keys builds a chain of height n, so operations degrade to O(n). Only *self-balancing* trees — AVL, red-black — guarantee O(log n).',
    severity: 'high',
    fixTitle: 'Fix: unbalanced BSTs degrade to O(n)',
    drillQuestion: 'Why does inserting sorted data into a BST destroy performance?',
    drillAnswer:
      'Insert 1, 2, 3, 4, 5 into an empty BST. Each key is larger than everything before it, so each becomes the right child of the previous:\n\n```\n1\n \\\n  2\n   \\\n    3\n     \\\n      4\n       \\\n        5\n```\n\nHeight is n, not log n. You have built a linked list that also wastes a null pointer per node — searching for 5 visits all five nodes, O(n).\n\nThis is not a corner case. Sorted insertion is extremely common: importing a database export, replaying timestamped events, loading an already-sorted file.\n\nSelf-balancing trees detect the skew and rotate:\n\n- **AVL** keeps subtree heights within 1. More rotations, tighter balance, faster lookups.\n- **Red-black** allows up to 2× height imbalance. Fewer rotations, faster inserts.\n\nRead-heavy workload → AVL. Write-heavy → red-black, which is why most standard libraries ship it.',
  },
]

/** Short, plausible-sounding fallback scaffolds keyed by question shape. */
export const GENERIC_REPLIES = {
  why: 'The short answer: it follows from what the structure guarantees, not from how it happens to be implemented.\n\nWork from the invariant. Ask what must remain true after every operation, then ask what that forces to be true about cost. Most "why" questions in this area resolve once the invariant is explicit.',
  how: 'Break it into the smallest step that makes progress, then ask what has to hold before and after that step.\n\nOnce the single step is correct and you can show the input strictly shrinks, the whole procedure follows by induction. Most implementation bugs are a step that does not actually shrink the problem.',
  compare:
    'Comparisons here almost always come down to what you optimise and what you give up.\n\nList the operations you will actually perform and how often, then price each option against *that* mix rather than against a generic benchmark. The winner usually changes with the workload.',
  default:
    "Let me anchor this. Say what you already believe about it, even loosely — a half-formed version is far more useful to correct than a blank.\n\nI will then tell you which part holds, which part breaks, and where the boundary is. That boundary is usually the thing worth remembering.",
}
