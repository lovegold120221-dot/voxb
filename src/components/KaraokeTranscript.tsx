import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

export function KaraokeTranscript({ role, text, name }: { role: 'user' | 'model', text: string, name: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        left: scrollRef.current.scrollWidth,
        behavior: 'smooth'
      });
    }
  }, [text]);

  const words = text.split(' ').filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex items-center w-full max-w-5xl mx-auto px-8 ${role === 'model' ? 'text-amber-500 font-serif italic justify-start' : 'text-gray-300 font-sans justify-end'}`}
    >
      {role === 'model' && (
        <span className="shrink-0 font-bold opacity-50 text-xs uppercase tracking-widest mr-4 align-middle whitespace-nowrap">
          {name}
        </span>
      )}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-x-hidden whitespace-nowrap py-4 flex scroll-smooth"
        style={{
           maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
           WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
           justifyContent: role === 'user' ? 'flex-end' : 'flex-start'
        }}
      >
        <div className="inline-flex items-center pr-[50%]">
          {words.map((word, i) => (
            <motion.span
              key={`${role}-${i}`} // use index as key since words append
              initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.2 }}
              className={`inline-block mx-1 ${role === 'model' ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-3xl'}`}
              style={{
                opacity: i < words.length - 2 ? 0.6 : 1,
                textShadow: i >= words.length - 2 ? (role === 'model' ? '0 0 20px rgba(245,158,11,0.6)' : '0 0 15px rgba(255,255,255,0.4)') : 'none',
              }}
            >
              {word}
            </motion.span>
          ))}
        </div>
      </div>
      {role === 'user' && (
        <span className="shrink-0 font-bold opacity-50 text-xs uppercase tracking-widest ml-4 align-middle whitespace-nowrap">
          {name}
        </span>
      )}
    </motion.div>
  );
}
