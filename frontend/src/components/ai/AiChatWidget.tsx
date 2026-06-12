import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  ChevronDown,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { aiChatApi, type ChatMessage, type ChatSession } from '../../api/aiChat'

// ── Quick prompt suggestions ─────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { label: 'Tổng quan hệ thống', text: 'Cho tôi xem tổng quan hệ thống IOC hôm nay' },
  { label: 'Nhiệm vụ quá hạn', text: 'Có bao nhiêu nhiệm vụ quá hạn hiện tại?' },
  { label: 'Báo cáo tuần', text: 'Tổng hợp báo cáo tuần này cho tôi' },
  { label: 'Tiến độ NQ57', text: 'Tiến độ Nghị quyết 57 hiện tại thế nào?' },
  { label: 'Chỉ tiêu KPI', text: 'Tình hình chỉ tiêu KPI năm nay ra sao?' },
  { label: 'Ngân sách', text: 'Tổng hợp tình hình ngân sách và giải ngân năm nay' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function ToolBadge({ tools }: { tools: string[] }) {
  if (!tools.length) return null
  const labels: Record<string, string> = {
    get_dashboard_summary: 'Tổng quan',
    get_tasks: 'Nhiệm vụ',
    get_overdue_tasks: 'Quá hạn',
    get_upcoming_tasks: 'Sắp hạn',
    get_nq57_progress: 'NQ57',
    get_targets: 'KPI',
    get_target_progress: 'KPI chi tiết',
    get_budget_summary: 'Ngân sách',
    get_documents: 'Văn bản',
    search_documents: 'Tìm văn bản',
    summarize_document: 'Tóm tắt VB',
    generate_weekly_report: 'Báo cáo tuần',
    generate_monthly_report: 'Báo cáo tháng',
    generate_quarterly_report: 'Báo cáo quý',
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {[...new Set(tools)].map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100"
        >
          <Sparkles size={8} />
          {labels[t] ?? t}
        </span>
      ))}
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const toolsArr: string[] = (() => {
    if (!msg.tools_used) return []
    try { return JSON.parse(msg.tools_used) } catch { return [] }
  })()

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mr-2 mt-0.5 shadow-sm">
          <Bot size={14} className="text-white" />
        </div>
      )}
      <div className={`max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-br-sm shadow-sm shadow-indigo-500/20'
              : 'bg-white text-slate-700 border border-slate-100 rounded-bl-sm shadow-sm'
          }`}
        >
          {msg.content}
        </div>
        {!isUser && toolsArr.length > 0 && <ToolBadge tools={toolsArr} />}
        <span className="text-[10px] text-slate-400 mt-1 px-1">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mr-2 mt-0.5 shadow-sm">
        <Bot size={14} className="text-white" />
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="text-xs text-slate-400 ml-1">Đang xử lý...</span>
        </div>
      </div>
    </div>
  )
}

// ── Session sidebar ────────────────────────────────────────────────────────────

