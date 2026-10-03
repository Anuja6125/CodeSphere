import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Turn heading text into a stable anchor id. */
export const slugify = (text: string) =>
  text.toLowerCase().replace(/[`*_]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const textOf = (children: React.ReactNode): string =>
  Array.isArray(children) ? children.map(textOf).join('') : typeof children === 'string' ? children : ''

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={slugify(textOf(children))}>{children}</h2>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
