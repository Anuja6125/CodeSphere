'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Loader2, MessageSquare, Send, Sparkles, Trash2 } from 'lucide-react'
import { api, type ChatMessage, type Source } from '@/lib/api'
import { useRepo } from '@/components/repository/RepoContext'
import { Markdown } from '@/components/common/Markdown'
import { Alert, ErrorState, LoadingState } from '@/components/common/States'

const SUGGESTIONS = [
  'What does this project do?',
  'How does authentication work?',
  'Which files handle database operations?',
  'Where is the API for user registration?',
  'Explain how the main modules depend on each other.',
]
const MAX_LENGTH = 4000 // same limit as the backend

type UiMessage = ChatMessage & { lowConfidence?: boolean }

function Sources({ sources }: { sources: Source[] | null }) {
  if (!sources?.length) return null
  const unique = [...new Map(sources.map((s) => [`${s.file}:${s.startLine}`, s])).values()].slice(0, 6)
  return (
    <div className="sources">
      <span className="muted xsmall">Sources</span>
      {unique.map((s) => (
        <span key={`${s.file}:${s.startLine}`} className="source" title={s.symbolName ?? undefined}>
          {s.file}:{s.startLine}-{s.endLine}
        </span>
      ))}
    </div>
  )
}

export function ChatPanel() {
  const { id, repo } = useRepo()
  const [messages, setMessages] = useState<UiMessage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setMessages(await api.getChat(id))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the chat.')
    }
  }, [id])

  useEffect(() => { setMessages(null); load() }, [load])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, sending])

  async function send(text: string) {
    const question = text.trim()
    if (!question || sending) return
    if (question.length > MAX_LENGTH) return setSendError(`Keep questions under ${MAX_LENGTH.toLocaleString()} characters.`)

    const temp: UiMessage = { id: `temp-${Date.now()}`, role: 'user', content: question, fileRefs: null, createdAt: new Date().toISOString() }
    setMessages((m) => [...(m ?? []), temp])
    setInput('')
    setSending(true)
    setSendError(null)
    try {
      const answer = await api.sendChat(id, question)
      setMessages((m) => [
        ...(m ?? []),
        { id: `a-${Date.now()}`, role: 'assistant', content: answer.answer, fileRefs: answer.sources, createdAt: new Date().toISOString(), lowConfidence: answer.isLowConfidence },
      ])
    } catch (e) {
      // Put the question back so the user can retry without retyping.
      setMessages((m) => (m ?? []).filter((x) => x.id !== temp.id))
      setInput(question)
      setSendError(e instanceof Error ? e.message : 'The question could not be sent.')
    } finally {
      setSending(false)
    }
  }

  async function clear() {
    if (!window.confirm('Clear the chat history for this repository?')) return
    try {
      await api.clearChat(id)
      setMessages([])
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not clear the chat.')
    }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(input) }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  if (loadError && !messages) return <ErrorState title="Could not load the chat" message={loadError} onRetry={load} />
  if (!messages) return <LoadingState label="Loading chat…" />

  const chunks = repo?._count.chunks ?? 0
  const partialIndex = repo && chunks > 0 && repo.embeddedChunks < chunks

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef} aria-live="polite">
        {partialIndex && (
          <Alert tone="warn">
            Code search is still indexing ({repo!.embeddedChunks} of {chunks} parts). Answers may rely on project facts more than code until it finishes.
          </Alert>
        )}

        {messages.length === 0 && !sending && (
          <div className="state" style={{ flex: 1 }}>
            <div className="state-icon"><MessageSquare /></div>
            <h3>Ask about {repo?.name ?? 'this repository'}</h3>
            <p>Answers come from this project&apos;s code and cite the files used.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => <button key={s} className="suggestion" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg msg-user"><div className="bubble">{m.content}</div></div>
          ) : (
            <div key={m.id} className="msg">
              <span className="msg-avatar" aria-hidden><Sparkles /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="msg-label">CodeSphere AI{m.lowConfidence && <span className="badge badge-busy" style={{ marginLeft: 8 }}>Low confidence</span>}</div>
                <div className="bubble">
                  <Markdown content={m.content} />
                  <Sources sources={m.fileRefs} />
                </div>
              </div>
            </div>
          )
        )}

        {sending && (
          <div className="msg">
            <span className="msg-avatar" aria-hidden><Sparkles /></span>
            <div className="bubble" aria-label="Thinking"><span className="typing"><i /><i /><i /></span></div>
          </div>
        )}
      </div>

      {sendError && <Alert>{sendError}</Alert>}
      <form className="chat-input" onSubmit={onSubmit}>
        <textarea
          className="input"
          rows={2}
          placeholder="Ask about this repository. Enter to send, Shift+Enter for a new line."
          aria-label="Your question"
          value={input}
          maxLength={MAX_LENGTH}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <div className="stack-sm">
          <button className="btn btn-primary" type="submit" disabled={sending || !input.trim()} aria-label="Send">
            {sending ? <Loader2 className="spin" /> : <Send />} Send
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={clear} disabled={sending || messages.length === 0}>
            <Trash2 /> Clear
          </button>
        </div>
      </form>
    </div>
  )
}
