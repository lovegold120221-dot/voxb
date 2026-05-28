import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, ArrowDown, MessageSquare, ChevronLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sessionId?: string;
  timestamp: any;
}

interface SessionSummary {
  id: string;
  startTime: Date;
  endTime: Date;
  preview: string;
  count: number;
}

interface ChatPageProps {
  messages: ChatMessage[];
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  chatInput: string;
  setChatInput: (val: string) => void;
  onSend: (e: React.FormEvent) => void;
  onClose: () => void;
  isActive: boolean;
  personaName: string;
  userName: string;
}

const formatTime = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const formatSessionDate = (d: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export function ChatPage({
  messages,
  sessions,
  selectedSessionId,
  onSelectSession,
  chatInput,
  setChatInput,
  onSend,
  onClose,
  isActive,
  personaName,
  userName,
}: ChatPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevMsgCount = useRef(messages.length);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const currentSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#161312] flex flex-col h-[100dvh]"
    >
      <header className="sticky top-0 w-full bg-[#161312]/95 backdrop-blur-md border-b border-zinc-800/60 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2">
          {!showSidebar && (
            <button
              onClick={() => setShowSidebar(true)}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center flex flex-col items-center">
          <h1 className="text-lg font-semibold tracking-wide text-[#d0a78b]">{personaName}</h1>
          <div className="flex items-center gap-1.5 -mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[9px] text-zinc-500 tracking-wider uppercase">
              {isActive ? 'online' : 'offline'}
            </span>
          </div>
        </div>

        <div className="w-9" />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sessions sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="border-r border-zinc-800/60 overflow-hidden shrink-0 bg-black/20"
            >
              <div className="w-[240px] h-full flex flex-col">
                <div className="px-4 py-3 border-b border-zinc-800/40">
                  <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Sessions</h2>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                  {sessions.length === 0 && (
                    <p className="text-[11px] text-zinc-600 text-center px-3 py-8">
                      No conversations yet
                    </p>
                  )}
                  {sessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => {
                        onSelectSession(session.id);
                        if (window.innerWidth < 768) setShowSidebar(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                        session.id === selectedSessionId
                          ? 'bg-[#d0a78b]/10 border border-[#d0a78b]/20'
                          : 'hover:bg-zinc-800/40 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                          session.id === selectedSessionId ? 'text-[#d0a78b]' : 'text-zinc-400'
                        }`}>
                          {formatSessionDate(session.startTime)}
                        </span>
                        <span className="text-[9px] text-zinc-600">
                          {session.count} msgs
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate leading-relaxed">
                        {session.preview || 'Empty session'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-zinc-600">
                          {session.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {session.id === (messages.length > 0 ? messages[messages.length - 1]?.sessionId : null) && (
                          <span className="text-[8px] uppercase tracking-widest text-emerald-500 font-bold">
                            current
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="absolute left-2 top-16 z-20 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>
        )}

        {/* Messages */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {currentSession && (
            <div className="px-4 py-2 border-b border-zinc-800/40 bg-black/10 shrink-0">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                {formatSessionDate(currentSession.startTime)} &middot; {currentSession.count} messages
                {currentSession.id === (messages.length > 0 ? messages[messages.length - 1]?.sessionId : null) && isActive && (
                  <span className="text-emerald-500 ml-2">&bull; Live</span>
                )}
              </p>
            </div>
          )}

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth"
          >
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-zinc-500 text-sm">No messages in this session.</p>
                  {isActive && (
                    <p className="text-zinc-600 text-xs mt-1">Start a conversation to see messages here.</p>
                  )}
                </div>
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[#d0a78b]/15 border border-[#d0a78b]/20 text-zinc-200'
                        : 'bg-zinc-900/80 border border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${msg.role === 'user' ? 'text-[#d0a78b]' : 'text-zinc-400'}`}>
                        {msg.role === 'user' ? userName : personaName}
                      </span>
                      <span className="text-[9px] text-zinc-600">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <div className={`text-sm leading-relaxed prose prose-invert prose-sm max-w-none ${msg.role === 'model' ? 'text-zinc-300' : ''}`}>
                      {msg.role === 'model' ? (
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          <AnimatePresence>
            {showScrollBtn && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={scrollToBottom}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center shadow-lg z-10 hover:bg-zinc-700 transition-colors"
              >
                <ArrowDown className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>

          <footer className="sticky bottom-0 w-full bg-[#161312]/95 backdrop-blur-md border-t border-zinc-800/60 px-4 py-3 z-10 shrink-0">
            <form onSubmit={onSend} className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={isActive ? `Message ${personaName}...` : 'Session not active. Start voice first.'}
                disabled={!isActive}
                className="flex-1 bg-zinc-900/90 text-sm text-white px-4 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-[#d0a78b]/50 placeholder-zinc-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!isActive || !chatInput.trim()}
                className="w-11 h-11 rounded-xl bg-[#d0a78b] text-black flex items-center justify-center hover:bg-[#ebd0bc] transition-colors disabled:opacity-30 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </footer>
        </div>
      </div>
    </motion.div>
  );
}