function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loading,
}: {
  sessions: ChatSession[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  loading: boolean
}) {
  return (
    <div className="w-52 border-r border-slate-100 flex flex-col bg-slate-50/80 shrink-0">
      <div className="p-3 border-b border-slate-100">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
        >
          <Plus size={13} />
          Hội thoại mới
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="text-slate-400 animate-spin" />
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
              activeId === s.id
                ? 'bg-indigo-50 border border-indigo-100 text-indigo-700'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
            onClick={() => onSelect(s.id)}
          >
            <MessageSquare size={12} className="shrink-0 opacity-60" />
            <span className="text-[11px] flex-1 truncate leading-snug">{s.title ?? 'Hội thoại'}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {!loading && sessions.length === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-4">Chưa có hội thoại nào</p>
        )}
      </div>
    </div>
  )
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export default function AiChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [aiReady, setAiReady] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Check AI status on open
  useEffect(() => {
    if (open) {
      aiChatApi.getStatus()
        .then((s) => setAiReady(s.ready))
        .catch(() => setAiReady(false))
    }
  }, [open])

  // Load sessions when sidebar opens
  useEffect(() => {
    if (showSidebar) loadSessions()
  }, [showSidebar])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // Focus input when chat opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      const data = await aiChatApi.listSessions()
      setSessions(data.items)
    } catch { /* ignore */ }
    finally { setSessionsLoading(false) }
  }

  const selectSession = async (id: number) => {
    try {
      const detail = await aiChatApi.getSession(id)
      setActiveSessionId(id)
      setMessages(detail.messages)
      setShowSidebar(false)
    } catch { setError('Không tải được hội thoại') }
  }

  const startNewSession = () => {
    setActiveSessionId(null)
    setMessages([])
    setShowSidebar(false)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const deleteSession = async (id: number) => {
    try {
      await aiChatApi.deleteSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeSessionId === id) startNewSession()
    } catch { setError('Không xóa được hội thoại') }
  }

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || thinking) return
    setInput('')
    setError(null)

    // Optimistic user message
    const optimistic: ChatMessage = {
      id: Date.now(),
      session_id: activeSessionId ?? 0,
      role: 'user',
      content,
      tools_used: null,
      input_tokens: 0,
      output_tokens: 0,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    setThinking(true)

    try {
      const res = await aiChatApi.sendMessage(content, activeSessionId ?? undefined)
      setActiveSessionId(res.session_id)
      // Replace optimistic + add AI reply
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        { ...optimistic, session_id: res.session_id },
        res.message,
      ])
      // Refresh session list title
      if (!activeSessionId) loadSessions()
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setError(e?.response?.data?.detail ?? 'Lỗi kết nối. Vui lòng thử lại.')
    } finally {
      setThinking(false)
    }
  }, [input, thinking, activeSessionId])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const isEmptyChat = messages.length === 0 && !thinking

  return (
    <>
      {/* Floating toggle button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-4 md:bottom-20 md:right-6 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        whileTap={{ scale: 0.92 }}
        title="Trợ lý AI IOC"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <ChevronDown size={20} />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Bot size={20} />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full ring-2 ring-indigo-400/40 animate-ping" style={{ animationDuration: '2s' }} />
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-40 right-4 md:bottom-36 md:right-6 z-50 w-[calc(100vw-32px)] md:w-[680px] h-[70vh] md:h-[600px] bg-white rounded-2xl shadow-2xl shadow-slate-400/20 border border-slate-200/80 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-purple-600 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-none">Trợ lý AI IOC</p>
                  <p className="text-[10px] text-indigo-200 leading-none mt-0.5">
                    {aiReady ? '● Sẵn sàng · Gemini 2.5 Flash' : '○ Chưa cấu hình GEMINI_API_KEY'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setShowSidebar((v) => !v); if (!showSidebar) loadSessions() }}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title="Lịch sử hội thoại"
                >
                  <Clock size={15} />
                </button>
                <button
                  onClick={startNewSession}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  title="Hội thoại mới"
                >
                  <Plus size={15} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Body: sidebar + messages */}
            <div className="flex flex-1 overflow-hidden">
              {/* Session sidebar */}
              <AnimatePresence>
                {showSidebar && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 208, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden shrink-0"
                  >
                    <SessionSidebar
                      sessions={sessions}
                      activeId={activeSessionId}
                      onSelect={selectSession}
                      onNew={startNewSession}
                      onDelete={deleteSession}
                      loading={sessionsLoading}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0">
                  {/* Welcome screen */}
                  {isEmptyChat && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 pb-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center border border-indigo-100">
                        <Sparkles size={24} className="text-indigo-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700">Trợ lý AI Điều hành</p>
                        <p className="text-xs text-slate-400 mt-1">Hỏi về nhiệm vụ, văn bản, KPI, ngân sách, báo cáo...</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                        {QUICK_PROMPTS.map((p) => (
                          <button
                            key={p.label}
                            onClick={() => sendMessage(p.text)}
                            disabled={!aiReady}
                            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-xs text-slate-600 hover:text-indigo-700 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message list */}
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                  {thinking && <ThinkingIndicator />}

                  {/* Error banner */}
                  {error && (
                    <div className="mx-auto max-w-sm mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 text-center">
                      {error}
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>

                {/* Input area */}
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
                  {!aiReady && (
                    <div className="mb-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700 text-center">
                      AI chưa cấu hình — thêm GEMINI_API_KEY vào file .env
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={thinking || !aiReady}
                      placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
                      rows={1}
                      className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all disabled:opacity-50 max-h-24 overflow-y-auto"
                      style={{ height: 'auto', minHeight: '42px' }}
                      onInput={(e) => {
                        const t = e.currentTarget
                        t.style.height = 'auto'
                        t.style.height = Math.min(t.scrollHeight, 96) + 'px'
                      }}
                    />
                    <button
                      onClick={() => sendMessage()}
                      disabled={!input.trim() || thinking || !aiReady}
                      className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 flex items-center justify-center transition-colors shrink-0"
                    >
                      {thinking ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                    Dữ liệu từ hệ thống IOC · Gemini 2.5 Flash · Không lưu trữ bên ngoài
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
