'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Segmented, SliderWithInput, Switch } from '@lobehub/ui/base-ui'
import { BarChart3, Check, FileText, ListChecks, Loader2, Presentation, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FileCard } from '@/components/files/FileCard'
import { AgentFile } from '@/lib/api/agent'
import { studioApi, StudioDocument, StudioFormat, StudioKind, StudioOptions } from '@/lib/api/studio'
import { cn } from '@/lib/utils'
import { useLobeScopeClass } from '@/components/providers/LobeProvider'

const KINDS: { id: StudioKind; label: string; desc: string; icon: typeof FileText }[] = [
  { id: 'presentation', label: 'Presentation', desc: 'Widescreen PowerPoint deck', icon: Presentation },
  { id: 'report', label: 'Report', desc: 'Formal PDF with cover', icon: FileText },
  { id: 'infographic', label: 'Infographic', desc: 'One-page visual', icon: BarChart3 },
  { id: 'summary', label: 'Executive summary', desc: 'Short Word brief', icon: ListChecks },
]

const FORMATS: { id: StudioFormat; label: string }[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'Word' },
  { id: 'pptx', label: 'PowerPoint' },
  { id: 'svg', label: 'SVG' },
  { id: 'html', label: 'HTML' },
  { id: 'md', label: 'Markdown' },
  { id: 'txt', label: 'Text' },
]

const DEFAULT_FORMAT: Record<StudioKind, StudioFormat> = { report: 'pdf', presentation: 'pptx', infographic: 'svg', summary: 'docx' }

