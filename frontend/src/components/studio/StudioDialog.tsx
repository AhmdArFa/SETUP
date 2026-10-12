'use client'

import { useEffect, useState } from 'react'
import { FileText, Presentation, BarChart3, ListChecks, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { studioApi, StudioDocument, StudioFormat, StudioKind } from '@/lib/api/studio'
import { cn } from '@/lib/utils'

const KINDS: { id: StudioKind; label: string; desc: string; icon: typeof FileText; primary: StudioFormat }[] = [
  { id: 'report', label: 'PDF Report', desc: 'Formal report with cover page and sections', icon: FileText, primary: 'pdf' },
  { id: 'presentation', label: 'Presentation', desc: 'Widescreen PowerPoint slide deck', icon: Presentation, primary: 'pptx' },
  { id: 'infographic', label: 'Infographic', desc: 'One-page visual with key figures', icon: BarChart3, primary: 'svg' },
  { id: 'summary', label: 'Executive Summary', desc: 'Concise summary and key points', icon: ListChecks, primary: 'docx' },
]

const FORMATS: { id: StudioFormat; label: string }[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'Word (DOCX)' },
  { id: 'pptx', label: 'PowerPoint (PPTX)' },
  { id: 'svg', label: 'SVG' },
  { id: 'html', label: 'HTML' },
  { id: 'md', label: 'Markdown' },
  { id: 'txt', label: 'Text' },
  { id: 'json', label: 'JSON' },
]

interface StudioDialogProps {
  notebookId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StudioDialog({ notebookId, open, onOpenChange }: StudioDialogProps) {
  const [kind, setKind] = useState<StudioKind>('report')
  const [instructions, setInstructions] = useState('')
  const [doc, setDoc] = useState<StudioDocument | null>(null)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState<StudioFormat | null>(null)
  const [svgPreview, setSvgPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!doc || doc.kind !== 'infographic') {
      setSvgPreview(null)
      return
    }
    let url: string | null = null
    studioApi.render(doc, 'svg').then(({ blob }) => {
      url = URL.createObjectURL(blob)
      setSvgPreview(url)
    }).catch(() => setSvgPreview(null))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [doc])

  const generate = async () => {
    setGenerating(true)
    setDoc(null)
    try {
      const result = await studioApi.generate({ notebook_id: notebookId, kind, instructions: instructions || undefined })
      setDoc(result)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Generation failed. Check that the local model is running.')
    } finally {
      setGenerating(false)
    }
  }

  const download = async (format: StudioFormat) => {
    if (!doc) return
    setDownloading(format)
    try {
      const { blob, filename } = await studioApi.render(doc, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(`Could not export ${format.toUpperCase()}`)
    } finally {
      setDownloading(null)
    }
  }

  const primary = KINDS.find((k) => k.id === (doc?.kind ?? kind))!.primary

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">MCIT Studio</DialogTitle>
          <DialogDescription>
            Generate professional, MCIT-branded outputs from this notebook&apos;s sources and notes using the local model.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              disabled={generating}
              className={cn(
                'text-left rounded-md border p-3 flex flex-col gap-1.5 transition-colors',
                kind === k.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'
              )}
            >
              <k.icon className={cn('h-5 w-5', kind === k.id ? 'text-gold' : 'text-muted-foreground')} />
              <span className="font-semibold text-sm">{k.label}</span>
              <span className="text-xs text-muted-foreground">{k.desc}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional instructions, e.g. focus on budget figures, audience is senior leadership..."
            rows={2}
            disabled={generating}
          />
          <div className="flex items-center gap-3">
            <Button onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : doc ? <RefreshCw className="h-4 w-4 mr-2" /> : null}
              {generating ? 'Generating with local model...' : doc ? 'Regenerate' : 'Generate'}
            </Button>
            {generating && (
              <span className="text-xs text-muted-foreground">This can take a few minutes on CPU-only hardware.</span>
            )}
          </div>
        </div>

        {doc && (
          <div className="flex flex-col gap-4 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold mr-2">Download</span>
              {FORMATS.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={f.id === primary ? 'default' : 'outline'}
                  onClick={() => download(f.id)}
                  disabled={downloading !== null}
                >
                  {downloading === f.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                  {f.label}
                </Button>
              ))}
            </div>

            {svgPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={svgPreview} alt="Infographic preview" className="w-full max-w-xl mx-auto border rounded-md" />
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="bg-primary text-white px-5 py-4 border-b-4 border-gold">
                  <div className="text-[11px] font-bold tracking-widest text-gold uppercase">
                    {KINDS.find((k) => k.id === doc.kind)?.label}
                  </div>
                  <div className="text-xl font-bold">{doc.title}</div>
                  {doc.subtitle && <div className="text-sm opacity-90">{doc.subtitle}</div>}
                </div>
                <div className="p-5 flex flex-col gap-4 text-sm">
                  {doc.summary && <p>{doc.summary}</p>}
                  {doc.stats.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {doc.stats.map((s, i) => (
                        <div key={i} className="border border-t-4 border-t-primary p-3">
                          <div className="text-lg font-bold text-primary">{s.value}</div>
                          <div className="text-xs text-muted-foreground">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {doc.key_points.length > 0 && (
                    <ul className="list-disc pl-5 flex flex-col gap-1">
                      {doc.key_points.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  )}
                  {doc.sections.map((s, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <h4 className="font-semibold text-primary border-l-4 border-gold pl-2">{s.heading}</h4>
                      {s.body && <p>{s.body}</p>}
                      {s.bullets.length > 0 && (
                        <ul className="list-disc pl-5">{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                      )}
                    </div>
                  ))}
                  {doc.recommendations.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <h4 className="font-semibold text-primary border-l-4 border-gold pl-2">Recommendations</h4>
                      <ol className="list-decimal pl-5">{doc.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ol>
                    </div>
                  )}
                  {doc.conclusion && <p className="italic text-muted-foreground">{doc.conclusion}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
