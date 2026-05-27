import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, ArrowDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: any;
}

interface ChatPageProps {
  messages: ChatMessage[];
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

export function ChatPage({
  messages,
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#161312] flex flex-col h-[100dvh]"
    >
      <header className="sticky top-0 w-full bg-[#161312]/95 backdrop-blur-md border-b border-zinc-800/60 px-4 py-3 flex items-center justify-between z-10 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

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

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-500 text-sm">No messages yet. Start a conversation.</p>
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
    </motion.div>
  );
}
