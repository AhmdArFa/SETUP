import { apiClient } from './client'

export interface AgentFile {
  id: string
  filename: string
  format: string
  kind: string
  title: string
  notebook_id?: string | null
  notebook_name?: string
  theme?: string
  size: number
  created: string
}

export type AgentEvent =
  | { seq: number; type: 'thinking'; step: number }
  | { seq: number; type: 'tool_call'; name: string; args: Record<string, unknown>; call_id?: string }
  | { seq: number; type: 'tool_result'; name: string; ok: boolean; result: string; call_id?: string }
  | { seq: number; type: 'file'; file: AgentFile }
  | { seq: number; type: 'message'; content: string }
  | { seq: number; type: 'error'; message: string }

export interface AgentRun {
  id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  events: AgentEvent[]
}

export interface Skill {
  id: string
  name: string
  description: string
  instructions: string
  source_url: string
  enabled: boolean
  builtin: boolean
}

export const agentApi = {
  start: async (messages: { role: 'user' | 'assistant'; content: string }[], notebookId?: string) => {
    const res = await apiClient.post<{ id: string; status: string }>('/agent/runs', {
      messages,
      notebook_id: notebookId || null,
    })
    return res.data
  },
  poll: async (runId: string, after: number) => {
    const res = await apiClient.get<AgentRun>(`/agent/runs/${runId}`, { params: { after } })
    return res.data
  },
  cancel: async (runId: string) => {
    await apiClient.post(`/agent/runs/${runId}/cancel`)
  },
  listSkills: async () => (await apiClient.get<Skill[]>('/agent/skills')).data,
  createSkill: async (s: { name: string; instructions: string; description?: string; source_url?: string }) =>
    (await apiClient.post<Skill>('/agent/skills', s)).data,
  updateSkill: async (id: string, s: Partial<Skill>) => (await apiClient.patch<Skill>(`/agent/skills/${id}`, s)).data,
  deleteSkill: async (id: string) => {
    await apiClient.delete(`/agent/skills/${id}`)
  },
}

export const filesApi = {
  list: async (notebookId?: string) =>
    (await apiClient.get<AgentFile[]>('/studio/files', { params: notebookId ? { notebook_id: notebookId } : {} })).data,
  blob: async (id: string) =>
    (await apiClient.get(`/studio/files/${id}/download`, { responseType: 'blob' })).data as Blob,
  remove: async (id: string) => {
    await apiClient.delete(`/studio/files/${id}`)
  },
  download: async (file: AgentFile) => {
    const blob = await filesApi.blob(file.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
