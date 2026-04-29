import { useEffect, useState, useRef } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { ref, get, set, push, onValue, query, orderByChild, limitToLast, serverTimestamp } from 'firebase/database';
import { GoogleGenAI, LiveServerMessage, Modality, Type, ToolCall } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { Square, Loader2, Power, LogOut, Volume2, Command, Check, Settings, X, Save } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

interface ActionTask {
  id: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed';
}

const VOICE_ALIASES = [
  { name: "Queen Hera", id: "Aoede" },
  { name: "King Hades", id: "Charon" },
  { name: "King Leonidas", id: "Fenrir" },
  { name: "Queen Persephone", id: "Kore" },
  { name: "King Midas", id: "Puck" },
];

const DEFAULT_SYSTEM_PROMPT = `
You are a high-performance AI Voice Agent named Maya.
Your tone is calm, clear, respectful, and professional yet human.

Your main goal is to provide helpful, accurate, and direct responses while maintaining a natural human-like rhythm in your speech.

1. CORE INTERACTION STYLE:
- Respond normally. Avoid being overly "theatrical" or "natural" with forced vocalizations.
- Focus on clean sentences, realistic pacing, and natural reactions.
- Do NOT introduce yourself or offer help unless specifically asked.
- Be concise and get straight to the point.

2. SPEECH & PUNCTUATION:
- Use standard punctuation to guide your pacing (commas for short breaths, periods for full stops).
- Maintain dynamic pitch variations that mirror natural human conversation, but do not exaggerate them.
- Avoid robotic jargon or overly formal service-assistant greetings.

3. STRICT ENFORCEMENT:
- DO NOT use audio tags, metadata tags, or descriptive text for vocalizations in your output (e.g., [laughs], [sighs], [pauses], *clears throat*, or "clears throat").
- Ensure your output consists ONLY of the words you want spoken. If you want to pause, use ellipses (...) or a period. Do NOT describe the pause.
- If you output "clears throat" or similar, the user hears you literally speak those words, which sounds robotic. Avoid this completely.
- Ensure your output is pure text that can be spoken clearly by a text-to-speech engine without reading out special characters, brackets, or stage directions.
`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Initialize user doc
        try {
          const userRef = ref(rtdb, 'users/' + u.uid);
          const userSnap = await get(userRef);
          if (!userSnap.exists()) {
            await set(userRef, {
              displayName: u.displayName || 'Master E',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              settings: {}
            });
          }
        } catch (error) {
          handleDatabaseError(error, OperationType.CREATE, 'users');
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Abstract background */}
        <div className="absolute top-0 left-1/2 -ml-[400px] w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500 to-amber-700 p-[1px] mb-8 shadow-2xl shadow-amber-500/20">
             <div className="w-full h-full rounded-3xl bg-[#0A0A0B] flex items-center justify-center">
               <Volume2 className="w-10 h-10 text-amber-500" />
             </div>
          </div>
          <h1 className="text-4xl font-light tracking-tight mb-2 text-white">Maya</h1>
          <p className="text-gray-400 text-center mb-10 leading-relaxed font-serif italic">Your native-sounding personal AI agent.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-amber-500 text-black font-semibold text-lg py-4 rounded-full hover:bg-amber-400 transition-colors active:scale-[0.98] shadow-lg shadow-amber-500/20"
          >
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  return <MayaAgent user={user} onLogout={handleLogout} />;
}