const DEFAULT_OPTIONS: StudioOptions = {
  theme: 'graphite',
  slide_count: 10,
  length: 'standard',
  audience: 'senior leadership',
  tone: 'formal',
  speaker_notes: true,
  include_sources: true,
  instructions: '',
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

interface StudioDialogProps {
  notebookId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StudioDialog({ notebookId, open, onOpenChange }: StudioDialogProps) {
  const qc = useQueryClient()
  const lobeScope = useLobeScopeClass()
  const { data: meta } = useQuery({ queryKey: ['studio-meta'], queryFn: studioApi.meta, enabled: open })
  const [kind, setKind] = useState<StudioKind>('presentation')
  const [opts, setOpts] = useState<StudioOptions>(DEFAULT_OPTIONS)
  const [formats, setFormats] = useState<StudioFormat[]>(['pptx'])
  const [doc, setDoc] = useState<StudioDocument | null>(null)
  const [files, setFiles] = useState<AgentFile[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFormats([DEFAULT_FORMAT[kind]])
  }, [kind])

  const set = <K extends keyof StudioOptions>(k: K, v: StudioOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))

  const saveFormats = async (d: StudioDocument, fmts: StudioFormat[]) => {
    setSaving(true)
    try {
      const out = await studioApi.save(d, fmts, notebookId)
      setFiles((prev) => [...out, ...prev])
      qc.invalidateQueries({ queryKey: ['studio-files'] })
    } catch {
      toast.error('Could not render the files')
    } finally {
      setSaving(false)
    }
  }

  const generate = async () => {
    if (!formats.length) {
      toast.error('Pick at least one format')
      return
    }
    setGenerating(true)
    setDoc(null)
    setFiles([])
    try {
      const result = await studioApi.generate({ notebook_id: notebookId, kind, options: { ...opts, instructions: opts.instructions || null } })
      setDoc(result)
      await saveFormats(result, formats)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Generation failed. Check that the local model is running.')
    } finally {
      setGenerating(false)
    }
  }

  const toggleFormat = (f: StudioFormat) =>
    setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-5xl', lobeScope)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4" /> Studio
          </DialogTitle>
          <DialogDescription>Turn this notebook into a finished document. Everything runs on the local model.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
          {/* Controls */}
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  disabled={generating}
                  onClick={() => setKind(k.id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors',
                    kind === k.id ? 'border-foreground/25 bg-muted' : 'hover:bg-muted/50'
                  )}
                >
                  <k.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{k.label}</span>
                  <span className="text-xs text-muted-foreground">{k.desc}</span>
                </button>
              ))}
            </div>

            <Field label="Style">
              <div className="grid grid-cols-3 gap-2">
                {(meta?.themes ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.description}
                    onClick={() => set('theme', t.id)}
                    className={cn(
                      'flex flex-col gap-2 rounded-xl border p-2 text-left transition-colors',
                      opts.theme === t.id ? 'border-foreground/30 bg-muted' : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="flex h-8 overflow-hidden rounded-md">
                      <span className="flex-[3]" style={{ background: `#${t.colors[0]}` }} />
                      <span className="flex-[2]" style={{ background: `#${t.colors[3]}` }} />
                      <span className="flex-1" style={{ background: `#${t.colors[2]}` }} />
                    </div>
                    <span className="flex items-center justify-between text-xs font-medium">
                      {t.name}
                      {opts.theme === t.id && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            {kind === 'presentation' ? (
              <Field label="Number of slides" hint="Includes the cover, agenda and closing slides.">
                <SliderWithInput min={4} max={20} step={1} value={opts.slide_count} onChange={(v) => set('slide_count', Number(v) || 10)} />
              </Field>
            ) : (
              <Field label="Length">
                <Segmented
                  block
                  value={opts.length}
                  onChange={(v) => set('length', v as StudioOptions['length'])}
                  options={[{ label: 'Brief', value: 'brief' }, { label: 'Standard', value: 'standard' }, { label: 'Detailed', value: 'detailed' }]}
                />
              </Field>
            )}

            <Field label="Tone">
              <Segmented
                block
                value={opts.tone}
                onChange={(v) => set('tone', v as StudioOptions['tone'])}
                options={[{ label: 'Formal', value: 'formal' }, { label: 'Neutral', value: 'neutral' }, { label: 'Persuasive', value: 'persuasive' }, { label: 'Plain', value: 'plain' }]}
              />
            </Field>

            <Field label="Audience">
              <Input value={opts.audience} onChange={(e) => set('audience', e.target.value)} className="rounded-lg" />
            </Field>

            <Field label="Instructions (optional)">
              <Textarea
                rows={2}
                value={opts.instructions ?? ''}
                onChange={(e) => set('instructions', e.target.value)}
                placeholder="Focus on budget figures; compare 2024 with 2025..."
                className="rounded-lg"
              />
            </Field>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {kind === 'presentation' && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch size="small" checked={opts.speaker_notes} onChange={(v) => set('speaker_notes', v)} /> Speaker notes
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Switch size="small" checked={opts.include_sources} onChange={(v) => set('include_sources', v)} /> List sources
              </label>
            </div>

            <Field label="Formats">
              <div className="flex flex-wrap gap-1.5">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFormat(f.id)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                      formats.includes(f.id) ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Field>

            <Button onClick={generate} disabled={generating} className="h-10 rounded-xl">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : doc ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {generating ? 'Generating with the local model...' : doc ? 'Generate again' : 'Generate'}
            </Button>
          </div>

          {/* Result */}
          <div className="flex min-h-[420px] flex-col gap-3 rounded-2xl bg-muted/50 p-4">
            {!doc && !generating && (
              <div className="m-auto max-w-xs text-center text-sm text-muted-foreground">
                Pick an output, a style and the formats you need. The files appear here and in Files.
              </div>
            )}
            {generating && (
              <div className="m-auto flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Writing the content. This takes one to four minutes on CPU.
              </div>
            )}
            {doc && (
              <>
                <div className="flex flex-col gap-2">
                  {files.map((f) => (
                    <FileCard key={f.id} file={f} />
                  ))}
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering files
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  Add format:
                  {FORMATS.filter((f) => !files.some((x) => x.format === f.id)).map((f) => (
                    <button key={f.id} type="button" disabled={saving} onClick={() => saveFormats(doc, [f.id])} className="rounded-md border bg-background px-2 py-0.5 hover:bg-muted">
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-3 overflow-y-auto rounded-xl bg-background p-4 text-sm">
                  <div>
                    <div className="text-lg font-semibold leading-snug">{doc.title}</div>
                    {doc.subtitle && <div className="text-muted-foreground">{doc.subtitle}</div>}
                  </div>
                  {doc.summary && <p className="leading-relaxed">{doc.summary}</p>}
                  {doc.kind === 'presentation' ? (
                    <ol className="flex flex-col gap-2">
                      {doc.slides.map((s, i) => (
                        <li key={i} className="flex gap-3 rounded-lg border p-3">
                          <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="font-medium">{s.title}</span>
                            <span className="text-xs text-muted-foreground">{s.layout.replace('_', ' ')}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    doc.sections.map((s, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="font-medium">{s.heading}</span>
                        {s.body && <p className="text-muted-foreground">{s.body}</p>}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
