'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatInputAreaInner, ChatItem, ChatSendButton } from '@lobehub/ui/chat'
import {
  Check,
  CircleAlert,
  FileText,
  Loader2,
  MessageSquarePlus,
  Presentation,
  BarChart3,
  ListChecks,
  Trash2,
  Wrench,
  User,
} from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { FileCard } from '@/components/files/FileCard'
import { agentApi, AgentEvent, AgentFile } from '@/lib/api/agent'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Step {
  name: string
  args: Record<string, unknown>
  ok?: boolean
  result?: string
  done: boolean
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: Step[]
  files?: AgentFile[]
  error?: string
  pending?: boolean
  time: number
}

interface Thread {
  id: string
  title: string
  notebookId?: string
  messages: Message[]
  updated: number
}

const STORAGE_KEY = 'mcit-lm-assistant-threads'
const NO_NOTEBOOK = '__none__'

const TOOL_LABEL: Record<string, string> = {
  list_notebooks: 'Looking up notebooks',
  create_notebook: 'Creating notebook',
  list_sources: 'Listing sources',
  add_source: 'Adding source',
  read_notebook: 'Reading notebook',
  search_knowledge: 'Searching sources',
  create_note: 'Saving note',
  generate_file: 'Generating file',
  list_files: 'Listing files',
  generate_podcast: 'Starting podcast',
}

const SUGGESTIONS = [
  { icon: Presentation, title: 'Build a presentation', prompt: 'Create a 10-slide presentation from this notebook for senior leadership, midnight theme.' },
  { icon: FileText, title: 'Write a PDF report', prompt: 'Write a detailed PDF report from this notebook with recommendations.' },
  { icon: BarChart3, title: 'Design an infographic', prompt: 'Make an infographic of the key figures in this notebook as SVG and PDF.' },
  { icon: ListChecks, title: 'Batch: full briefing pack', prompt: 'Produce a briefing pack from this notebook: an executive summary in Word, a PDF report and an 8-slide deck.' },
]

const uid = () => Math.random().toString(36).slice(2, 10)

function loadThreads(): Thread[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function describeArgs(name: string, args: Record<string, unknown>) {
  if (name === 'generate_file') {
    const parts = [args.kind, args.theme, args.slide_count && args.kind === 'presentation' ? `${args.slide_count} slides` : null]
    const fmts = Array.isArray(args.formats) && args.formats.length ? (args.formats as string[]).join(', ').toUpperCase() : null
    return [...parts, fmts].filter(Boolean).join(' · ')
  }
  if (name === 'add_source') return String(args.url || args.title || 'text')
  if (name === 'create_notebook') return String(args.name || '')
  if (name === 'search_knowledge') return String(args.query || '')
  return ''
}

function StepList({ steps, running }: { steps: Step[]; running: boolean }) {
  if (!steps.length && !running) return null
  return (
    <div className="mb-2 flex flex-col gap-1">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-[13px] text-muted-foreground">
          {!s.done ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : s.ok ? (
            <Check className="h-3.5 w-3.5 text-fern" />
          ) : (
            <CircleAlert className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="text-foreground/80">{TOOL_LABEL[s.name] ?? s.name}</span>
          {describeArgs(s.name, s.args) && <span className="truncate">{describeArgs(s.name, s.args)}</span>}
        </div>
      ))}
      {running && (steps.length === 0 || steps.every((s) => s.done)) && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Thinking
        </div>
      )}
    </div>
  )
}

