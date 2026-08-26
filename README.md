# FlowAI — The Asymmetric Learning Canvas

A spatial, node-based study canvas that replaces linear chat history with an interactive knowledge
network. Prototype: runs entirely in the browser against a simulated tutor, no API key required.

```bash
npm install
npm run dev        # http://localhost:5173
```

## The three ideas

**Node-locked micro-chats.** Every node owns a private conversation. Selecting a different node
swaps the AI's entire context rather than appending to one ever-growing thread. The sidebar meter
shows the real weight of that context against what a linear chat would have sent — on the seeded
canvas most nodes sit near 55 tokens against 2,400, roughly 40× lighter.

**Accordion summary bubbles.** Closing a thread compresses it into a titled, summarised bubble that
lives on the node itself. Past conversations are re-opened with one click on the canvas instead of a
scroll through history, and bubbles expand both on the card and in the sidebar. Compression is not
only cosmetic: closed threads re-enter the model's context as their one-line summary rather than
their full transcript.

**The Mistake Graph.** The Misconception Analyzer sweeps every transcript on the canvas, not just
the open one. Each finding names the belief, quotes the message that gave it away, turns the node
amber or red by severity, and grows a correction sub-node pre-loaded with a targeted drill. Closing
a gap folds the drill conversation back into the parent topic, so the correction is filed where
you'll look for it at revision time rather than stranded on a node of its own.

## Demo path

The canvas ships pre-walked: eleven nodes, ten archived study threads, and twenty-two learner
messages carrying nine latent misconceptions that no one has caught yet.

1. Click **Hash Tables**, expand the compressed thread, and read the last exchange. The learner
   claims O(1) always holds; the tutor lets it slide. This is the failure mode of linear chat.
2. Hit **Run misconception analyzer**. Nine nodes recolour and nine correction sub-nodes grow off
   them with animated edges.
3. Open the **Mistake graph** tab. Each card offers *jump to evidence* — which selects the node,
   expands the right archived thread, scrolls to the exact message, and rings it in red.
4. Click **Open drill node** to land in a generated `Fix:` node whose chat already contains the
   counter-example.
5. Ask the drill node a follow-up, then hit **I've got it now**. The gap closes, the drill node is
   removed leaving a fading ghost where it stood, and the whole conversation folds into the parent
   topic as a violet correction bubble — expanded on the canvas so you can see it land.

The sidebar is resizable: drag its left edge, double-click to reset, or focus the handle and use the
arrow keys.

`npm run check` asserts all nine rules stay reachable from the seed, so the headline action always
has something to find.

## Swapping in a real model

Everything model-facing sits behind one interface in `src/ai/provider.ts`:

```ts
interface AIProvider {
  stream(req: ChatRequest, onToken: (chunk: string) => void): Promise<string>
  summarize(req: SummarizeRequest): Promise<{ title: string; summary: string }>
  summarizeCorrection(req: CorrectionSummarizeRequest): Promise<{ title: string; summary: string }>
  analyze(targets: AnalyzeTarget[], known: Set<string>): Promise<MisconceptionDraft[]>
  suggestedPrompts(nodeTitle: string): string[]
}
```

`ChatRequest` *is* the isolation guarantee: one node's live thread, its closed threads as summaries,
and ancestor titles as a breadcrumb — never another node's transcript. `buildContext` in the store
assembles it once and both the real call and the sidebar meter use it, so the number on screen
cannot drift from the payload. Implement the interface against any provider and change the last line
of `provider.ts` — the UI imports `provider`, never the mock.

`analyze` is the piece that changes character with a real model. The mock matches regex rules from
`src/ai/knowledge.ts`; a real implementation would send each node's transcript and ask for
structured findings in the same `MisconceptionDraft` shape.

`summarizeCorrection` is deliberately separate from `summarize`: recapping a topic and recording
*what you believed versus what corrected it* want different prompts, and only the latter is useful
at revision time.

### Assuming the provider will fail

Every write path treats the model as optional rather than load-bearing, because a real provider
times out, rate-limits and returns malformed JSON where the mock cannot:

