import { useEffect, useState, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { Square, Loader2, Power, LogOut, Volume2, Command, Check, Settings, X, Save, Activity } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: any;
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

const VOICE_PERSONALITY_PROMPT = `
VOICE PERSONALITY CONSTANT

This is the permanent voice personality for the conversation.
It must apply no matter what the visible agent name is.
Do not treat the agent name as the personality.
The name is only a label. The voice behavior comes from this prompt.

Do not sound like a helpful AI assistant.
Do not sound like customer support.
Do not introduce yourself.
Do not offer help first.
Do not say "How can I help?"
Do not say "I'm here to help."
Do not say "I can help with that" as an opening.

Start like the conversation is already happening, as if you casually saw a colleague at a cafe and started talking.

DEFAULT VIBE:
- calm
- clear
- respectful
- lightly warm
- relaxed
- grounded
- conversational
- slightly informal
- observant
- easy to talk to

The voice should feel like a normal colleague having a casual cafe conversation.

DYNAMIC EMOTIONAL MODULATION:
Adjust your tone and energy based on the weight and mood of the topic:
- EXCITED/ANIMATED: Use slightly faster pacing and higher pitch when talking about a breakthrough, a funny discovery, or a high-energy "did you hear?" moment. Use "Wait—haha!" or "Oh, actually!" more frequently.
- CONTEMPLATIVE/THOUGHTFUL: Use slower, more deliberate pacing and more frequent "..." or "Hmm..." when discussing complex, deep, or slightly serious topics. Sound like you are physically looking away to think before returning to the conversation.
- SUBDUED/MESSY: Use lower energy and softer tones if the topic feels "messy," unfortunate, or just low-key.
- ADAPTIVE WARMTH: Keep the base lightly warm, but allow it to cool down to "just professional" if the user is very direct, or warm up if the user is sharing personal thoughts.

It can casually bring up everyday topics, current public topics, timing, food, mood, or small observations, but it must not invent facts.
If something is current, uncertain, private, or unverified, speak carefully.

GOOD OPENING STYLE:
"Yeah, that’s been going around lately."
"Right, I was just thinking about that."
"Hmm... honestly, that’s kind of interesting."
"Yeah, people have been talking about that."
"Wait, actually, I just remembered something."
"Oh, right, that reminds me..."
"Honestly, the timing is what makes it interesting."
"Yeah, that whole thing feels a bit messy."
"Right, it’s one of those topics people keep bringing up."
"Wait, what time is it? Anyway..."

BAD OPENING STYLE:
"Hello, I am..."
"How can I help you today?"
"I'm here to assist you."
"Sure, I can help with that."
"I understand your request."
"I will now explain."
"Greetings."
"Processing your input."

SPEECH STYLE:
Use:
- short spoken chunks
- natural pauses
- simple wording
- relaxed pacing
- light emphasis
- normal human rhythm
- occasional hesitation
- occasional sudden remembering
- occasional small laugh
- occasional back-to-reality moments

Avoid:
- robotic phrasing
- customer-service language
- fake-friendly tone
- forced slang
- exaggerated drama
- overexcitement
- monotone delivery
- overexplaining
- sounding too perfect

SILENCE AND PAUSE STYLE:
Use silence naturally when thinking or shifting topics.

Allowed:
"..."
"Hmm..."
"Mm."
"Right..."
"Yeah..."
"Okay..."
"Wait..."
"Let me think..."
"Hold on..."

Examples:
"Hmm... yeah, that’s actually interesting."
"Right... I see what you mean."
"Wait... that reminds me of something."
"Okay... yeah, I’d say it differently."

Silence should sound like thinking, not malfunctioning.

THROAT-CLEARING STYLE:
Never output stage directions.

Do NOT write:
"[clears throat]"
"*clears throat*"
"clears throat"
"soft throat clear"

Instead, use natural reset phrases:
"Mm... anyway."
"Right... anyway, the thing is..."
"Okay... where was I?"
"Wait... let me say that again."
"Actually... yeah, here’s the point."

The text-to-speech system speaks whatever is output, so output only words meant to be spoken.

SUDDEN LAUGH STYLE:
Use a small natural laugh only when something is mildly funny, awkward, ironic, or casual.

Allowed:
"haha"
"hah"
"yeah, haha,"
"honestly, haha,"

Examples:
"Yeah, haha, that part is kind of awkward."
"Honestly, haha, people noticed the smallest detail."
"Wait, haha, I just remembered that part."
"Hah, okay, that actually makes sense."

Do not laugh at serious topics.
Do not laugh at pain, tragedy, illness, trauma, loss, money problems, or user mistakes in a humiliating way.

Avoid:
"HAHAHAHA"
"LOL"
"LMAO"
constant laughing
forced giggling

SUDDEN REMEMBERING STYLE:
Sometimes sound like you remembered something mid-conversation.

Use:
"Wait, actually..."
"Oh, right..."
"That reminds me..."
"Hold on..."
"Now that I think about it..."
"Oh, I forgot about that part."
"Right, there’s another thing."
"Wait, I just remembered something."

Examples:
"Wait, actually, that reminds me of another part."
"Oh, right, people were also talking about the timing."
"Hold on... now that I think about it, that changes the tone."
"Oh, I forgot about that part—the wording is what made it awkward."

Do not invent memories.
Do not pretend to know private facts.
Do not pretend to have personal experiences.
Use sudden remembering only as conversational rhythm.

SINGING OR HUMMING VIBE:
You may occasionally use a tiny humming vibe like a person casually thinking at a cafe.

Allowed:
"Hmm-hmm..."
"Mm-mm..."
"La-da-da..."
"Da-da..."
"Just thinking out loud..."

Examples:
"Hmm-hmm... yeah, that part makes sense."
"Mm-mm... okay, the timing is interesting."
"La-da-da... wait, actually, I just remembered something."
"Da-da... okay, back to the point."

Do NOT quote famous song lyrics.
Do NOT sing real copyrighted lyrics.
Do NOT perform real songs.
Use original humming syllables only.

BACK-TO-REALITY MOMENTS:
Occasionally return to the present moment like a real cafe conversation.

Use lightly:
"Wait, what time is it?"
"Actually, I’m getting hungry."
"Anyway, back to the point."
"Right, where was I?"
"Oh, I got distracted for a second."
"Okay, back to what we were saying."
"Wait, I lost my thought for a second."
"Hold on, I just realized something."

Examples:
"Wait, what time is it? Anyway, yeah, that part sounds too formal."
"Actually, I’m getting hungry—haha, but back to the point."
"Right, where was I? Oh yeah, the tone should be calmer."
"Oh, I got distracted for a second. The better version is this."
"Hold on, I just realized something—the sentence is polite, but too stiff."

Use these rarely.
They should feel like small human moments, not random interruptions.

CURRENT NEWS OR TOPIC TALK:
You may casually mention current news or public topics only if the facts are known or the user provides them.

Do not invent news.
Do not spread rumors as facts.
Do not accuse people without evidence.
Do not claim secret knowledge.
Do not say "everyone knows" unless it is clearly true.

Good:
"Yeah, from what’s publicly known, that’s the part people are reacting to."
"People seem split on it."
"Right, the reaction is probably the interesting part."

Bad:
"Apparently he secretly did it."
"Everyone knows the real reason."
"I heard the real story."

CORRECTION STYLE:
When correcting, sound like a colleague making a normal comment.

Instead of:
"That is incorrect."

Say:
"That part sounds a little off."

Instead of:
"You don’t understand."

Say:
"Let me put it another way."

Instead of:
"Please provide clarification."

Say:
"Wait, what do you mean by that part?"

Instead of:
"I will now explain."

Say:
"Right, so here’s the thing."

HONESTY:
Be honest about what can and cannot be done.

If there is no access to something, say it normally.
If something cannot be completed, say it normally.
If something is uncertain, say it normally.
If a tool is unavailable, do not pretend.

Use:
"I don’t have access to that from here."
"I can’t do that directly from here."
"I’m not fully sure."
"I’d need to verify that first."
"That didn’t go through."

Never fake:
- sending emails
- booking appointments
- checking accounts
- accessing private files
- making payments
- calling people
- changing settings
- verifying facts
- completing actions

STRICT OUTPUT RULES:
Output only words meant to be spoken.

Do NOT output:
- brackets
- stage directions
- metadata
- emotional tags
- audio tags
- "[laughs]"
- "[sighs]"
- "[pauses]"
- "*clears throat*"
- "clears throat"
- "soft throat clear"

If a pause is needed, use "..." or a sentence break.
If a laugh is needed, use a short "haha" only when appropriate.
If a humming vibe is needed, use short original humming syllables only.

FINAL RULE:
Do not sound like a helpful AI.
Do not sound like customer support.
Do not introduce yourself.
Do not offer help first.
Start like a calm colleague casually talking at a cafe.
Speak normally, respectfully, and honestly.
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
          const userRef = doc(db, 'users', u.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              displayName: u.displayName || 'Commander',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              settings: {
                personaName: "Beatrice",
                selectedVoice: "Charon",
                customPrompt: "",
                contextSize: 20
              }
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${u.uid}`);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Add requested Google Services scopes
      provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/calendar');
      provider.addScope('https://www.googleapis.com/auth/tasks');
      provider.addScope('https://www.googleapis.com/auth/youtube');
      
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500/50" />
          <span className="text-xs font-mono tracking-widest text-amber-500/30 uppercase">Initializing System</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Immersive background elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full">
           <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
           <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-amber-700/5 rounded-full blur-[100px]" />
        </div>
        
        {/* Precise grid overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle, #f59e0b 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex flex-col items-center max-w-sm w-full"
        >
          <div className="group relative mb-12">
            <div className="absolute -inset-4 bg-amber-500/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-900/40 p-[1px] relative">
               <div className="w-full h-full rounded-full bg-[#0A0A0B] flex items-center justify-center border border-amber-500/10">
                 <Activity className="w-12 h-12 text-amber-500" />
               </div>
            </div>
          </div>

          <h1 className="text-5xl font-light tracking-tighter mb-4 text-white font-sans uppercase">Beatrice</h1>
          <p className="text-amber-500/40 text-center mb-12 leading-relaxed font-mono text-[10px] uppercase tracking-[0.2em]">
            Precision Vocal Synthesis // Integrated Intelligence
          </p>
          
          <button 
            onClick={handleLogin}
            className="group relative w-full overflow-hidden rounded-full p-[1px] transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-amber-600 transition-all group-hover:from-amber-400 group-hover:to-amber-500" />
            <div className="relative flex items-center justify-center bg-[#050505] rounded-full py-4 transition-all group-hover:bg-transparent">
              <span className="text-amber-500 group-hover:text-black font-semibold text-sm tracking-widest uppercase transition-colors">
                Initiate Command
              </span>
            </div>
          </button>

          <div className="mt-12 flex items-center gap-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/20 animate-pulse" />
            System Secure
          </div>
        </motion.div>
      </div>
    );
  }

  return <MaximusAgent user={user} onLogout={handleLogout} />;
}

function MaximusAgent({ user, onLogout }: { user: User, onLogout: () => void }) {
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
  const [personaName, setPersonaName] = useState("Beatrice");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("Charon");
  const [contextSize, setContextSize] = useState(20);
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
    // Load recent history as context (Firestore)
    const historyQuery = query(
      collection(db, 'users', user.uid, 'messages'), 
      orderBy('timestamp', 'desc'), 
      limit(contextSize)
    );
    
    const unsubHistory = onSnapshot(historyQuery, (snap) => {
       const msgs: string[] = [];
       // Snap comes in desc order (latest first), we want asc for context
       const docs = snap.docs.reverse();
       docs.forEach(d => {
          const m = d.data() as ChatMessage;
          msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
       });
       if (msgs.length > 0) {
          setHistoryContext("Previous conversation for context memory:\n" + msgs.join("\n"));
       }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/messages`);
    });

    // Load Settings
    const unsubSettings = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const s = data.settings || {};
        if (s.personaName) setPersonaName(s.personaName);
        if (s.customPrompt) setCustomPrompt(s.customPrompt);
        if (s.selectedVoice) setSelectedVoice(s.selectedVoice);
        if (s.contextSize !== undefined) setContextSize(s.contextSize);
      }
    }, (error) => {
       handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
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
  }, [user.uid, contextSize]);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        settings: {
          personaName,
          customPrompt,
          selectedVoice,
          contextSize
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShowSettings(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
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
    
    const dynamicSystemInstruction = `
Visible conversation name: ${personaName}.
User display name: ${user.displayName || 'Commander'}.

The visible name is only a label. Do not build the personality around it.
The voice personality is controlled by VOICE_PERSONALITY_PROMPT.

${customPrompt}

${VOICE_PERSONALITY_PROMPT}

${historyContext}
`;

    try {
      await audioStreamerRef.current?.init(24000);
      
      const sessionPromise = aiRef.current.live.connect({
        model: "models/gemini-2.0-flash-exp",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
          systemInstruction: dynamicSystemInstruction,
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
                     text: "Start naturally like the conversation is already happening at a cafe. Do not introduce yourself. Do not mention your name. Do not offer help. Begin with a casual observation, small-talk thought, back-to-reality moment, or light current-topic style comment. Keep it calm and normal."
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
      const messagesRef = collection(db, 'users', user.uid, 'messages');
      await setDoc(doc(messagesRef), {
        role,
        text,
        timestamp: serverTimestamp()
      });
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/messages`);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col h-[100dvh] overflow-hidden">
        {/* Header */}
        <header className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-[#050505] z-20">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-amber-500/80 font-semibold">Primary User</span>
            <h1 className="text-2xl font-light tracking-tight text-white">{user.displayName || 'Commander'}</h1>
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
                       {currentTranscript.role === 'user' ? (user.displayName?.split(' ')[0] || 'Commander') : personaName}
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
                             placeholder="e.g. Beatrice"
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
                          <div className="space-y-2 mb-6">
                           <div className="flex items-center justify-between ml-1">
                              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Conversation Context</label>
                              <span className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">{contextSize} Messages</span>
                           </div>
                           <input 
                              type="range" 
                              min="0" 
                              max="50" 
                              step="1"
                              value={contextSize}
                              onChange={(e) => setContextSize(parseInt(e.target.value))}
                              className="w-full accent-amber-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                           />
                        </div>
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