export default function AssistantPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { data: notebooks } = useNotebooks(false)

  useEffect(() => {
    const t = loadThreads()
    setThreads(t)
    const params = new URLSearchParams(window.location.search)
    const nb = params.get('notebook')
    if (nb) {
      const fresh: Thread = { id: uid(), title: 'New chat', notebookId: nb, messages: [], updated: Date.now() }
      setThreads([fresh, ...t])
      setActiveId(fresh.id)
    } else if (t[0]) {
      setActiveId(t[0].id)
    }
  }, [])

  useEffect(() => {
    if (threads.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, 50)))
  }, [threads])

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [active?.messages])

  const patchThread = useCallback((id: string, fn: (t: Thread) => Thread) => {
    setThreads((all) => all.map((t) => (t.id === id ? { ...fn(t), updated: Date.now() } : t)))
  }, [])

  const patchLast = useCallback(
    (threadId: string, fn: (m: Message) => Message) =>
      patchThread(threadId, (t) => ({ ...t, messages: t.messages.map((m, i) => (i === t.messages.length - 1 ? fn(m) : m)) })),
    [patchThread]
  )

  const newThread = () => {
    const t: Thread = { id: uid(), title: 'New chat', notebookId: active?.notebookId, messages: [], updated: Date.now() }
    setThreads((all) => [t, ...all])
    setActiveId(t.id)
  }

  const deleteThread = (id: string) => {
    setThreads((all) => {
      const next = all.filter((t) => t.id !== id)
      if (!next.length) localStorage.removeItem(STORAGE_KEY)
      if (id === activeId) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  const applyEvents = useCallback(
    (threadId: string, events: AgentEvent[]) => {
      patchLast(threadId, (m) => {
        const steps = [...(m.steps ?? [])]
        const files = [...(m.files ?? [])]
        let content = m.content
        let error = m.error
        for (const ev of events) {
          if (ev.type === 'tool_call') steps.push({ name: ev.name, args: ev.args, done: false })
          if (ev.type === 'tool_result') {
            const idx = steps.findIndex((s) => s.name === ev.name && !s.done)
            if (idx >= 0) steps[idx] = { ...steps[idx], done: true, ok: ev.ok, result: ev.result }
          }
          if (ev.type === 'file' && !files.some((f) => f.id === ev.file.id)) files.push(ev.file)
          if (ev.type === 'message') content = ev.content
          if (ev.type === 'error') error = ev.message
        }
        return { ...m, steps, files, content, error }
      })
    },
    [patchLast]
  )

  const send = async (text?: string) => {
    const value = (text ?? input).trim()
    if (!value || runId) return
    let thread = active
    if (!thread) {
      thread = { id: uid(), title: 'New chat', messages: [], updated: Date.now() }
      setThreads((all) => [thread as Thread, ...all])
      setActiveId(thread.id)
    }
    const tid = thread.id
    const history = [...thread.messages.filter((m) => m.content), { role: 'user' as const, content: value }]
    patchThread(tid, (t) => ({
      ...t,
      title: t.messages.length ? t.title : value.slice(0, 60),
      messages: [
        ...t.messages,
        { id: uid(), role: 'user', content: value, time: Date.now() },
        { id: uid(), role: 'assistant', content: '', steps: [], files: [], pending: true, time: Date.now() },
      ],
    }))
    setInput('')
    try {
      const run = await agentApi.start(history.map((m) => ({ role: m.role, content: m.content })), thread.notebookId)
      setRunId(run.id)
      let after = -1
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200))
        const state = await agentApi.poll(run.id, after)
        if (state.events.length) {
          after = state.events[state.events.length - 1].seq
          applyEvents(tid, state.events)
        }
        if (state.status !== 'running') break
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      patchLast(tid, (m) => ({ ...m, error: msg || 'The assistant could not be reached.' }))
    } finally {
      patchLast(tid, (m) => ({ ...m, pending: false }))
      setRunId(null)
    }
  }

  const stop = async () => {
    if (runId) await agentApi.cancel(runId)
  }

  const notebookName = notebooks?.find((n) => n.id === active?.notebookId)?.name

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1">
        {/* Thread list */}
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
          <div className="p-3">
            <button
              type="button"
              onClick={newThread}
              className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {threads.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No conversations yet</p>}
            {threads.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'group flex items-center gap-1 rounded-lg px-3 py-2 text-sm',
                  t.id === activeId ? 'bg-muted font-medium' : 'text-foreground/80 hover:bg-muted/60'
                )}
              >
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveId(t.id)}>
                  {t.title}
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  onClick={() => deleteThread(t.id)}
                  className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Conversation */}
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 px-6 py-3">
            <div className="text-sm font-medium">Assistant</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Notebook</span>
              <Select
                value={active?.notebookId ?? NO_NOTEBOOK}
                onValueChange={(v) => {
                  if (!active) {
                    const t: Thread = { id: uid(), title: 'New chat', notebookId: v === NO_NOTEBOOK ? undefined : v, messages: [], updated: Date.now() }
                    setThreads((all) => [t, ...all])
                    setActiveId(t.id)
                  } else {
                    patchThread(active.id, (t) => ({ ...t, notebookId: v === NO_NOTEBOOK ? undefined : v }))
                  }
                }}
              >
                <SelectTrigger className="h-8 w-56 rounded-lg text-sm">
                  <SelectValue placeholder="Any notebook" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_NOTEBOOK}>Any notebook (assistant decides)</SelectItem>
                  {notebooks?.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
              {!active?.messages.length ? (
                <div className="flex flex-col items-center gap-8 pt-[8vh]">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h1 className="text-3xl font-semibold tracking-tight">What should we work on?</h1>
                    <p className="max-w-md text-sm text-muted-foreground">
                      Ask about your sources, or have the assistant create notebooks, add links and produce reports,
                      decks, infographics and summaries{notebookName ? ` from ${notebookName}` : ''}.
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.title}
                        type="button"
                        onClick={() => send(s.prompt)}
                        className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/60"
                      >
                        <s.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{s.title}</span>
                        <span className="text-xs leading-relaxed text-muted-foreground">{s.prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                active.messages.map((m) =>
                  m.role === 'user' ? (
                    <ChatItem
                      key={m.id}
                      placement="right"
                      variant="bubble"
                      showAvatar={false}
                      avatar={{ avatar: <User className="h-4 w-4" />, title: 'You' }}
                      message={m.content}
                      time={m.time}
                    />
                  ) : (
                    <ChatItem
                      key={m.id}
                      placement="left"
                      variant="docs"
                      avatar={{ avatar: <span className="text-[11px] font-semibold">LM</span>, title: 'MCIT LM', backgroundColor: 'var(--surface-sunken)' }}
                      loading={m.pending && !m.content && !(m.steps?.length)}
                      aboveMessage={<StepList steps={m.steps ?? []} running={!!m.pending && !m.content} />}
                      message={m.content || (m.pending ? '' : m.error ? '' : 'Done.')}
                      belowMessage={
                        <div className="flex flex-col gap-2">
                          {!!m.files?.length && (
                            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                              {m.files.map((f) => (
                                <FileCard key={f.id} file={f} />
                              ))}
                            </div>
                          )}
                          {m.error && (
                            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                              <CircleAlert className="h-4 w-4" /> {m.error}
                            </div>
                          )}
                        </div>
                      }
                    />
                  )
                )
              )}
            </div>
          </div>

          <div className="mx-auto w-full max-w-3xl px-6 pb-5">
            <div className="rounded-2xl border bg-card shadow-[var(--shadow-lift)] focus-within:border-foreground/20">
              <ChatInputAreaInner
                value={input}
                onInput={setInput}
                onSend={() => send()}
                loading={!!runId}
                placeholder={
                  notebookName ? `Message the assistant about ${notebookName}...` : 'Message the assistant...'
                }
                style={{ minHeight: 56, padding: '14px 16px 4px' }}
                variant="borderless"
              />
              <div className="flex items-center gap-3 px-3 pb-3">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5 shrink-0" /> Can use notebooks, sources, Studio and podcasts
                </span>
                <ChatSendButton
                  style={{ flex: 'none', width: 'auto' }}
                  loading={!!runId}
                  onSend={() => send()}
                  onStop={stop}
                  texts={{ send: 'Send', stop: 'Stop', warp: 'New line' }}
                />
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Runs on the local model. Check important facts against the sources.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
