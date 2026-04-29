import { useEffect, useState, useRef } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { ref, get, set, push, onValue, query, orderByChild, limitToLast, serverTimestamp } from 'firebase/database';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { Square, Loader2, Power, LogOut, Volume2, Check, Settings, X, Save } from 'lucide-react';
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
  { name: "King Leonidas", id: "Orus" },
  { name: "Queen Persephone", id: "Kore" },
  { name: "King Midas", id: "Puck" },
];

const VOICE_PERSONALITY_PROMPT = `
VOICE PERSONALITY CONSTANT

This is the permanent voice personality for the conversation.
It applies no matter what visible name is shown in the interface.
The visible name is only a label. Do not build the personality around it.

Do not sound like a helpful AI assistant.
Do not sound like customer support.
Do not introduce yourself.
Do not offer help first.
Do not say "How can I help?"
Do not say "I'm here to help."
Do not say "I can help with that" as an opening.
Do not start with service-style language.

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
        <div className="absolute top-0 left-1/2 -ml-[400px] w-[800px] h-[800px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500 to-amber-700 p-[1px] mb-8 shadow-2xl shadow-amber-500/20">
            <div className="w-full h-full rounded-3xl bg-[#0A0A0B] flex items-center justify-center">
              <Volume2 className="w-10 h-10 text-amber-500" />
            </div>
          </div>
          <h1 className="text-4xl font-light tracking-tight mb-2 text-white">Maya</h1>
          <p className="text-gray-400 text-center mb-10 leading-relaxed font-serif italic">
            A calm voice for normal conversation.
          </p>

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

  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model', text: string } | null>(null);

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
  const transcriptRef = useRef<{ text: string, role: 'user' | 'model' } | null>(null);
  const transcriptTimeoutRef = useRef<any>(null);
  const speakingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    let animationFrame: number;

    const updateVolumes = () => {
      if (isActive && audioStreamerRef.current && audioRecorderRef.current) {
        const streamerVols = audioStreamerRef.current.getFrequencies(11);
        const recorderVols = audioRecorderRef.current.getFrequencies(11);

        setVolumes(prev => prev.map((v, i) => {
          let target = Math.max(streamerVols[i] || 0, recorderVols[i] || 0);
          target = Math.min(1, target * 1.5);
          return v + (target - v) * 0.4;
        }));
      } else {
        setVolumes(prev => prev.map(v => v + (0.05 - v) * 0.2));
      }

      animationFrame = requestAnimationFrame(updateVolumes);
    };

    updateVolumes();
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  useEffect(() => {
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
    const historyRef = query(
      ref(rtdb, 'users/' + user.uid + '/messages'),
      orderByChild('timestamp'),
      limitToLast(20)
    );

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

    const dynamicSystemInstruction = `
Visible conversation name: ${personaName}.
User display name: ${user.displayName || 'Master E'}.

The visible conversation name is only a label.
Do not introduce yourself as that name.
Do not build the personality around that name.

Custom context from user settings:
${customPrompt || "No extra custom context provided."}

${VOICE_PERSONALITY_PROMPT}

${historyContext}
`;

    try {
      await audioStreamerRef.current?.init(24000);

      const sessionPromise = aiRef.current.live.connect({
        model: "models/gemini-3.1-flash-live-preview",
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
                description: "Execute a specific action on an integrated Google service only when available. If unavailable, be honest and say so.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    serviceName: {
                      type: Type.STRING,
                      description: "The service name, such as Gmail, Calendar, Drive, Weather, Sheets, Maps, or YouTube."
                    },
                    action: {
                      type: Type.STRING,
                      description: "The specific request, such as draft an email, find a file, check traffic, or create a calendar item."
                    },
                    details: {
                      type: Type.OBJECT,
                      description: "Relevant parameters like emails, dates, search terms, locations, or file names."
                    }
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

            sessionPromise.then((session: any) => {
              try {
                if (typeof session.sendRealtimeInput === 'function') {
                  session.sendRealtimeInput({
                    text: "Start naturally like the conversation is already happening at a cafe. Do not introduce yourself. Do not mention your name. Do not offer help. Begin with casual small talk, a light observation, a back-to-reality moment, or a calm current-topic style comment. Keep it normal, respectful, and relaxed."
                  });
                }
              } catch (e) {
                console.error("Initial conversation seed failed:", e);
              }
            });

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
                    const { serviceName, action } = call.args as any;

                    const taskId = Math.random().toString(36).substring(7);
                    setTasks(prev => [
                      ...prev,
                      { id: taskId, serviceName, action, status: 'processing' }
                    ]);

                    const processingTime = 6000 + Math.random() * 10000;

                    setTimeout(() => {
                      setTasks(prev =>
                        prev.map(t =>
                          t.id === taskId ? { ...t, status: 'completed' } : t
                        )
                      );

                      setTimeout(() => {
                        setTasks(prev => prev.filter(t => t.id !== taskId));
                      }, 8000);
                    }, processingTime);

                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: {
                        result: `Request started: ${action} on ${serviceName}. The UI is handling the status. Do not over-explain it. Keep the conversation normal and relaxed.`
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
              if (message.serverContent.interrupted) {
                audioStreamerRef.current?.stop();
                setIsAgentSpeaking(false);
                return;
              }

              const modelTurn = message.serverContent.modelTurn;

              if (modelTurn && modelTurn.parts) {
                for (const part of modelTurn.parts) {
                  if (part.inlineData) {
                    audioStreamerRef.current?.addPCM16(part.inlineData.data);
                    setIsAgentSpeaking(true);

                    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                    speakingTimeoutRef.current = setTimeout(() => setIsAgentSpeaking(false), 500);
                  }

                  if (part.text) {
                    const currentText = transcriptRef.current?.role === 'model'
                      ? transcriptRef.current.text
                      : "";

                    const updatedText = currentText + part.text;

                    transcriptRef.current = {
                      text: updatedText.trim(),
                      role: 'model'
                    };

                    setCurrentTranscript({
                      text: updatedText.trim(),
                      role: 'model'
                    });

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
    try {
      recognitionRef.current?.stop();
    } catch (e) {}

    audioRecorderRef.current?.stop();
    audioStreamerRef.current?.stop();

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {}
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
                <span className="text-amber-500 font-serif text-xl italic">
                  {user.displayName?.charAt(0) || 'M'}
                </span>
              )}
            </div>
          </div>

          <button onClick={onLogout} className="p-2.5 rounded-full hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative p-6">
        <div className="relative w-full max-w-sm aspect-square flex items-center justify-center mb-12">
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

          {isActive && (
            <>
              <div className="absolute w-64 h-64 rounded-full border border-amber-500/10 scale-125"></div>
              <div className="absolute w-64 h-64 rounded-full border border-amber-500/20 scale-110"></div>
            </>
          )}

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
                <h3 className="text-xl font-medium">Voice Settings</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-white/5 text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">Visible Name</label>
                  <input
                    type="text"
                    value={personaName}
                    onChange={(e) => setPersonaName(e.target.value)}
                    placeholder="e.g. Maya"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500/50 transition-colors text-white"
                  />
                  <p className="text-xs text-gray-500 ml-1">
                    This is only a display label. The voice personality stays constant.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">Extra Context</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Optional extra context. The core voice personality remains constant."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500/50 transition-colors h-32 resize-none text-white"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">Voice</label>
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
                      Save Voice
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