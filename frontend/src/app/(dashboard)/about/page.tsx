'use client'

import { AppShell } from '@/components/layout/AppShell'

const FEATURES = [
  'Source ingestion: PDF, video, audio and web pages',
  'Chat with your sources, with citations',
  'MCIT Studio: PDF reports, PowerPoint presentations, infographics and executive summaries (PDF, DOCX, PPTX, SVG, HTML, MD)',
  'Research podcast generation with local text-to-speech (Kokoro)',
  'Vector and full-text search',
  'Notebook management',
  'Local LLM inference via Ollama (qwen2.5:7b) — no cloud API keys required',
]

export default function AboutPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl flex flex-col gap-6">
          <div className="border-l-4 border-gold pl-4">
            <h1 className="font-display text-2xl font-bold tracking-tight text-primary">MCIT LM</h1>
            <p className="text-sm text-muted-foreground">Ministry of Communications and Information Technology</p>
          </div>

          <section className="rounded-md border bg-card p-5 flex flex-col gap-3">
            <h2 className="font-semibold">About</h2>
            <p className="text-sm text-muted-foreground">
              MCIT LM is a self-hosted, privacy-focused AI research assistant. All inference runs on a
              local Ollama server, so documents never leave your infrastructure.
            </p>
            <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
              {FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-md border bg-card p-5 flex flex-col gap-2">
            <h2 className="font-semibold">Credits</h2>
            <p className="text-sm">
              Developed by <span className="font-semibold text-primary">eng. Ahmed Arfa</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Based on{' '}
              <a className="underline text-primary" href="https://github.com/lfnovo/open-notebook" target="_blank" rel="noreferrer">
                Open Notebook
              </a>{' '}
              by Luis Novo and contributors, used under the MIT License.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
