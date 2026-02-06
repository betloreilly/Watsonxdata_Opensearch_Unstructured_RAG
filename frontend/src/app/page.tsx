'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader2, Bot, User, Zap, Layers, ChevronDown, ChevronRight, FileText, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type SearchMode = 'semantic' | 'hybrid'

interface RetrievedDoc {
  rank: number
  score: number
  text: string
  file_path: string
}

interface SearchInfo {
  type: string
  index?: string
  embedding_model?: string
  k?: number
  orchestrator?: string
  note?: string
  query?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  searchType?: SearchMode
  retrievedDocs?: RetrievedDoc[]
  searchInfo?: SearchInfo
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId] = useState(() => crypto.randomUUID())
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid')
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [expandedSearch, setExpandedSearch] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const toggleDocs = (messageId: string) => {
    setExpandedDocs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  const toggleSearch = (messageId: string) => {
    setExpandedSearch(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Choose API endpoint based on search mode
      const endpoint = searchMode === 'semantic' ? '/api/semantic' : '/api/chat'
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: sessionId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
        searchType: data.search_type || searchMode,
        retrievedDocs: data.retrieved_docs,
        searchInfo: data.search_info,
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-xl text-gray-900">BeeHive Bank Support</h1>
              <p className="text-xs text-gray-600">
                Powered by watsonx.data
              </p>
            </div>
          </div>
          
          {/* Search Mode Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button
              onClick={() => setSearchMode('semantic')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                searchMode === 'semantic'
                  ? 'bg-purple-100 text-purple-700 border border-purple-300 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <Zap className="w-4 h-4" />
              Semantic
            </button>
            <button
              onClick={() => setSearchMode('hybrid')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                searchMode === 'hybrid'
                  ? 'bg-teal-100 text-teal-700 border border-teal-300 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              Hybrid
            </button>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="text-center py-20 animate-fade-in">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Bot className="w-10 h-10 text-teal-600" />
              </div>
              <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">
                Ask anything about BeeHive Bank
              </h2>
              <p className="text-gray-600 max-w-md mx-auto mb-8">
                Get help with cards, accounts, transfers, and more.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  'What is the current APR for a personal loan?',
                  "What's the difference between APR and APY?",
                  'How does my credit score affect my APR?',
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-2 rounded-xl bg-white text-gray-700 text-sm hover:bg-gray-50 hover:text-gray-900 transition-all border border-gray-200 shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 message-enter ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        message.searchType === 'semantic'
                          ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                          : 'bg-gradient-to-br from-teal-accent to-ocean'
                      }`}>
                        {message.searchType === 'semantic' ? (
                          <Zap className="w-5 h-5 text-white" />
                        ) : (
                          <Layers className="w-5 h-5 text-white" />
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] ${
                      message.role === 'user'
                        ? 'bg-teal-500 text-white rounded-2xl rounded-tr-md shadow-sm'
                        : 'glass rounded-2xl rounded-tl-md'
                    } px-5 py-4`}
                  >
                    {message.role === 'assistant' && message.searchType && (
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          message.searchType === 'semantic'
                            ? 'bg-purple-100 text-purple-700 border border-purple-200'
                            : 'bg-teal-100 text-teal-700 border border-teal-200'
                        }`}>
                          {message.searchType === 'semantic' ? '⚡ Semantic Search' : '🔀 Hybrid Search'}
                        </span>
                      </div>
                    )}
                    {message.role === 'assistant' ? (
                      <div className="prose-custom">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-white">{message.content}</p>
                    )}
                    
                    {/* Expandable sections for assistant messages */}
                    {message.role === 'assistant' && (message.searchInfo || message.retrievedDocs) && (
                      <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
                        {/* Search Info Expandable */}
                        {message.searchInfo && (
                          <div>
                            <button
                              onClick={() => toggleSearch(message.id)}
                              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                            >
                              {expandedSearch.has(message.id) ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <Search className="w-3 h-3" />
                              Search Query Info
                            </button>
                            {expandedSearch.has(message.id) && (
                              <div className="mt-2 ml-5 p-3 bg-gray-50 rounded-lg text-xs border border-gray-200">
                                <div className="space-y-1 text-gray-600 mb-3">
                                  <p><span className="text-gray-500 font-medium">Type:</span> {message.searchInfo.type}</p>
                                  {message.searchInfo.index && (
                                    <p><span className="text-gray-500 font-medium">Index:</span> {message.searchInfo.index}</p>
                                  )}
                                  {message.searchInfo.embedding_model && (
                                    <p><span className="text-gray-500 font-medium">Embedding:</span> {message.searchInfo.embedding_model}</p>
                                  )}
                                  {message.searchInfo.k && (
                                    <p><span className="text-gray-500 font-medium">Top K:</span> {message.searchInfo.k}</p>
                                  )}
                                  {message.searchInfo.orchestrator && (
                                    <p><span className="text-gray-500 font-medium">Orchestrator:</span> {message.searchInfo.orchestrator}</p>
                                  )}
                                  {message.searchInfo.note && (
                                    <p className="text-gray-500 italic">{message.searchInfo.note}</p>
                                  )}
                                </div>
                                {message.searchInfo.query && (
                                  <div className="mt-3 pt-3 border-t border-gray-200">
                                    <p className="text-gray-700 mb-2 font-medium">Query:</p>
                                    <pre className="bg-gray-900 p-3 rounded-lg overflow-x-auto text-[10px] leading-relaxed text-green-400 font-mono">
                                      {message.searchInfo.query}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Retrieved Documents Expandable */}
                        {message.retrievedDocs && message.retrievedDocs.length > 0 && (
                          <div>
                            <button
                              onClick={() => toggleDocs(message.id)}
                              className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                            >
                              {expandedDocs.has(message.id) ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <FileText className="w-3 h-3" />
                              Retrieved Documents
                            </button>
                            {expandedDocs.has(message.id) && (
                              <div className="mt-2 ml-5 space-y-2 max-h-64 overflow-y-auto">
                                {message.retrievedDocs.map((doc) => (
                                  <div
                                    key={doc.rank}
                                    className="p-3 bg-gray-50 rounded-lg text-xs border border-gray-200"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-purple-600 font-medium">
                                        #{doc.rank}
                                      </span>
                                      <span className="text-gray-500">
                                        Score: {doc.score.toFixed(4)}
                                      </span>
                                    </div>
                                    <p className="text-gray-700 text-xs leading-relaxed">
                                      {doc.text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0">
                      <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center border border-teal-200">
                        <User className="w-5 h-5 text-teal-600" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-4 message-enter">
                  <div className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="glass rounded-2xl rounded-tl-md px-5 py-4">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-teal-500 rounded-full typing-dot" />
                      <div className="w-2 h-2 bg-teal-500 rounded-full typing-dot" />
                      <div className="w-2 h-2 bg-teal-500 rounded-full typing-dot" />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="glass border-t border-gray-200 sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about cards, limits, transfers, disputes..."
              rows={1}
              className="w-full bg-white border border-gray-300 rounded-2xl px-5 py-4 pr-14 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 resize-none transition-all shadow-sm"
              style={{ minHeight: '56px', maxHeight: '200px' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-teal-500/30 transition-all"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
