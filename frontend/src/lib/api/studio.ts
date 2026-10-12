import { apiClient } from './client'

export type StudioKind = 'report' | 'presentation' | 'infographic' | 'summary'
export type StudioFormat = 'pdf' | 'docx' | 'pptx' | 'svg' | 'html' | 'md' | 'txt' | 'json'

export interface StudioDocument {
  kind: StudioKind
  title: string
  subtitle: string
  summary: string
  key_points: string[]
  stats: { value: string; label: string }[]
  sections: { heading: string; body: string; bullets: string[] }[]
  recommendations: string[]
  conclusion: string
  sources: string[]
  notebook_name: string
  generated_at: string
}

export const studioApi = {
  generate: async (params: {
    notebook_id: string
    kind: StudioKind
    instructions?: string
    model_id?: string
  }): Promise<StudioDocument> => {
    const res = await apiClient.post<StudioDocument>('/studio/generate', params)
    return res.data
  },

  render: async (document: StudioDocument, format: StudioFormat): Promise<{ blob: Blob; filename: string }> => {
    const res = await apiClient.post('/studio/render', { document, format }, { responseType: 'blob' })
    const disposition = String(res.headers['content-disposition'] || '')
    const match = disposition.match(/filename="([^"]+)"/)
    return { blob: res.data as Blob, filename: match?.[1] || `MCIT-LM-${document.kind}.${format}` }
  },
}
