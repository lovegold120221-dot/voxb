import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { Square, Loader2, Power, Check, Settings, X, Save, Activity, Video, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { KaraokeTranscript } from './components/KaraokeTranscript';
import { ChatPage } from './components/ChatPage';
import { VideoPage } from './components/VideoPage';
import { ComputerPage } from './components/ComputerPage';
import { detectExecutionIntent } from './lib/executionDetector';
import { createSandboxTask, pollTaskStatus, stopPolling, retryTask } from './lib/sandboxClient';
import type { ComputerTask } from './lib/executionDetector';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'nl-BE', label: 'Dutch (Belgium) / Vlaams' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian' },
  { code: 'am', label: 'Amharic' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hy', label: 'Armenian' },
  { code: 'as', label: 'Assamese' },
  { code: 'ay', label: 'Aymara' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'bm', label: 'Bambara' },
  { code: 'eu', label: 'Basque' },
  { code: 'be', label: 'Belarusian' },
  { code: 'bn', label: 'Bengali' },
  { code: 'bho', label: 'Bhojpuri' },
  { code: 'bs', label: 'Bosnian' },
  { code: 'br', label: 'Breton' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'my', label: 'Burmese' },
  { code: 'ca', label: 'Catalan' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'co', label: 'Corsican' },
  { code: 'hr', label: 'Croatian' },
  { code: 'cs', label: 'Czech' },
  { code: 'da', label: 'Danish' },
  { code: 'dv', label: 'Divehi' },
  { code: 'nl', label: 'Dutch' },
  { code: 'dz', label: 'Dzongkha' },
  { code: 'eo', label: 'Esperanto' },
  { code: 'et', label: 'Estonian' },
  { code: 'ee', label: 'Ewe' },
  { code: 'fo', label: 'Faroese' },
  { code: 'fj', label: 'Fijian' },
  { code: 'fil', label: 'Filipino' },
  { code: 'fi', label: 'Finnish' },
  { code: 'fr', label: 'French' },
  { code: 'fy', label: 'Frisian' },
  { code: 'ff', label: 'Fulah' },
  { code: 'gl', label: 'Galician' },
  { code: 'ka', label: 'Georgian' },
  { code: 'de', label: 'German' },
  { code: 'el', label: 'Greek' },
  { code: 'gn', label: 'Guarani' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ht', label: 'Haitian Creole' },
  { code: 'ha', label: 'Hausa' },
  { code: 'haw', label: 'Hawaiian' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hmn', label: 'Hmong' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'is', label: 'Icelandic' },
  { code: 'ig', label: 'Igbo' },
  { code: 'ilo', label: 'Ilocano' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ga', label: 'Irish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'jv', label: 'Javanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'km', label: 'Khmer' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'ky', label: 'Kyrgyz' },
  { code: 'ko', label: 'Korean' },
  { code: 'ku', label: 'Kurdish' },
  { code: 'ckb', label: 'Kurdish (Sorani)' },
  { code: 'lo', label: 'Lao' },
  { code: 'la', label: 'Latin' },
  { code: 'lv', label: 'Latvian' },
  { code: 'ln', label: 'Lingala' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'lg', label: 'Luganda' },
  { code: 'lb', label: 'Luxembourgish' },
  { code: 'mk', label: 'Macedonian' },
  { code: 'mg', label: 'Malagasy' },
  { code: 'ms', label: 'Malay' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mt', label: 'Maltese' },
  { code: 'mi', label: 'Maori' },
  { code: 'mr', label: 'Marathi' },
  { code: 'mni', label: 'Meiteilon (Manipuri)' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'ne', label: 'Nepali' },
  { code: 'nso', label: 'Northern Sotho' },
  { code: 'no', label: 'Norwegian' },
  { code: 'nb', label: 'Norwegian Bokmål' },
  { code: 'nn', label: 'Norwegian Nynorsk' },
  { code: 'oc', label: 'Occitan' },
  { code: 'or', label: 'Odia (Oriya)' },
  { code: 'om', label: 'Oromo' },
  { code: 'ps', label: 'Pashto' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'qu', label: 'Quechua' },
  { code: 'ro', label: 'Romanian' },
  { code: 'rm', label: 'Romansh' },
  { code: 'rn', label: 'Rundi' },
  { code: 'ru', label: 'Russian' },
  { code: 'sm', label: 'Samoan' },
  { code: 'sg', label: 'Sango' },
  { code: 'sa', label: 'Sanskrit' },
  { code: 'gd', label: 'Scottish Gaelic' },
  { code: 'sr', label: 'Serbian' },
  { code: 'st', label: 'Sesotho' },
  { code: 'sn', label: 'Shona' },
  { code: 'sd', label: 'Sindhi' },
  { code: 'si', label: 'Sinhala' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'so', label: 'Somali' },
  { code: 'es', label: 'Spanish' },
  { code: 'su', label: 'Sundanese' },
  { code: 'sw', label: 'Swahili' },
  { code: 'ss', label: 'Swati' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'ty', label: 'Tahitian' },
  { code: 'tg', label: 'Tajik' },
  { code: 'ta', label: 'Tamil' },
  { code: 'tt', label: 'Tatar' },
  { code: 'te', label: 'Telugu' },
  { code: 'th', label: 'Thai' },
  { code: 'bo', label: 'Tibetan' },
  { code: 'ti', label: 'Tigrinya' },
  { code: 'ts', label: 'Tsonga' },
  { code: 'tn', label: 'Tswana' },
  { code: 'tr', label: 'Turkish' },
  { code: 'tk', label: 'Turkmen' },
  { code: 'tw', label: 'Twi' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ug', label: 'Uyghur' },
  { code: 'uz', label: 'Uzbek' },
  { code: 've', label: 'Venda' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'cy', label: 'Welsh' },
  { code: 'wo', label: 'Wolof' },
  { code: 'xh', label: 'Xhosa' },
  { code: 'yi', label: 'Yiddish' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'zu', label: 'Zulu' },
];

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sessionId?: string;
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
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    console.error("Missing GEMINI_API_KEY. Check .env.local file.");
  }

  return key || "";
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLanguage, setAuthLanguage] = useState(() => {
    try { return localStorage.getItem('beatrice_language') || 'en'; } catch { return 'en'; }
  });
  const [authError, setAuthError] = useState('');

  const clearStoredToken = useCallback(() => {
    try {
      localStorage.removeItem('beatrice_google_token');
      localStorage.removeItem('beatrice_google_uid');
    } catch {}
  }, []);

  const storeToken = useCallback((token: string, uid: string) => {
    try {
      localStorage.setItem('beatrice_google_token', token);
      localStorage.setItem('beatrice_google_uid', uid);
    } catch {}
  }, []);

  const restoreStoredToken = useCallback((uid: string): string | null => {
    try {
      const stored = localStorage.getItem('beatrice_google_token');
      const storedUid = localStorage.getItem('beatrice_google_uid');
      return stored && storedUid === uid ? stored : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        try {
          const restored = restoreStoredToken(u.uid);
          if (restored) {
            setGoogleToken(restored);
          }

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
      provider.addScope('https://www.googleapis.com/auth/gmail.compose');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      provider.addScope('https://www.googleapis.com/auth/gmail.labels');
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
      provider.addScope('https://www.googleapis.com/auth/calendar');
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      provider.addScope('https://www.googleapis.com/auth/tasks');
      provider.addScope('https://www.googleapis.com/auth/youtube');
      provider.addScope('https://www.googleapis.com/auth/youtube.force-ssl');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      provider.addScope('https://www.googleapis.com/auth/documents');
      provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
      provider.addScope('https://www.googleapis.com/auth/userinfo.profile');

      provider.setCustomParameters({
        prompt: 'consent',
        access_type: 'offline'
      });

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        storeToken(credential.accessToken, result.user.uid);
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!authEmail || !authPassword) { setAuthError('Email and password required'); return; }
    if (authPassword.length < 6) { setAuthError('Password must be at least 6 characters'); return; }
    try {
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      try { localStorage.setItem('beatrice_language', authLanguage); } catch {}
    } catch (err: any) {
      const msg = err.code === 'auth/email-already-in-use' ? 'Email already registered. Sign in instead.'
        : err.code === 'auth/user-not-found' ? 'No account with this email. Sign up instead.'
        : err.code === 'auth/wrong-password' ? 'Wrong password. Try again.'
        : err.code === 'auth/invalid-credential' ? 'Invalid email or password.'
        : err.code === 'auth/too-many-requests' ? 'Too many attempts. Try later.'
        : err.message || 'Authentication failed';
      setAuthError(msg);
    }
  };

  const handleLogout = () => {
    setGoogleToken(null);
    clearStoredToken();
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
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none dot-pattern" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex flex-col items-center max-w-sm w-full"
        >
          <div className="group relative mb-10">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-900/40 p-[1px] relative">
              <div className="w-full h-full rounded-full bg-[#0A0A0B] flex items-center justify-center border border-amber-500/10">
                <Activity className="w-10 h-10 text-amber-500" />
              </div>
            </div>
          </div>
          <h1 className="text-4xl font-light tracking-tighter mb-1 text-white font-sans uppercase">
            Beatrice
          </h1>
          <p className="text-amber-500/40 text-center mb-8 leading-relaxed font-mono text-[10px] uppercase tracking-[0.2em]">
            Precision Vocal Synthesis // Integrated Intelligence
          </p>
          <form onSubmit={handleEmailAuth} className="w-full space-y-3 mb-4">
            <div className="flex rounded-xl overflow-hidden border border-zinc-800 focus-within:border-amber-500/40 transition-colors">
              <input
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                className="flex-1 bg-[#0A0A0B] text-zinc-200 placeholder-zinc-600 text-sm px-4 py-3 outline-none"
              />
            </div>
            <div className="flex rounded-xl overflow-hidden border border-zinc-800 focus-within:border-amber-500/40 transition-colors">
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                className="flex-1 bg-[#0A0A0B] text-zinc-200 placeholder-zinc-600 text-sm px-4 py-3 outline-none"
              />
            </div>
            {authError && (
              <p className="text-red-400 text-xs text-center">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium hover:bg-amber-500/20 transition-all"
            >
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <button
            onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); }}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 tracking-wider uppercase transition-colors mb-5"
          >
            {authMode === 'signin' ? 'Create an account instead' : 'Sign in instead'}
          </button>
          <div className="flex items-center gap-3 w-full mb-5">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[10px] text-zinc-700 uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm font-medium hover:border-zinc-700 hover:text-white transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div className="mt-6 w-full">
            <select
              value={authLanguage}
              onChange={e => { setAuthLanguage(e.target.value); try { localStorage.setItem('beatrice_language', e.target.value); } catch {} }}
              className="w-full bg-[#0A0A0B] border border-zinc-800 text-zinc-400 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-amber-500/40 transition-colors appearance-none cursor-pointer"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-6 flex items-center gap-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
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
  const [showVideoPage, setShowVideoPage] = useState(false);
  const [showChatPage, setShowChatPage] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showComputerPage, setShowComputerPage] = useState(false);
  const [computerTask, setComputerTask] = useState<ComputerTask | null>(null);
  const [computerOutput, setComputerOutput] = useState<{ content: string; title: string } | null>(null);
  const [computerPreviewUrl, setComputerPreviewUrl] = useState<string | null>(null);
  const [computerDownloadUrl, setComputerDownloadUrl] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState("Beatrice");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("Charon");
  const [contextSize, setContextSize] = useState(20);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const sessionStartingRef = useRef(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const cloudCanvasRef = useRef<HTMLCanvasElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<any>(null);

  const transcriptRef = useRef<{ text: string; role: 'user' | 'model' } | null>(null);
  const transcriptTimeoutRef = useRef<any>(null);
  const speakingTimeoutRef = useRef<any>(null);
  const lastVoiceTriggerRef = useRef<string>('');

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
      sendTextToLive("The user just turned off their camera. They can no longer see you either.");
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

      sendTextToLive("The user just turned on their camera. You can now see them. React naturally - greet them like you're on a video call. Make eye contact references, comment on what you see casually, keep it warm and human.");
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  const activeTaskIdRef = useRef<string | null>(null);

  const tryTriggerComputerTask = async (text: string) => {
    const intent = detectExecutionIntent(text);
    if (!intent) return;

    try {
      sendTextToLive(
        `The Boss wants me to create a ${intent.type}: "${intent.label}". Acknowledge it briefly and say you're working on it now — keep it natural, like a capable assistant.`
      );
      await new Promise(r => setTimeout(r, 1200));

      const { taskId, task } = await createSandboxTask(intent.type, intent.label, text, user?.email || undefined, user?.uid || undefined);
      activeTaskIdRef.current = taskId;
      setComputerTask(task);
      setComputerOutput(null);
      setComputerPreviewUrl(null);
      setComputerDownloadUrl(null);
      setShowComputerPage(true);

      pollTaskStatus(
        taskId,
        (updatedTask) => {
          setComputerTask(updatedTask);
        },
        (finalTask, output, previewUrl, downloadUrl) => {
          setComputerTask(finalTask);
          if (output) {
            setComputerOutput({ content: output.content, title: output.title });
          }
          if (previewUrl) setComputerPreviewUrl(previewUrl);
          if (downloadUrl) setComputerDownloadUrl(downloadUrl);

          const outputName = output?.title || finalTask.label;
          const userRef = user?.email ? ` for ${user.email}` : '';
          sendTextToLive(
            `The user (${user?.uid || 'unknown'}) asked: "${text}". The task is ${finalTask.status === 'done' ? 'finished' : 'stopped'}: ${outputName}${userRef}. ${finalTask.status === 'done' ? 'The output is ready. Tell the Boss naturally that it is ready to view.' : 'There was a problem. Tell the Boss honestly that it ran into an issue but the partial result is saved.'} Keep it casual.`
          );
        },
        (error) => {
          console.error('Task error:', error);
          sendTextToLive(
            `The task for "${text}" ran into a problem. Tell the Boss honestly what happened in simple words — no technical jargon. Mention that the partial output might still be saved.`
          );
        }
      );
    } catch (err) {
      console.error('Failed to create sandbox task:', err);
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      setComputerTask(null);
      setComputerOutput(null);
      setComputerPreviewUrl(null);
      setComputerDownloadUrl(null);

      const { taskId: newId, task } = await retryTask(taskId);
      activeTaskIdRef.current = newId;
      setComputerTask(task);

      pollTaskStatus(
        newId,
        (updatedTask) => {
          setComputerTask(updatedTask);
        },
        (finalTask, output, previewUrl, downloadUrl) => {
          setComputerTask(finalTask);
          if (output) {
            setComputerOutput({ content: output.content, title: output.title });
          }
          if (previewUrl) setComputerPreviewUrl(previewUrl);
          if (downloadUrl) setComputerDownloadUrl(downloadUrl);

          const outputName = output?.title || finalTask.label;
          sendTextToLive(
            `The retry task is ${finalTask.status === 'done' ? 'finished' : 'stopped'}: ${outputName}. ${finalTask.status === 'done' ? 'The output is ready. Tell the Boss naturally that it is ready to view.' : 'There was a problem on retry. Tell the Boss honestly.'}`
          );
        },
        (error) => {
          console.error('Retry error:', error);
        }
      );
    } catch (err) {
      console.error('Failed to retry task:', err);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();

    const text = chatInput.trim();

    if (!text || !sessionRef.current || !isActive) return;

    setCurrentTranscript({ role: 'user', text });
    setMessages(prev => [...prev, { role: 'user', text, timestamp: new Date().toISOString() }]);
    saveMessage('user', text);
    sendTextToLive(text);
    tryTriggerComputerTask(text);
    setChatInput("");
  };

  useEffect(() => {
    let animationFrame: number;
    const cloudPuffs = Array.from({ length: 10 }, (_, i) => ({
      cx: 0.2 + Math.random() * 0.6,
      cy: 0.2 + Math.random() * 0.6,
      r: 0.12 + Math.random() * 0.2,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      speedX: 0.15 + Math.random() * 0.25,
      speedY: 0.12 + Math.random() * 0.2,
    }));

    const drawClouds = (avg: number, peak: number) => {
      const canvas = cloudCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = 208 * dpr;
      const h = 208 * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      const time = Date.now() / 1000;
      const boost = 1 + avg * 0.6 + peak * 0.4;

      cloudPuffs.forEach((puff, i) => {
        const driftX = Math.sin(time * puff.speedX + puff.phaseX) * 0.12;
        const driftY = Math.cos(time * puff.speedY + puff.phaseY) * 0.1;
        const x = (puff.cx + driftX) * w;
        const y = (puff.cy + driftY) * h;
        const baseR = puff.r * w * 0.45;
        const r = baseR * boost;

        const alpha = 0.12 + avg * 0.25 + peak * 0.15;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(208, 167, 139, ${Math.min(1, alpha * 1.5)})`);
        gradient.addColorStop(0.4, `rgba(208, 167, 139, ${Math.min(1, alpha * 0.8)})`);
        gradient.addColorStop(0.7, `rgba(208, 167, 139, ${Math.min(1, alpha * 0.3)})`);
        gradient.addColorStop(1, 'rgba(208, 167, 139, 0)');

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const updateVolumes = () => {
      if (isActive && audioStreamerRef.current && audioRecorderRef.current) {
        const streamerVols = audioStreamerRef.current.getFrequencies(11);
        const recorderVols = audioRecorderRef.current.getFrequencies(11);

        setVolumes(prev => prev.map((v, i) => {
          let target = Math.max(streamerVols[i] || 0, recorderVols[i] || 0);
          target = Math.min(1, target * 1.5);
          return v + (target - v) * 0.4;
        }));

        const avg = streamerVols.reduce((a, b) => a + b, 0) / streamerVols.length;
        const peak = Math.max(...streamerVols);
        drawClouds(avg, peak);
      } else {
        setVolumes(prev => prev.map(v => v + (0.05 - v) * 0.2));
        drawClouds(0.05, 0.05);
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
      orderBy('timestamp', 'desc')
    );

    const unsubHistory = onSnapshot(
      historyQuery,
      (snap) => {
        const msgs: string[] = [];
        const docs = snap.docs.reverse();
        const messageList: ChatMessage[] = [];

        docs.forEach(d => {
          const m = d.data() as ChatMessage;
          msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
          messageList.push(m);
        });

        setMessages(messageList);

        if (msgs.length > 0) {
          const contextMsgs = msgs.slice(-contextSize);
          setHistoryContext("Previous conversation for context memory:\n" + contextMsgs.join("\n"));
        } else {
          setHistoryContext("");
        }

        if (messageList.length > 0 && !selectedSessionId) {
          const newest = [...messageList].reverse().find(m => m.sessionId);
          if (newest?.sessionId) setSelectedSessionId(newest.sessionId);
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

  const sessions = useMemo(() => {
    const groups = new Map<string, { id: string; messages: ChatMessage[]; startTime: Date; endTime: Date; preview: string; count: number }>();
    messages.forEach(m => {
      const sid = m.sessionId || 'default';
      if (!groups.has(sid)) {
        groups.set(sid, { id: sid, messages: [], startTime: new Date(), endTime: new Date(), preview: '', count: 0 });
      }
      groups.get(sid)!.messages.push(m);
    });
    return Array.from(groups.values()).map(g => {
      g.messages.sort((a, b) => {
        const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return ta.getTime() - tb.getTime();
      });
      const first = g.messages[0];
      const last = g.messages[g.messages.length - 1];
      g.startTime = first?.timestamp?.toDate ? first.timestamp.toDate() : new Date(first?.timestamp || 0);
      g.endTime = last?.timestamp?.toDate ? last.timestamp.toDate() : new Date(last?.timestamp || 0);
      g.count = g.messages.length;
      g.preview = first?.text?.slice(0, 80) || '';
      return g;
    }).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }, [messages]);

  const selectedMessages = useMemo(() => {
    if (!selectedSessionId) return messages;
    return messages.filter(m => m.sessionId === selectedSessionId);
  }, [messages, selectedSessionId]);

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

    sessionIdRef.current = crypto.randomUUID();

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

    const gFetch = async (tok: string, url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> => {
      try {
        const res = await fetch(url, {
          ...options,
          headers: { ...options?.headers, Authorization: `Bearer ${tok}` },
        });
        const data = await res.json();
        const isAuthErr = res.status === 401 || res.status === 403;
        return { ok: res.ok, status: res.status, data: isAuthErr ? { ...data, _authError: true } : data };
      } catch (err) {
        return { ok: false, status: 0, data: { error: String(err) } };
      }
    };

    const tok = googleToken;

    const googleTools = [
      {
        name: "list_gmail_messages",
        description: "Read the most recent emails from the user's Gmail inbox. Returns subject, sender, date, and preview for each message.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            maxResults: {
              type: Type.NUMBER,
              description: "Number of emails to fetch. Maximum 5."
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
      },
      {
        name: "list_drive_files",
        description: "List files and folders from the user's Google Drive.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            pageSize: {
              type: Type.NUMBER,
              description: "Number of files to list. Maximum 20."
            }
          }
        }
      },
      {
        name: "search_drive_files",
        description: "Search the user's Google Drive using a query string (e.g. 'title contains report').",
        parameters: {
          type: Type.OBJECT,
          properties: {
            q: {
              type: Type.STRING,
              description: "The Drive API query string."
            }
          },
          required: ["q"]
        }
      },
      {
        name: "get_drive_file",
        description: "Get metadata and download link for a specific file in Google Drive.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            fileId: {
              type: Type.STRING,
              description: "The Drive file ID."
            }
          },
          required: ["fileId"]
        }
      },
      {
        name: "send_gmail_message",
        description: "Send an email message via Gmail on behalf of the user.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            to: {
              type: Type.STRING,
              description: "Recipient email address."
            },
            subject: {
              type: Type.STRING,
              description: "Email subject line."
            },
            body: {
              type: Type.STRING,
              description: "Email body content in plain text."
            }
          },
          required: ["to", "subject", "body"]
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

                    if (call.name !== 'get_user_location' && !tok) {
                      result = { error: "Access token expired or missing. Please re-authenticate Google services in settings." };
                    } else if (call.name === 'list_gmail_messages') {
                      const max = Math.min((call.args as any).maxResults || 5, 5);
                      const listR = await gFetch(tok, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=in:inbox`);
                      if (listR.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!listR.ok) { result = { error: listR.data?.error || 'Gmail list failed' }; }
                      else {
                        const msgList = listR.data?.messages || [];
                        const details = await Promise.all(msgList.slice(0, max).map(async (m: any) => {
                          const dR = await gFetch(tok, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
                          if (dR.ok && dR.data) {
                            const headers = (dR.data.payload?.headers || []).reduce((acc: any, h: any) => { acc[h.name] = h.value; return acc; }, {});
                            return { id: m.id, snippet: dR.data.snippet, subject: headers.Subject, from: headers.From, date: headers.Date };
                          }
                          return m;
                        }));
                        result = { messages: details, resultSizeEstimate: listR.data.resultSizeEstimate };
                      }
                    } else if (call.name === 'list_calendar_events') {
                      const r = await gFetch(tok, `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&timeMin=${encodeURIComponent((call.args as any).timeMin || new Date().toISOString())}`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Calendar request failed' }; }
                      else { result = r.data; }
                    } else if (call.name === 'list_google_tasks') {
                      const r = await gFetch(tok, `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Tasks request failed' }; }
                      else { result = r.data; }
                    } else if (call.name === 'list_drive_files') {
                      const r = await gFetch(tok, `https://www.googleapis.com/drive/v3/files?pageSize=${Math.min((call.args as any).pageSize || 20, 20)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Drive request failed' }; }
                      else { result = r.data; }
                    } else if (call.name === 'search_drive_files') {
                      const q = encodeURIComponent((call.args as any).q || '');
                      const r = await gFetch(tok, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Drive search failed' }; }
                      else { result = r.data; }
                    } else if (call.name === 'get_drive_file') {
                      const fileId = (call.args as any).fileId;
                      const r = await gFetch(tok, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Drive file request failed' }; }
                      else { result = r.data; }
                    } else if (call.name === 'send_gmail_message') {
                      const args = call.args as any;
                      if (!tok) { result = { error: "Access token missing. Re-authenticate in settings." }; } else {
                        const emailLines = [
                          `From: me`, `To: ${args.to}`, `Subject: ${args.subject}`,
                          'Content-Type: text/plain; charset=UTF-8', '', args.body || ''
                        ];
                        const encodedEmail = btoa(emailLines.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                        const r = await gFetch(tok, `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
                          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encodedEmail }) }
                        );
                        if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                        else if (!r.ok) { result = { error: r.data?.error || 'Send failed' }; }
                        else { result = r.data; }
                      }
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
                      const r = await gFetch(tok, `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent((call.args as any).q)}&maxResults=5&type=video`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'YouTube search failed' }; }
                      else { result = r.data; }
                    } else if (call.name === 'create_google_task') {
                      const r = await gFetch(tok, `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: (call.args as any).title, notes: (call.args as any).notes || "" }) }
                      );
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Task creation failed' }; }
                      else { result = r.data; }
                    } else if (call.name === 'execute_google_service') {
                      if (!tok) { result = { error: "Access token missing. Re-authenticate in settings." }; } else {
                        const args = call.args as any;
                        const serviceMap: Record<string, string> = {
                          gmail: 'https://gmail.googleapis.com',
                          calendar: 'https://www.googleapis.com/calendar/v3',
                          tasks: 'https://tasks.googleapis.com',
                          drive: 'https://www.googleapis.com/drive/v3',
                          youtube: 'https://www.googleapis.com/youtube/v3',
                          sheets: 'https://sheets.googleapis.com/v4',
                          docs: 'https://docs.googleapis.com/v1',
                        };
                        const baseUrl = serviceMap[args.serviceName?.toLowerCase()] || `https://${args.serviceName}.googleapis.com`;
                        const r = await gFetch(tok, `${baseUrl}/${args.action || ''}`);
                        if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                        else if (!r.ok) { result = { error: r.data?.error || 'Service request failed' }; }
                        else { result = r.data; }
                      }
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
                  tryTriggerComputerTask(text);

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
                  setMessages(prev => [...prev, { role: 'model', text: current.text, timestamp: new Date().toISOString() }]);
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
        sessionId: sessionIdRef.current,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/messages`);
    }
  };

  return (
    <div className="min-h-screen bg-[#161312] text-zinc-100 flex flex-col h-[100dvh] overflow-hidden select-none relative">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(208,167,139,0.04),transparent_75%)] pointer-events-none z-0"
      />

      <header className="sticky top-0 w-full bg-[#161312]/95 backdrop-blur-md border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between z-30">
        <div className="flex items-center">
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 -ml-1.5 rounded-lg text-zinc-400 hover:text-[#d0a78b] hover:bg-zinc-800/50 transition-all duration-300"
            aria-label="Open Settings"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>

        <div className="text-center flex flex-col items-center">
          <h1 className="text-xl font-semibold tracking-wide text-[#d0a78b]">{personaName}</h1>
          <p className="text-[9px] text-zinc-500 tracking-[0.22em] lowercase -mt-0.5">eburon ai</p>
        </div>

        <div className="flex items-center">
          <button
            onClick={onLogout}
            className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center hover:border-[#d0a78b]/50 transition-all duration-300"
            aria-label="User Profile"
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-zinc-400 text-xs font-medium">{user.displayName?.charAt(0) || 'M'}</span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start relative z-10 pt-4 pb-24 overflow-hidden">

        <p className="text-zinc-300 text-sm font-normal tracking-wide mt-2 px-6 text-center transition-all duration-300">
          {isActive ? 'Beatrice is listening...' : connecting ? 'Connecting...' : 'Beatrice is offline. Connect to begin.'}
        </p>

        <div className="relative flex-1 flex items-center justify-center w-full max-h-[300px] mt-6">
          <div
            className={`absolute w-72 h-72 ${isActive ? 'bg-[#d0a78b]/25' : 'bg-[#d0a78b]/10'} rounded-full blur-3xl transition-all duration-700 ${isActive ? 'orb-pulse-active' : ''}`}
          />

          <button
            onClick={isActive ? stopSession : startSession}
            disabled={connecting}
            className="relative w-52 h-52 rounded-full bg-[#1c1614]/60 border border-[#d0a78b]/20 overflow-hidden flex items-center justify-center transition-all duration-500 hover:border-[#d0a78b] hover:shadow-[0_0_55px_rgba(208,167,139,0.3)] active:scale-[0.98]"
            aria-label="Toggle Voice Assistant"
          >
            <div className="absolute inset-0 bg-black/5 backdrop-blur-[12px] z-10 rounded-full pointer-events-none" />

            <div className="absolute inset-0 w-full h-full flex items-center justify-center transition-transform duration-100 ease-out z-0">
              <div className="blob-1 absolute w-48 h-48 rounded-full bg-[radial-gradient(circle,rgba(208,167,139,0.65)_0%,transparent_70%)] blur-md" />
              <div className="blob-2 absolute w-44 h-44 rounded-full bg-[radial-gradient(circle,rgba(171,123,96,0.45)_0%,transparent_70%)] blur-md" />
              <div className="blob-3 absolute w-40 h-40 rounded-full bg-[radial-gradient(circle,rgba(235,208,188,0.55)_0%,transparent_70%)] blur-md" />
              <div className="absolute w-16 h-16 rounded-full bg-[#d0a78b]/15 blur-xl" />
            </div>

            <div className="absolute inset-0 z-20 rounded-full flex items-center justify-center overflow-hidden">
              <canvas
                ref={cloudCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                width={208}
                height={208}
              />
              {connecting ? (
                <Loader2 className="w-10 h-10 animate-spin text-[#d0a78b] z-10" />
              ) : isActive ? null : null}
            </div>
          </button>
        </div>

        <div className="w-full max-w-sm px-8 flex flex-col items-center justify-center text-center h-[64px] transition-opacity duration-700">
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
      </main>

      <footer className="sticky bottom-0 w-full h-[92px] bg-[#161312]/95 backdrop-blur-md border-t border-zinc-800/60 z-20 px-6 box-border select-none">
        <div className="relative w-full h-full flex items-center justify-between">

          <button
            onClick={() => setShowChatPage(true)}
            className="absolute left-[50px] flex flex-col items-center justify-center text-zinc-400 hover:text-[#d0a78b] transition-colors duration-300"
          >
            <MessageSquare className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Chat</span>
          </button>

          <button
            onClick={isActive ? stopSession : startSession}
            disabled={connecting}
            className={`absolute left-1/2 -translate-x-1/2 bottom-[55px] w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-xl transition-all duration-300 border-4 border-[#161312] z-30 ${
              isActive
                ? 'bg-zinc-900 text-[#d0a78b] border-2 border-[#d0a78b]/40'
                : 'bg-[#d0a78b] text-black hover:bg-[#ebd0bc] shadow-[#d0a78b]/20'
            }`}
          >
            {connecting ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : isActive ? (
              <Square className="w-6 h-6 fill-current" />
            ) : (
              <Power className="w-7 h-7" />
            )}
            <span className="text-[9px] font-extrabold uppercase tracking-widest mt-1">
              {isActive ? 'Stop' : 'Start'}
            </span>
          </button>

          <button
            onClick={() => setShowVideoPage(true)}
            className="absolute right-[50px] flex flex-col items-center justify-center text-zinc-400 hover:text-[#d0a78b] transition-colors duration-300"
          >
            <Video className="w-5 h-5 mb-1" />
            <span className="text-xs font-medium">Video</span>
          </button>
        </div>
      </footer>

      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence>
        {showChatPage && (
          <ChatPage
            messages={selectedMessages}
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={setSelectedSessionId}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={handleSendChat}
            onClose={() => setShowChatPage(false)}
            isActive={isActive}
            personaName={personaName}
            userName={user.displayName?.split(' ')[0] || 'Commander'}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVideoPage && (
          <VideoPage
            onClose={() => setShowVideoPage(false)}
            isCameraActive={isCameraActive}
            toggleCamera={toggleCamera}
            videoRef={videoRef}
            canvasRef={canvasRef}
            isActive={isActive}
            sendVideoToLive={sendVideoToLive}
            sendTextToLive={sendTextToLive}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showComputerPage && computerTask && (
          <ComputerPage
            task={computerTask}
            onClose={() => {
              if (activeTaskIdRef.current) {
                stopPolling(activeTaskIdRef.current);
                activeTaskIdRef.current = null;
              }
              setShowComputerPage(false);
              setComputerTask(null);
              setComputerOutput(null);
              setComputerPreviewUrl(null);
              setComputerDownloadUrl(null);
            }}
            onRetry={handleRetryTask}
            personaName={personaName}
            outputContent={computerOutput?.content}
            outputTitle={computerOutput?.title}
            previewUrl={computerPreviewUrl}
            downloadUrl={computerDownloadUrl}
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-28 left-0 right-0 px-8 z-30 pointer-events-none">
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
                backgroundColor: task.status === 'processing' ? 'rgba(208, 167, 139, 0.1)' : 'rgba(16, 185, 129, 0.15)',
                borderColor: task.status === 'processing' ? 'rgba(208, 167, 139, 0.2)' : 'rgba(16, 185, 129, 0.3)',
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
                  <Loader2 className="w-4 h-4 text-[#d0a78b] animate-spin" />
                  <motion.div
                    animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                    className="absolute inset-0 bg-[#d0a78b]/50 rounded-full blur-[2px]"
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
                    animate={{ color: task.status === 'processing' ? '#d0a78b' : '#10b981' }}
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
                  aria-label="Close Settings"
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
                      Connect to enable Gmail, Calendar, Drive, Tasks, and YouTube capabilities.
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
                    aria-label="Persona Name"
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
                      aria-label="System Prompt Context Size"
                      title="System Prompt Context Size"
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