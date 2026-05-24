import apiClient from './client'

export interface ChatMessage {
  id: number
  session_id: number
  role: 'user' | 'assistant'
  content: string
  tools_used: string | null
  input_tokens: number
  output_tokens: number
  created_at: string
}

export interface ChatSession {
  id: number
  title: string | null
  created_at: string
  updated_at: string
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[]
}

export interface ChatResponse {
  session_id: number
  message: ChatMessage
  tool_results: { tools_called: string[] }
}

export interface SessionListResponse {
  total: number
  items: ChatSession[]
}

export interface AiStatus {
  ready: boolean
  model: string
  tools: number
  configured: boolean
}

const BASE = '/ai-chat'

export const aiChatApi = {
  sendMessage: (content: string, session_id?: number) =>
    apiClient
      .post<ChatResponse>(`${BASE}/chat`, { content, session_id: session_id ?? null })
      .then((r) => r.data),

  listSessions: (skip = 0, limit = 20) =>
    apiClient
      .get<SessionListResponse>(`${BASE}/sessions`, { params: { skip, limit } })
      .then((r) => r.data),

  getSession: (sessionId: number) =>
    apiClient
      .get<ChatSessionDetail>(`${BASE}/sessions/${sessionId}`)
      .then((r) => r.data),

  deleteSession: (sessionId: number) =>
    apiClient.delete(`${BASE}/sessions/${sessionId}`),

  getStatus: () =>
    apiClient.get<AiStatus>(`${BASE}/status`).then((r) => r.data),
}