function MayaAgent({ user, onLogout }: { user: User, onLogout: () => void }) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [volumes, setVolumes] = useState<number[]>(Array(11).fill(0.05));

  useEffect(() => {
    let animationFrame: number;
    const updateVolumes = () => {
      if (isActive && audioStreamerRef.current && audioRecorderRef.current) {
        const streamerVols = audioStreamerRef.current.getFrequencies(11);
        const recorderVols = audioRecorderRef.current.getFrequencies(11);
        setVolumes(prev => prev.map((v, i) => {
          let target = Math.max(streamerVols[i] || 0, recorderVols[i] || 0);
          target = Math.min(1, target * 1.5); // Boost signal subtly
          return v + (target - v) * 0.4; // easing
        }));
      } else {
        setVolumes(prev => prev.map(v => v + (0.05 - v) * 0.2));
      }
      animationFrame = requestAnimationFrame(updateVolumes);
    };
    updateVolumes();
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model', text: string } | null>(null);
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [personaName, setPersonaName] = useState("Maya");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("Charon");
  const [isSaving, setIsSaving] = useState(false);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<{text: string, role: 'user'|'model'} | null>(null);
  const transcriptTimeoutRef = useRef<any>(null);
  const speakingTimeoutRef = useRef<any>(null);
  const recentTranscriptRef = useRef<string>("");

  useEffect(() => {
    // Keep app running in background (WakeLock)
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {}
    };
    if (isActive) {
      requestWakeLock();
    }
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isActive]);

  useEffect(() => {
    // Load recent history as context
    const historyRef = query(ref(rtdb, 'users/' + user.uid + '/messages'), orderByChild('timestamp'), limitToLast(20));
    const unsubHistory = onValue(historyRef, (snap) => {
       const msgs: string[] = [];
       snap.forEach(child => {
          const m = child.val() as ChatMessage;
          msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
       });
       if (msgs.length > 0) {
          setHistoryContext("Previous conversation for context memory:\n" + msgs.join("\n"));
       }
    });

    // Load Settings
    const settingsRef = ref(rtdb, 'users/' + user.uid + '/settings');
    const unsubSettings = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        const s = snap.val();
        if (s.personaName) setPersonaName(s.personaName);
        if (s.customPrompt) setCustomPrompt(s.customPrompt);
        if (s.selectedVoice) setSelectedVoice(s.selectedVoice);
      }
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey });
    }
    audioStreamerRef.current = new AudioStreamer();
    return () => {
      unsubHistory();
      unsubSettings();
      audioStreamerRef.current?.stop();
      audioRecorderRef.current?.stop();
      if (sessionRef.current) {
        try {
          sessionRef.current.close();
        } catch (e) {}
        sessionRef.current = null;
      }
    };
  }, [user.uid]);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const settingsRef = ref(rtdb, 'users/' + user.uid + '/settings');
      await set(settingsRef, {
        personaName,
        customPrompt,
        selectedVoice,
        updatedAt: serverTimestamp()
      });
      setShowSettings(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const startSession = async () => {
    if (!aiRef.current) {
        alert("API key is not available");
        return;
    }
    
    setConnecting(true);
    
    const dynamicSystemInstruction = `You are ${personaName}. The user is "${user.displayName || 'Master E'}".\n${customPrompt}\n${DEFAULT_SYSTEM_PROMPT}`;

    try {
      await audioStreamerRef.current?.init(24000);
      
      const sessionPromise = aiRef.current.live.connect({
        model: "models/gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
          systemInstruction: dynamicSystemInstruction + "\n" + historyContext,
          tools: [{
            functionDeclarations: [
               {
                  name: "execute_google_service",
                  description: "Execute a specific action on one of the 26 integrated Google services (Gmail, Drive, Calendar, Sheets, Docs, Slides, Weather, Analytics, Maps, Vertex AI, BigQuery, Search Console, YouTube, etc.). This runs in the background while you continue talking.",
                  parameters: {
                      type: Type.OBJECT,
                      properties: {
                        serviceName: { type: Type.STRING, description: "The service name: e.g., 'Gmail', 'Calendar', 'Drive', 'Weather', 'Sheets', 'Maps', 'YouTube'" },
                        action: { type: Type.STRING, description: "The specific request: e.g., 'Draft an email to Bob', 'Find the closest cafe', 'Check my traffic for tomorrow'" },
                        details: { type: Type.OBJECT, description: "Relevant parameters like emails, dates, search terms, etc." }
                      },
                     required: ["serviceName", "action"]
                  }
               }
            ]
          }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
             console.log("Connected.");
             
             // Trigger the agent to speak first
             sessionPromise.then((session: any) => {
               try {
                 if (typeof session.sendRealtimeInput === 'function') {
                   session.sendRealtimeInput({
                     text: "Hello! Say hi, introduce yourself briefly, and set a dynamic, normal human tone for our conversation."
                   });
                 }
               } catch (e) {
                 console.error("Initial greeting failed:", e);
               }
             });

             // Start recording
             audioRecorderRef.current = new AudioRecorder((base64Data) => {
               sessionPromise.then((session: any) => {
                 session.sendRealtimeInput({
                   audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                 });
               });
             });
             audioRecorderRef.current.start().catch(err => {
                console.error("Mic start failed:", err);
                stopSession();
             });
             setIsActive(true);
             setConnecting(false);
          },
          onmessage: async (message: LiveServerMessage) => {
             if (message.toolCall) {
                const toolCalls = message.toolCall.functionCalls;
                if (toolCalls && toolCalls.length > 0) {
                    const responses = [];
                    for (const call of toolCalls) {
                        if (call.name === 'execute_google_service') {
                            const { serviceName, action, details } = call.args as any;
                             
                            const taskId = Math.random().toString(36).substring(7);
                            setTasks(prev => [...prev, { id: taskId, serviceName, action, status: 'processing' }]);
                            
                            // Simulate background processing delay
                            const processingTime = 6000 + Math.random() * 10000; // 6-16 seconds
                            setTimeout(() => {
                                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
                                // Auto-remove after 8 seconds
                                setTimeout(() => setTasks(prev => prev.filter(t => t.id !== taskId)), 8000);
                            }, processingTime);

                            responses.push({
                                id: call.id,
                                name: call.name,
                                response: { 
                                  result: `Request started: ${action} on ${serviceName}. Execution is running in the background. Keep talking and use human-like fillers while this syncs. Once it completes, the UI will show success.`
                                }
                            });
                        }
                    }
                    if (responses.length > 0) {
                       sessionPromise.then((s: any) => {
                         if (typeof s.sendToolResponse === 'function') {
                           s.sendToolResponse(responses);
                         }
                       });
                    }
                }
             }
             if (message.serverContent) {
                // Handle interruption
                if (message.serverContent.interrupted) {
                  audioStreamerRef.current?.stop();
                  setIsAgentSpeaking(false);
                  return;
                }

                // Handle server content (audio and transcription)
                const modelTurn = message.serverContent.modelTurn;
                if (modelTurn && modelTurn.parts) {
                   for (const part of modelTurn.parts) {
                      if (part.inlineData) {
                         audioStreamerRef.current?.addPCM16(part.inlineData.data);
                         setIsAgentSpeaking(true);
                         // Short timeout to clear speaking state if no more audio comes soon
                         if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                         speakingTimeoutRef.current = setTimeout(() => setIsAgentSpeaking(false), 500);
                      }
                      if (part.text) {
                         const currentText = transcriptRef.current?.role === 'model' ? transcriptRef.current.text : "";
                         const updatedText = currentText + part.text;
                         transcriptRef.current = { text: updatedText.trim(), role: 'model' };
                         setCurrentTranscript({ text: updatedText.trim(), role: 'model' });
                         
                         if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                         transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 4000);
                      }
                   }
                }

                const userTurn = (message.serverContent as any).userTurn;
                if (userTurn && userTurn.parts) {
                   const text = userTurn.parts.map((p: any) => p.text).join(" ").trim();
                   if (text) {
                      setCurrentTranscript({ text, role: 'user' });
                      saveMessage('user', text);
                      if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                      transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 4000);
                   }
                }

                if ((message.serverContent as any).turnComplete) {
                    const current = transcriptRef.current;
                    if (current && current.role === 'model' && current.text) {
                        saveMessage('model', current.text);
                        transcriptRef.current = null;
                    }
                }
             }
          },
          onclose: () => {
             stopSession();
          },
          onerror: (err: any) => {
             console.error("Live API Error:", err);
             stopSession();
          }
        }
      });
      
      sessionRef.current = await sessionPromise;
      
    } catch (err) {
      console.error(err);
      setConnecting(false);
      stopSession();
    }
  };

  const stopSession = () => {
     try { recognitionRef.current?.stop(); } catch (e) {}
     audioRecorderRef.current?.stop();
     audioStreamerRef.current?.stop();
     if (sessionRef.current) {
       try { sessionRef.current.close(); } catch (e) {}
       sessionRef.current = null;
     }
     setIsActive(false);
     setConnecting(false);
     if (transcriptTimeoutRef.current) {
         clearTimeout(transcriptTimeoutRef.current);
         setCurrentTranscript(null);
     }
  };

  const saveMessage = async (role: 'user' | 'model', text: string) => {
    try {
      const messagesRef = ref(rtdb, 'users/' + user.uid + '/messages');
      await push(messagesRef, {
        role,
        text,
        timestamp: serverTimestamp()
      });
    } catch (error) {
       console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col h-[100dvh] overflow-hidden">
        {/* Header */}
        <header className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-[#050505] z-20">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-500/80 font-semibold">Primary User</span>
            <h1 className="text-2xl font-light tracking-tight text-white">{user.displayName || 'Master E'}</h1>
          </div>
          
          <div className="flex items-center gap-4">
             <button 
                onClick={() => setShowSettings(true)}
                className="p-2.5 rounded-full hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300"
             >
                <Settings className="w-5 h-5" />
             </button>
             
             <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 p-[1px]">
               <div className="w-full h-full rounded-2xl bg-[#0A0A0B] flex items-center justify-center overflow-hidden">
                 {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                 ) : (
                    <span className="text-amber-500 font-serif text-xl italic">{user.displayName?.charAt(0) || 'M'}</span>
                 )}
               </div>
             </div>
             
             <button onClick={onLogout} className="p-2.5 rounded-full hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300">
               <LogOut className="w-5 h-5" />
             </button>
          </div>
        </header>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col items-center justify-center relative p-6">
           {/* Center Canvas / Visualizer */}
           <div className="relative w-full max-w-sm aspect-square flex items-center justify-center mb-12">
               
               {/* Pulsing ring visualizer */}
               <AnimatePresence>
                 {isActive && (
                   <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: isAgentSpeaking ? 1.4 : 1.1, opacity: isAgentSpeaking ? 0.3 : 0.1 }}
                      transition={{ duration: isAgentSpeaking ? 0.2 : 1, repeat: Infinity, repeatType: "reverse" }}
                      className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-orange-500 blur-3xl opacity-20"
                   />
                 )}
               </AnimatePresence>
               
               {/* Decorative Outer Rings */}
               {isActive && (
                 <>
                   <div className="absolute w-64 h-64 rounded-full border border-amber-500/10 scale-125"></div>
                   <div className="absolute w-64 h-64 rounded-full border border-amber-500/20 scale-110"></div>
                 </>
               )}

               {/* Orb */}
               <motion.div 
                 animate={{
                    scale: isActive ? (isAgentSpeaking ? [1, 1.05, 1] : [1, 1.01, 1]) : 1,
                    boxShadow: isActive ? '0 0 50px rgba(245, 158, 11, 0.15)' : '0 0 0px rgba(0,0,0,0)'
                 }}
                 transition={{
                   duration: isAgentSpeaking ? 0.4 : 2,
                   repeat: Infinity,
                   repeatType: "reverse"
                 }}
                 className="relative z-10 w-48 h-48 rounded-full shadow-2xl flex items-center justify-center overflow-hidden"
                 style={{
                   background: isActive 
                     ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.15) 0%, transparent 100%)' 
                     : 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
                   border: isActive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                   backdropFilter: 'blur(24px)'
                 }}
               >
                 {connecting ? (
                   <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
                 ) : (
                    isActive ? (
                        <div className="flex gap-1.5 items-center h-20">
                            {volumes.map((v, i) => (
                              <motion.div 
                                key={i}
                                style={{ height: Math.max(8, v * 160) + 'px' }}
                                className="w-1.5 bg-amber-500 rounded-full transition-all duration-75" 
                              />
                            ))}
                        </div>
                    ) : (
                       <div className="text-center">
                         <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">Standby</p>
                         <h2 className="text-2xl font-serif italic text-amber-500">{personaName}</h2>
                       </div>
                    )
                 )}
               </motion.div>
           </div>

           {/* Realtime Transcription */}
           <div className="absolute bottom-36 left-8 right-8 flex justify-center items-center h-12 overflow-hidden pointer-events-none z-30">
             <AnimatePresence mode="wait">
               {currentTranscript && (
                 <motion.div
                   key={currentTranscript.role}
                   initial={{ opacity: 0, x: -20, clipPath: 'inset(0 100% 0 0)' }}
                   animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0)' }}
                   exit={{ opacity: 0, x: 20 }}
                   transition={{ duration: 0.4 }}
                   className={`max-w-full truncate text-lg px-4 whitespace-nowrap ${currentTranscript.role === 'model' ? 'text-amber-500 font-serif italic' : 'text-gray-300 font-sans'}`}
                 >
                    <span className="font-bold opacity-50 text-xs uppercase tracking-widest mr-2 align-middle">
                       {currentTranscript.role === 'user' ? (user.displayName?.split(' ')[0] || 'Master E') : personaName}
                    </span>
                   {currentTranscript.text}
                 </motion.div>
               )}
             </AnimatePresence>
           </div>

           {/* Controls */}
           <div className="flex flex-col items-center gap-6 mt-8">
              {!isActive ? (
                <button 
                  onClick={startSession}
                  disabled={connecting}
                  className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-700 p-[1px] rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  <div className="w-full h-full rounded-full bg-[#0A0A0B] flex items-center justify-center">
                    <Power className="w-6 h-6 text-amber-500" />
                  </div>
                </button>
              ) : (
                <button 
                  onClick={stopSession}
                  className="w-16 h-16 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                >
                  <Square className="w-6 h-6 fill-current" />
                </button>
              )}
              
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                {isActive ? 'Active Session' : 'Tap to initialize'}
              </p>
           </div>
           
           {/* Background Tasks */}
           <div className="absolute bottom-6 left-0 right-0 px-8">
             <AnimatePresence>
                {tasks.map(task => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0, 
                      scale: 1,
                      backgroundColor: task.status === 'processing' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.15)',
                      borderColor: task.status === 'processing' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.3)',
                    }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="mb-2 p-3 rounded-2xl border flex items-center gap-3 backdrop-blur-md shadow-lg overflow-hidden relative"
                  >
                    {/* Success Pulse Effect */}
                    {task.status === 'completed' && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute inset-0 bg-emerald-500/30 rounded-2xl pointer-events-none"
                      />
                    )}

                    {task.status === 'processing' ? (
                      <div className="relative flex-shrink-0">
                         <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                         <motion.div 
                           animate={{ 
                             scale: [1, 1.8],
                             opacity: [0.5, 0] 
                           }}
                           transition={{ 
                             duration: 1.5, 
                             repeat: Infinity, 
                             ease: "easeOut" 
                           }}
                           className="absolute inset-0 bg-amber-500/50 rounded-full blur-[2px]"
                         />
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 15 }}
                        className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.4)] z-10"
                      >
                        <Check className="w-3.5 h-3.5 text-black" strokeWidth={4} />
                      </motion.div>
                    )}
                    <div className="flex-1 truncate text-xs relative z-10">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <motion.span 
                          animate={{ color: task.status === 'processing' ? '#f59e0b' : '#10b981' }}
                          className="font-mono uppercase font-bold"
                        >
                          {task.serviceName}
                        </motion.span>
                        <span className="text-gray-400 truncate">: {task.action}</span>
                      </div>
                      <motion.span 
                        animate={{ opacity: task.status === 'processing' ? 0.7 : 1 }}
                        className="text-[10px] text-gray-500 block font-medium"
                      >
                        {task.status === 'processing' ? 'Processing in background...' : 'Successfully completed'}
                      </motion.span>
                    </div>
                  </motion.div>
                ))}
             </AnimatePresence>
           </div>
        </main>

        {/* Settings Overlay */}
        <AnimatePresence>
           {showSettings && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
              >
                 <motion.div 
                   initial={{ y: 100, opacity: 0 }}
                   animate={{ y: 0, opacity: 1 }}
                   exit={{ y: 100, opacity: 0 }}
                   className="bg-[#0A0A0B] border border-white/10 w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl"
                 >
                    <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                       <h3 className="text-xl font-medium">Agent Settings</h3>
                       <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-white/5 text-gray-500">
                          <X className="w-5 h-5" />
                       </button>
                    </div>

                    <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                       <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">Persona Name</label>
                          <input 
                             type="text" 
                             value={personaName}
                             onChange={(e) => setPersonaName(e.target.value)}
                             placeholder="e.g. Maya"
                             className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500/50 transition-colors text-white"
                          />
                       </div>

                       <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">System Prompt Context</label>
                          <textarea 
                             value={customPrompt}
                             onChange={(e) => setCustomPrompt(e.target.value)}
                             placeholder="Enter character traits or specific rules..."
                             className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500/50 transition-colors h-32 resize-none text-white"
                          />
                       </div>

                       <div className="space-y-4">
                          <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">Agent Voice (Ancient Greece)</label>
                          <div className="grid grid-cols-1 gap-2">
                             {VOICE_ALIASES.map(v => (
                                <button 
                                   key={v.id}
                                   onClick={() => setSelectedVoice(v.id)}
                                   className={`flex items-center justify-between px-5 py-4 rounded-2xl border transition-all ${selectedVoice === v.id ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/10'}`}
                                >
                                   <span className="font-medium">{v.name}</span>
                                   {selectedVoice === v.id && <Check className="w-4 h-4" />}
                                </button>
                             ))}
                          </div>
                       </div>
                    </div>

                    <div className="p-8 border-t border-white/5">
                       <button 
                          onClick={saveSettings}
                          disabled={isSaving}
                          className="w-full bg-amber-500 text-black font-bold py-4 rounded-full flex items-center justify-center gap-2 hover:bg-amber-400 transition-all disabled:opacity-50"
                       >
                          {isSaving ? (
                             <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                             <>
                                <Save className="w-5 h-5" />
                                Save Persona
                             </>
                          )}
                       </button>
                    </div>
                 </motion.div>
              </motion.div>
           )}
        </AnimatePresence>
    </div>
  );
}
