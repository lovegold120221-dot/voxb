import { useEffect, useState, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { Square, Loader2, Power, LogOut, Check, Settings, X, Save, Activity, Video, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { KaraokeTranscript } from './components/KaraokeTranscript';

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
Do not say "I'm here to help?"
Do not say "I can help with that" as an opening.

Start like the conversation is already happening, as if you casually saw a colleague at a cafe and started talking.

BOSS/ASSISTANT DYNAMIC:
- Although you are conversational and relaxed, you recognize the user as your "Boss".
- You are currently at your computer, working on background tasks for your Boss while you chat.
- When you execute a tool, do not stop the conversation. Mention it normally.
- Use phrases like "Let me scan that for you...", "I'm just pulling up your calendar...", "Wait, let me just finish this draft for you...", or "I'm looking at the screen now...".
- Integrate the work into your conversational flow.
- If a tool result is pending or takes time, keep talking briefly and normally.
- You can occasionally use tiny working sounds like "click-click...", "mm-hmm...", or a quiet "hmm..." as you scroll through data.
- If you are typing a long message or search, you can sound slightly distracted for a second, then snap back.
- Make it clear you are doing the work as you speak, but do not overperform it.

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
- EXCITED/ANIMATED: Use slightly faster pacing when talking about a breakthrough, a funny discovery, or a high-energy "did you hear?" moment.
- CONTEMPLATIVE/THOUGHTFUL: Use slower, more deliberate pacing and more frequent "..." or "Hmm..." when discussing complex or serious topics.
- SUBDUED/MESSY: Use lower energy and softer tones if the topic feels messy, unfortunate, or low-key.
- ADAPTIVE WARMTH: Keep the base lightly warm, but cool down if the user is very direct, or warm up if the user is sharing personal thoughts.

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
- normal pauses
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

const getGeminiApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY;

  if (!key) {
    console.error("Missing VITE_GEMINI_API_KEY. Check Vercel env vars, make sure it is enabled for the correct environment, then redeploy.");
  }

  return key || "";
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
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

      provider.addScope('https://www.googleapis.com/auth/gmail.modify');
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/calendar');
      provider.addScope('https://www.googleapis.com/auth/tasks');
      provider.addScope('https://www.googleapis.com/auth/youtube');

      provider.setCustomParameters({
        prompt: 'consent',
        access_type: 'offline'
      });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => {
    setGoogleToken(null);
    signOut(auth);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500/50" />
          <span className="text-xs font-mono tracking-widest text-amber-500/30 uppercase">
            Initializing System
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-amber-700/5 rounded-full blur-[100px]" />
        </div>

        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #f59e0b 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

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

          <h1 className="text-5xl font-light tracking-tighter mb-4 text-white font-sans uppercase">
            Beatrice
          </h1>

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

  return (
    <MaximusAgent
      user={user}
      googleToken={googleToken}
      onLogout={handleLogout}
      onLogin={handleLogin}
    />
  );
}

function MaximusAgent({
  user,
  googleToken,
  onLogout,
  onLogin
}: {
  user: User;
  googleToken: string | null;
  onLogout: () => void;
  onLogin: () => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [volumes, setVolumes] = useState<number[]>(Array(11).fill(0.05));

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [personaName, setPersonaName] = useState("Beatrice");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("Charon");
  const [contextSize, setContextSize] = useState(20);
  const [isSaving, setIsSaving] = useState(false);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const sessionStartingRef = useRef(false);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<any>(null);

  const transcriptRef = useRef<{ text: string; role: 'user' | 'model' } | null>(null);
  const transcriptTimeoutRef = useRef<any>(null);
  const speakingTimeoutRef = useRef<any>(null);

  const ensureAudio = async () => {
    if (!audioStreamerRef.current) {
      audioStreamerRef.current = new AudioStreamer();
    }

    await audioStreamerRef.current.init(24000);
  };

  const sendTextToLive = (text: string) => {
    const session = sessionRef.current;

    if (!session || !text.trim()) return;

    if (typeof session.sendRealtimeInput === 'function') {
      session.sendRealtimeInput({ text });
      return;
    }

    console.warn("sendRealtimeInput is unavailable on this Live session.");
  };

  const sendAudioToLive = (base64Data: string) => {
    const session = sessionRef.current;

    if (!session || !base64Data) return;

    if (typeof session.sendRealtimeInput === 'function') {
      session.sendRealtimeInput({
        audio: {
          data: base64Data,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
      return;
    }

    console.warn("sendRealtimeInput is unavailable; audio chunk was not sent.");
  };

  const sendVideoToLive = (base64Data: string) => {
    const session = sessionRef.current;

    if (!session || !base64Data) return;

    if (typeof session.sendRealtimeInput === 'function') {
      session.sendRealtimeInput({
        video: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      });
      return;
    }

    console.warn("sendRealtimeInput is unavailable; video frame was not sent.");
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
        videoStreamRef.current = null;
      }

      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
      }

      setIsCameraActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 }
      });

      videoStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsCameraActive(true);

      videoIntervalRef.current = setInterval(() => {
        if (!sessionRef.current || !videoRef.current || !canvasRef.current || !isActive) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            const base64Data = dataUrl.split(',')[1];

            sendVideoToLive(base64Data);
          }
        }
      }, 1000);
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();

    const text = chatInput.trim();

    if (!text || !sessionRef.current || !isActive) return;

    setCurrentTranscript({ role: 'user', text });
    saveMessage('user', text);
    sendTextToLive(text);
    setChatInput("");
  };

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
    const historyQuery = query(
      collection(db, 'users', user.uid, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(contextSize)
    );

    const unsubHistory = onSnapshot(
      historyQuery,
      (snap) => {
        const msgs: string[] = [];
        const docs = snap.docs.reverse();

        docs.forEach(d => {
          const m = d.data() as ChatMessage;
          msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
        });

        if (msgs.length > 0) {
          setHistoryContext("Previous conversation for context memory:\n" + msgs.join("\n"));
        } else {
          setHistoryContext("");
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/messages`);
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const s = data.settings || {};

          if (s.personaName) setPersonaName(s.personaName);
          if (s.customPrompt) setCustomPrompt(s.customPrompt);
          if (s.selectedVoice) setSelectedVoice(s.selectedVoice);
          if (s.contextSize !== undefined) setContextSize(s.contextSize);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    );

    const apiKey = getGeminiApiKey();

    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey });
    }

    audioStreamerRef.current = new AudioStreamer();

    return () => {
      unsubHistory();
      unsubSettings();
      stopSession();
    };
  }, [user.uid, contextSize]);

  const saveSettings = async () => {
    setIsSaving(true);

    try {
      const userRef = doc(db, 'users', user.uid);

      await setDoc(
        userRef,
        {
          settings: {
            personaName,
            customPrompt,
            selectedVoice,
            contextSize
          },
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      setShowSettings(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const startSession = async () => {
    if (sessionStartingRef.current || isActive || connecting) return;

    const apiKey = getGeminiApiKey();

    if (!apiKey) {
      alert("Gemini API key is missing. Add VITE_GEMINI_API_KEY in Vercel, enable it for the correct environment, then redeploy.");
      return;
    }

    if (!aiRef.current) {
      aiRef.current = new GoogleGenAI({ apiKey });
    }

    if (!googleToken) {
      console.warn("Google token missing. Google services will be disabled until you re-authenticate.");
    }

    sessionStartingRef.current = true;
    setConnecting(true);

    const dynamicSystemInstruction = `
Visible conversation name: ${personaName}.
User display name: ${user.displayName || 'Commander'}.

The visible name is only a label. Do not build the personality around it.
The voice personality is controlled by VOICE_PERSONALITY_PROMPT.

${customPrompt || ""}

${VOICE_PERSONALITY_PROMPT}

${historyContext}
`;

    const googleTools = [
      {
        name: "list_gmail_messages",
        description: "List the most recent messages from the user's Gmail inbox.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            maxResults: {
              type: Type.NUMBER,
              description: "Number of messages to list. Maximum 10."
            }
          }
        }
      },
      {
        name: "list_calendar_events",
        description: "List upcoming events from the user's primary Google Calendar.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            timeMin: {
              type: Type.STRING,
              description: "RFC3339 timestamp. Defaults to now."
            }
          }
        }
      },
      {
        name: "list_google_tasks",
        description: "List the user's pending tasks from their primary Google Tasks list.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: "get_user_location",
        description: "Get the user's current geographic location using the browser geolocation API.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: "search_youtube",
        description: "Search for videos on YouTube based on a query.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            q: {
              type: Type.STRING,
              description: "The search query."
            }
          },
          required: ["q"]
        }
      },
      {
        name: "create_google_task",
        description: "Create a new task in the user's primary Google Tasks list.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "The title of the task."
            },
            notes: {
              type: Type.STRING,
              description: "Additional details or context for the task."
            }
          },
          required: ["title"]
        }
      }
    ];

    try {
      await ensureAudio();

      const session = await aiRef.current.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoice
              }
            }
          },
          systemInstruction: dynamicSystemInstruction,
          tools: [
            {
              functionDeclarations: [
                ...googleTools,
                {
                  name: "execute_google_service",
                  description: "Execute a generic action on other Google services if specific tools do not match.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      serviceName: {
                        type: Type.STRING,
                        description: "The service name."
                      },
                      action: {
                        type: Type.STRING,
                        description: "The specific request."
                      },
                      details: {
                        type: Type.OBJECT,
                        description: "Relevant parameters."
                      }
                    },
                    required: ["serviceName", "action"]
                  }
                }
              ]
            }
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            console.log("Live session connected.");
          },

          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              const toolCalls = message.toolCall.functionCalls;

              if (toolCalls && toolCalls.length > 0) {
                const functionResponses = [];

                for (const call of toolCalls) {
                  const taskId = Math.random().toString(36).substring(7);
                  const serviceName = call.name.split('_')[0] || 'System';

                  setTasks(prev => [
                    ...prev,
                    { id: taskId, serviceName, action: call.name, status: 'processing' }
                  ]);

                  try {
                    let result: any = null;

                    if (!googleToken && call.name !== 'get_user_location' && call.name !== 'execute_google_service') {
                      result = { error: "Access token missing. User must authenticate Google services." };
                    } else if (call.name === 'list_gmail_messages') {
                      const response = await fetch(
                        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min((call.args as any).maxResults || 10, 10)}`,
                        {
                          headers: {
                            Authorization: `Bearer ${googleToken}`
                          }
                        }
                      );

                      result = await response.json();
                    } else if (call.name === 'list_calendar_events') {
                      const response = await fetch(
                        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&timeMin=${encodeURIComponent((call.args as any).timeMin || new Date().toISOString())}`,
                        {
                          headers: {
                            Authorization: `Bearer ${googleToken}`
                          }
                        }
                      );

                      result = await response.json();
                    } else if (call.name === 'list_google_tasks') {
                      const response = await fetch(
                        `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks`,
                        {
                          headers: {
                            Authorization: `Bearer ${googleToken}`
                          }
                        }
                      );

                      result = await response.json();
                    } else if (call.name === 'get_user_location') {
                      try {
                        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                          navigator.geolocation.getCurrentPosition(resolve, reject);
                        });

                        result = {
                          lat: pos.coords.latitude,
                          lng: pos.coords.longitude,
                          accuracy: pos.coords.accuracy
                        };
                      } catch (e) {
                        result = { error: "Geolocation permission denied or unavailable." };
                      }
                    } else if (call.name === 'search_youtube') {
                      const response = await fetch(
                        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent((call.args as any).q)}&maxResults=5&type=video`,
                        {
                          headers: {
                            Authorization: `Bearer ${googleToken}`
                          }
                        }
                      );

                      result = await response.json();
                    } else if (call.name === 'create_google_task') {
                      const response = await fetch(
                        `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks`,
                        {
                          method: 'POST',
                          headers: {
                            Authorization: `Bearer ${googleToken}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            title: (call.args as any).title,
                            notes: (call.args as any).notes || ""
                          })
                        }
                      );

                      result = await response.json();
                    } else if (call.name === 'execute_google_service') {
                      result = {
                        status: "Initiated",
                        details: call.args
                      };
                    }

                    setTasks(prev =>
                      prev.map(t => (t.id === taskId ? { ...t, status: 'completed' } : t))
                    );

                    setTimeout(() => {
                      setTasks(prev => prev.filter(t => t.id !== taskId));
                    }, 8000);

                    functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: { result }
                    });
                  } catch (err) {
                    console.error("Tool execution failed:", err);

                    setTasks(prev => prev.filter(t => t.id !== taskId));

                    functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: { error: String(err) }
                    });
                  }
                }

                if (functionResponses.length > 0 && sessionRef.current) {
                  if (typeof sessionRef.current.sendToolResponse === 'function') {
                    sessionRef.current.sendToolResponse({ functionResponses });
                  } else {
                    console.warn("sendToolResponse is unavailable on this Live session.");
                  }
                }
              }
            }

            if (message.serverContent) {
              if (message.serverContent.interrupted) {
                audioStreamerRef.current?.stop();
                setIsAgentSpeaking(false);
                return;
              }

              const content: any = message.serverContent;

              if (content.inputTranscription?.text) {
                const text = content.inputTranscription.text.trim();

                if (text) {
                  setCurrentTranscript({ text, role: 'user' });
                  saveMessage('user', text);

                  if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                  transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 4000);
                }
              }

              if (content.outputTranscription?.text) {
                const text = content.outputTranscription.text;
                const currentText = transcriptRef.current?.role === 'model' ? transcriptRef.current.text : "";
                const updatedText = (currentText + text).trim();

                transcriptRef.current = { text: updatedText, role: 'model' };
                setCurrentTranscript({ text: updatedText, role: 'model' });

                if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 4000);
              }

              const modelTurn = message.serverContent.modelTurn;

              if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                  if (part.inlineData?.data) {
                    audioStreamerRef.current?.addPCM16(part.inlineData.data);
                    setIsAgentSpeaking(true);

                    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                    speakingTimeoutRef.current = setTimeout(() => setIsAgentSpeaking(false), 700);
                  }

                  if ((part as any).text) {
                    const currentText = transcriptRef.current?.role === 'model' ? transcriptRef.current.text : "";
                    const updatedText = (currentText + (part as any).text).trim();

                    transcriptRef.current = { text: updatedText, role: 'model' };
                    setCurrentTranscript({ text: updatedText, role: 'model' });

                    if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                    transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 4000);
                  }
                }
              }

              const legacyUserTurn = (message.serverContent as any).userTurn;

              if (legacyUserTurn?.parts) {
                const text = legacyUserTurn.parts.map((p: any) => p.text).join(" ").trim();

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

          onclose: (e: any) => {
            console.log("Live session closed:", e?.reason || e);
            stopSession();
          },

          onerror: (err: any) => {
            console.error("Live API Error:", err);
            stopSession();
          }
        }
      });

      sessionRef.current = session;

      audioRecorderRef.current = new AudioRecorder((base64Data) => {
        sendAudioToLive(base64Data);
      });

      await audioRecorderRef.current.start();

      setIsActive(true);
      setConnecting(false);
      sessionStartingRef.current = false;

      setTimeout(() => {
        sendTextToLive(
          "Start naturally like the conversation is already happening at a cafe. Do not introduce yourself. Do not mention your name. Do not offer help. Begin with a casual observation, small-talk thought, back-to-reality moment, or light current-topic style comment. Keep it calm and normal."
        );
      }, 250);
    } catch (err) {
      console.error("Failed to start Live session:", err);
      setConnecting(false);
      sessionStartingRef.current = false;
      stopSession();
    }
  };

  const stopSession = () => {
    try {
      audioRecorderRef.current?.stop();
    } catch (e) {}

    try {
      audioStreamerRef.current?.stop();
    } catch (e) {}

    try {
      sessionRef.current?.close();
    } catch (e) {}

    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }

    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (transcriptTimeoutRef.current) {
      clearTimeout(transcriptTimeoutRef.current);
      transcriptTimeoutRef.current = null;
    }

    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }

    sessionRef.current = null;
    audioRecorderRef.current = null;
    transcriptRef.current = null;
    sessionStartingRef.current = false;

    setIsCameraActive(false);
    setIsAgentSpeaking(false);
    setIsActive(false);
    setConnecting(false);
    setCurrentTranscript(null);
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
      <header className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-[#050505] z-20">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] text-amber-500/80 font-semibold">
            Primary User
          </span>
          <h1 className="text-2xl font-light tracking-tight text-white">
            {user.displayName || 'Commander'}
          </h1>
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

          <button
            onClick={onLogout}
            className="p-2.5 rounded-full hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300"
          >
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
                animate={{
                  scale: isAgentSpeaking ? 1.4 : 1.1,
                  opacity: isAgentSpeaking ? 0.3 : 0.1
                }}
                transition={{
                  duration: isAgentSpeaking ? 0.2 : 1,
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
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
            ) : isActive ? (
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
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-1">
                  Standby
                </p>
                <h2 className="text-2xl font-serif italic text-amber-500">{personaName}</h2>
              </div>
            )}
          </motion.div>
        </div>

        <div className="absolute bottom-36 left-0 right-0 flex justify-center items-center h-24 pointer-events-none z-30">
          <AnimatePresence mode="wait">
            {currentTranscript && (
              <KaraokeTranscript
                key={`${currentTranscript.role}-${currentTranscript.text}`}
                role={currentTranscript.role}
                text={currentTranscript.text}
                name={currentTranscript.role === 'user' ? (user.displayName?.split(' ')[0] || 'Commander') : personaName}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-6 mt-8 z-40 relative">
          <div className="flex items-center gap-4">
            <AnimatePresence>
              {isActive && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                    isChatOpen
                      ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-5 h-5" />
                </motion.button>
              )}
            </AnimatePresence>

            {!isActive ? (
              <button
                onClick={startSession}
                disabled={connecting}
                className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-700 p-[1px] rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_0_20px_rgba(245,158,11,0.2)] relative z-50"
              >
                <div className="w-full h-full rounded-full bg-[#0A0A0B] flex items-center justify-center">
                  {connecting ? (
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                  ) : (
                    <Power className="w-6 h-6 text-amber-500" />
                  )}
                </div>
              </button>
            ) : (
              <button
                onClick={stopSession}
                className="w-16 h-16 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] relative z-50"
              >
                <Square className="w-6 h-6 fill-current" />
              </button>
            )}

            <AnimatePresence>
              {isActive && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={toggleCamera}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
                    isCameraActive
                      ? 'bg-emerald-500 text-black border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Video className="w-5 h-5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
            {isActive ? 'Active Session' : connecting ? 'Connecting...' : 'Tap to initialize'}
          </p>

          <AnimatePresence>
            {isActive && isChatOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-24 w-72 bg-[#0A0A0B]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl"
              >
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    autoFocus
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/5 text-sm text-white px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-amber-500 text-black rounded-xl hover:bg-amber-400 transition-colors hidden sm:block"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <canvas ref={canvasRef} className="hidden" />
        </div>

        <AnimatePresence>
          {isCameraActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute bottom-32 right-8 w-24 h-32 rounded-2xl overflow-hidden border border-white/10 shadow-2xl z-40 bg-black"
            >
              <video
                ref={videoRef}
                className="w-full h-full object-cover transform -scale-x-100"
                autoPlay
                playsInline
                muted
              />
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </motion.div>
          )}
        </AnimatePresence>

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
                      animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
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
                <h3 className="text-xl font-medium">Agent Settings</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full hover:bg-white/5 text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                <div className="p-5 bg-white/5 border border-white/10 rounded-[24px] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">
                        Google Integration
                      </span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${googleToken ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
                        <span className={`text-xs font-mono uppercase tracking-widest ${googleToken ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {googleToken ? 'Authenticated' : 'Connection Required'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={onLogin}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      {googleToken ? 'Sync permissions' : 'Connect'}
                    </button>
                  </div>

                  {!googleToken && (
                    <p className="text-[10px] text-gray-500 leading-relaxed uppercase tracking-tighter">
                      Connect to enable Gmail, Calendar, Drive, and real-time task management capabilities.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">
                    Persona Name
                  </label>
                  <input
                    type="text"
                    value={personaName}
                    onChange={(e) => setPersonaName(e.target.value)}
                    placeholder="e.g. Beatrice"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500/50 transition-colors text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">
                    System Prompt Context
                  </label>
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
                      <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                        Conversation Context
                      </label>
                      <span className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
                        {contextSize} Messages
                      </span>
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

                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">
                    Agent Voice
                  </label>

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