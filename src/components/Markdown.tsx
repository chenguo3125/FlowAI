import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink-200">{children}</strong>,
  em: ({ children }) => <em className="text-ink-300 italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2.5 list-disc space-y-1 pl-5 marker:text-ink-500 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2.5 list-decimal space-y-1 pl-5 marker:text-ink-500 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children, className }) =>
    className?.includes('language-') ? (
      <code className="font-mono text-[12px] leading-relaxed">{children}</code>
    ) : (
      <code className="rounded bg-ink-800/60 px-1.5 py-0.5 font-mono text-[0.85em] text-accent ring-1 ring-ink-700">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="scrollbar-slim mb-2.5 overflow-x-auto rounded-lg bg-ink-950/70 p-3 ring-1 ring-ink-700 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="scrollbar-slim mb-2.5 overflow-x-auto rounded-lg ring-1 ring-ink-700 last:mb-0">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink-900/70">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-ink-700 px-2.5 py-1.5 text-left font-semibold text-ink-300">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-ink-800 px-2.5 py-1.5 align-top">{children}</td>
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-accent underline decoration-accent/40 hover:decoration-accent">
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-ink-700" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-2.5 border-l-2 border-ink-600 pl-3 text-ink-300 last:mb-0">
      {children}
    </blockquote>
  ),
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[13.5px] text-ink-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