- **Archiving moves state first.** Compressing a thread or closing a gap commits synchronously using
  a deterministic digest from `src/lib/digest.ts`, then overwrites it with the model's version if the
  call returns. A failed call degrades the prose; it never loses the conversation.
- **Streaming always clears its draft.** `streamDraft` is guarded globally, so an unhandled provider
  rejection would otherwise disable sending on *every* node until a reload. Errors land as a visible
  assistant message instead, and the question stays in the thread so it can be resent.
- **Replies are bound to a session, not a node.** A thread can relocate mid-stream — compressing to a
  bubble and closing a gap both move it. `appendToSession` writes the reply to the session it was
  asked in, wherever that now lives, so the exchange can't split across a moved thread and the empty
  one left behind. At mock latency this race is a two-second window; at real streaming speed it is
  easy to hit.

`npm run check` also simulates two consecutive analyzer sweeps to prove a closed gap does not
regenerate its correction node on the second run.

## Theming

Light, dark and match-system, switched from the segmented control in the top bar and remembered in
`localStorage` under `flowai.theme`. A tiny script in `index.html` resolves the palette before first
paint so the canvas never flashes the wrong theme; it mirrors `resolvePref()` in
`src/store/themeStore.ts`, and the two must be kept in step.

No component carries a `dark:` variant. Both palettes redefine the *same* `--color-ink-*` and status
tokens in `src/index.css`, so every existing class re-themes on its own:

- `@theme` holds the dark palette, which doubles as the no-JavaScript fallback.
- An unlayered `.light` block overrides those tokens. Being outside Tailwind's `@layer theme`, it
  wins on cascade layer rather than specificity.
- The `ink` scale is an **elevation** ramp, not a lightness ramp: 950 sits furthest back (the
  canvas), 900/850 are panels and cards, 800–600 are fills and borders, and 500–100 climb toward the
  most prominent text. Light mode inverts the underlying values while keeping that meaning.

Two places need real colour strings rather than tokens. React Flow draws the minimap, dot grid and
connection line through SVG attributes, which cannot read CSS custom properties, so those are
mirrored in `CANVAS_TOKENS` per theme. Analyzer edges instead carry an `edge-severity-*` class and
get their stroke from CSS, so edges saved under one theme still follow the other — an inline stroke
would have frozen the palette into `localStorage`.

Status colours are darkened in light mode (amber-700 rather than amber-400, and so on) so small
labels stay legible on near-white surfaces, and node cards pick up an ambient `--shadow-card` lift
that dark mode does not need.

## Layout

```
src/
  ai/
    knowledge.ts     Canned CS domain content + 9 misconception rules
    provider.ts      AIProvider interface, mock implementation, context boundary
  components/
    Canvas.tsx       React Flow surface, minimap, status legend
    TopicNode.tsx    Topic card + accordion summary bubbles
    ChatSidebar.tsx  Node-locked micro-chat, context meter, composer
    MistakePanel.tsx Mistake Graph findings, evidence jumps, drill links
    TopBar.tsx       Analyzer trigger, canvas stats
    Markdown.tsx     Message renderer (GFM tables, code, lists)
  data/seed.ts       Pre-walked CS-fundamentals canvas
  lib/digest.ts      Deterministic thread summaries, used when the model is unavailable
  store/
    canvasStore.ts   Zustand store, localStorage-persisted
    themeStore.ts    Theme preference, system listener, canvas colour tokens
  lib/               Status palette, text helpers
```

Node colour is always derived from open misconceptions rather than stored, so the canvas cannot
drift out of sync with the Mistake Graph. Streaming text is held outside the node tree so tokens do
not re-render the canvas.

State persists to `localStorage` under `flowai.canvas.v2`. The reset button in the top bar restores
the seeded canvas. Correction-node ghosts are deliberately left out of the persisted slice — they
are a moment of feedback, not canvas state, so a reload clears them.

`vite.config.ts` sets `server.watch.usePolling`. FSEvents does not reach Vite in some environments,
and without polling the module graph never invalidates: edits serve stale with no HMR event at all.

## Stack

Vite 8 · React 19 · TypeScript · React Flow (`@xyflow/react`) · Zustand · Tailwind CSS 4
