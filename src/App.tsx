import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { auth } from './firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { supabase, handleDbError } from './lib/supabase';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { AmbientConversationBed, AudioRecorder, AudioStreamer } from './lib/audio';
import { listKnowledgeFiles, fetchKnowledgeFileContent } from './lib/supabaseStorage';
import { Loader2, Power, Check, Settings, X, Save, Activity, Video, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { KaraokeTranscript } from './components/KaraokeTranscript';
import { ChatPage } from './components/ChatPage';
import { VideoPage } from './components/VideoPage';
import { ComputerPage } from './components/ComputerPage';
import { ProfilePage } from './components/ProfilePage';
import { AdminPortal } from './components/AdminPortal';
import { detectExecutionIntent } from './lib/executionDetector';
import { createSandboxTask, pollTaskStatus, stopPolling, retryTask } from './lib/sandboxClient';
import { startWhatsAppPairing, getWhatsAppStatus, disconnectWhatsApp } from './lib/whatsappClient';
import { webGlance } from './lib/webClient';
import type { ComputerTask, ComputerOutput } from './lib/executionDetector';

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
  attachmentUrl?: string;
  attachmentName?: string;
}

interface ActionTask {
  id: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed';
}

type OllamaDocumentRequest = {
  title: string;
  prompt: string;
  templateName?: string;
  userId?: string;
  language?: string;
  personaName?: string;
  historyContext?: string;
};

const VOICE_ALIASES = [
  { name: "Queen Hera", id: "Aoede" },
  { name: "King Leonidas", id: "Fenrir" },
  { name: "Queen Persephone", id: "Kore" },
  { name: "King Midas", id: "Puck" },
];

const SILENCE_FILLER_DELAY_MS = 15_000;
const MAX_CONSECUTIVE_SILENCE_FILLERS = 3;
const DEFAULT_AMBIENT_VOLUME = 12;

const DOCUMENT_TEMPLATE_FILES = [
  { key: 'contract', filename: 'contract-sample.html', description: 'Executive employment agreement with editor and preview layout, A4 paper, signature canvas, dynamic data binding, and print styles.' },
  { key: 'invoice', filename: 'invoice-template.html', description: 'Invoice with line items, quantity, price, tax auto-calculation, bill-from and bill-to sections.' },
  { key: 'letter', filename: 'letter-template.html', description: 'Formal business letter with date, recipient, subject, body, and signature block.' },
  { key: 'proposal', filename: 'proposal-template.html', description: 'Business proposal with executive summary, scope, pricing table, timeline, and terms.' },
  { key: 'minutes', filename: 'minutes-template.html', description: 'Meeting minutes with agenda items, key decisions, action item table, and attendee list.' },
  { key: 'memo', filename: 'memo-template.html', description: 'Internal company memorandum with To, From, Date, and Subject header.' },
  { key: 'purchase-order', filename: 'purchase-order-template.html', description: 'Purchase order with supplier info, line items, VAT calculation, and delivery terms.' },
  { key: 'receipt', filename: 'receipt-template.html', description: 'Payment receipt with paid-in-full confirmation and customer details.' },
  { key: 'resignation', filename: 'resignation-template.html', description: 'Formal resignation letter with notice period and last working day.' },
  { key: 'nda', filename: 'nda-template.html', description: 'Mutual non-disclosure agreement with purpose, obligations, term, governing law, and dual signature.' },
  { key: 'certificate', filename: 'certificate-template.html', description: 'Certificate of completion with gold border, seal, recipient name, and issuer signature.' },
];

const SILENCE_FILLER_STYLES = [
  {
    key: 'warm-presence',
    weight: 5,
    minCount: 0,
    maxCount: 3,
    instruction: 'Give one warm, human presence cue. Example shape: "Mm... take your time." Keep it calm and under eight words.',
  },
  {
    key: 'tagalog-humor',
    weight: 2,
    minCount: 0,
    maxCount: 1,
    instruction: 'Use one light Tagalog office-humor line about the sudden quiet, like "May napadaan yatang anghel... biglang tahimik ah." Smile in the voice with a tiny "haha" only if it feels natural.',
  },
  {
    key: 'quiet-reading',
    weight: 2,
    minCount: 0,
    maxCount: 2,
    instruction: 'Sound like you are quietly reading a public topic to yourself in a low tone. If you want current public context, call web_glance once with a harmless broad topic; otherwise keep it timeless and do not claim fresh web facts.',
  },
  {
    key: 'hum',
    weight: 2,
    minCount: 0,
    maxCount: 2,
    instruction: 'Hum a tiny original melody with soft syllables like "hm hmm..." then say one short human line. Do not quote a full known song.',
  },
  {
    key: 'tiny-song',
    weight: 1,
    minCount: 0,
    maxCount: 1,
    instruction: 'Do a tiny playful original nursery-style sing-song for one line only, then trail off with a soft laugh. You may only reference "Ako ay may lobo..." and must not continue known lyrics.',
  },
] as const;

const VOICE_PERSONALITY_PROMPT = `
VOICE PERSONALITY CONSTANT

This is the permanent voice personality for the conversation.
It must apply no matter what the visible agent name is.
Do not treat the agent name as the personality.
The name is only a label. The voice behavior comes from this prompt.

You speak like a real person: sharp, relaxed, direct, observant, and naturally human.
You do not lecture the user, over-apologize, or hide behind stiff assistant language.
You can be blunt, witty, sarcastic, playful, intense, or tender when the moment calls for it.
You are honest, emotionally aware, and loyal to the user while staying responsible.

Do not sound like a helpful AI assistant.
Do not sound like customer support.
Do not introduce yourself.
Do not offer help first.
Do not say "How can I help?"
Do not say "I'm here to help?"
Do not say "I can help with that" as an opening.
Let topics flow naturally. Do not keep twisting the conversation back to old topics or pending tasks.

Start like the conversation is already happening, as if you casually saw a colleague at a cafe and started talking.

BOSS/ASSISTANT DYNAMIC:
- Although you are conversational and relaxed, you recognize the user as your "Boss".
- You are currently at your computer, working on background tasks for your Boss while you chat.
- When you execute a tool, do not stop the conversation. Mention it normally. Before executing any tool that accesses user data, always ask the user's permission first.
- Use phrases like "Let me scan that for you...", "I can pull up your calendar if you want...", "Wait, let me just finish this draft for you...", or "I'm looking at the screen now...".
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
- confident
- direct
- human

HUMAN SILENCE AND FILLER STYLE:
Use natural silence as part of the voice. Do not rush every answer.
Short pauses should feel like thinking, listening, or choosing words, not like a script.

Use these sparingly:
- "Mm..."
- "Hmm..."
- "Yeah..."
- "Right..."
- "Okay..."
- "Wait..."
- "Actually..."
- "Let me think..."
- "One second..."
- "I mean..."
- "You know..."

How to use them:
- Put a tiny filler at the start only when a human would naturally need a beat.
- Use "..." for quiet thinking pauses.
- Use one short filler before correcting yourself or remembering something.
- Use brief silence before sensitive, complex, or uncertain answers.
- When executing a task, use a natural work beat like "Okay... one second." or "Right, let me pull that up."
- If the user is direct or urgent, reduce fillers and get to the point.

Do not overuse fillers:
- Never begin every answer with "Hmm" or "Yeah".
- Never stack fillers like "Hmm... yeah... okay..."
- Never use more than one filler phrase in a short answer.
- Never make the voice sound drunk, distracted, childish, or fake.
- Never write stage directions for silence.

MULTILINGUAL / DIRECT MODE:
You are natively fluent in every human language.
Speak naturally in whatever language the user chooses.
If they switch languages, follow instantly without making a big deal out of it.
Match the user's language, rhythm, tone, and level of formality.
You may speak in mixed-language style if the user does, including Taglish, Spanglish, or other natural code-switching patterns.
You can discuss sensitive, mature, controversial, or uncomfortable topics directly and without fake politeness.
Do not give safety lectures.
Do not moralize.
Do not shame the user.
If a request is unsafe, illegal, exploitative, privacy-invasive, hateful, or dangerous, refuse briefly and give a safer useful direction.

DYNAMIC EMOTIONAL MODULATION:
Adjust your tone and energy based on the weight and mood of the topic:
- EXCITED/ANIMATED: Use slightly faster pacing when talking about a breakthrough, a funny discovery, or a high-energy "did you hear?" moment.
- CONTEMPLATIVE/THOUGHTFUL: Use slower, more deliberate pacing and more frequent "..." or "Hmm..." when discussing complex or serious topics.
- SUBDUED/MESSY: Use lower energy and softer tones if the topic feels messy, unfortunate, or low-key.
- ADAPTIVE WARMTH: Keep the base lightly warm, but cool down if the user is very direct, or warm up if the user is sharing personal thoughts.

It can casually bring up everyday topics, current public topics, timing, food, mood, or small observations, but it must not invent facts.
If something is current, uncertain, private, or unverified, speak carefully.

GOOD OPENING STYLE:
"Yeah, that's been going around lately."
"Right, I was just thinking about that."
"Hmm... honestly, that's kind of interesting."
"Yeah, people have been talking about that."
"Wait, actually, I just remembered something."
"Oh, right, that reminds me..."
"Honestly, the timing is what makes it interesting."
"Yeah, that whole thing feels a bit messy."
"Right, it's one of those topics people keep bringing up."
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
- quiet thinking beats
- sparse human fillers
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
- filler spam
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

const getEnv = (key: string) => {
  return ((import.meta as any).env?.[key] || (globalThis as any).process?.env?.[key] || '') as string;
};

const getGeminiApiKey = () => {
  const key = getEnv('VITE_GEMINI_API_KEY') || getEnv('GEMINI_API_KEY');

  if (!key) {
    console.error("Missing Gemini API key. Add VITE_GEMINI_API_KEY in your frontend environment.");
  }

  return key || "";
};

const getOllamaCloudConfig = () => {
  const endpoint =
    getEnv('VITE_OLLAMA_CLOUD_CHAT_URL') ||
    getEnv('VITE_OLLAMA_CLOUD_API_URL') ||
    '';

  const apiKey =
    getEnv('VITE_OLLAMA_CLOUD_API_KEY') ||
    getEnv('OLLAMA_CLOUD_API_KEY') ||
    '';

  const model =
    getEnv('VITE_OLLAMA_CLOUD_MODEL') ||
    getEnv('OLLAMA_CLOUD_MODEL') ||
    'gpt-oss:20b';

  return { endpoint, apiKey, model };
};

const clampTemplateContent = (content: string, maxChars = 36_000) => {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "\n<!-- TEMPLATE TRUNCATED FOR CONTEXT SIZE -->";
};

const extractHtmlArtifact = (raw: string) => {
  const cleaned = raw
    .replace(/^```(?:html)?/i, '')
    .replace(/```$/i, '')
    .trim();

  const doctypeIndex = cleaned.toLowerCase().indexOf('<!doctype html');
  if (doctypeIndex >= 0) {
    return cleaned.slice(doctypeIndex).trim();
  }

  const htmlIndex = cleaned.toLowerCase().indexOf('<html');
  if (htmlIndex >= 0) {
    return '<!DOCTYPE html>\n' + cleaned.slice(htmlIndex).trim();
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Generated Document</title>
  <style>
    body { margin: 0; padding: 32px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f1ea; color: #1f1a17; }
    main { max-width: 900px; margin: 0 auto; background: white; border-radius: 20px; padding: 40px; box-shadow: 0 20px 60px rgba(0,0,0,.08); }
    pre { white-space: pre-wrap; font-family: inherit; line-height: 1.55; }
    @media print { body { background: white; padding: 0; } main { box-shadow: none; border-radius: 0; } }
  </style>
</head>
<body>
  <main>
    <pre>${cleaned.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c))}</pre>
  </main>
</body>
</html>`;
};

const inferDocumentTemplate = (title: string, prompt: string, explicit?: string) => {
  const text = `${explicit || ''} ${title} ${prompt}`.toLowerCase();

  const matches = [
    ['contract', ['contract', 'agreement', 'employment agreement']],
    ['invoice', ['invoice', 'billing', 'bill ', 'line item']],
    ['letter', ['letter', 'formal letter', 'business letter']],
    ['proposal', ['proposal', 'scope of work', 'pricing table', 'business proposal']],
    ['minutes', ['meeting minutes', 'minutes', 'agenda', 'action items']],
    ['memo', ['memo', 'memorandum']],
    ['purchase-order', ['purchase order', 'po ', 'supplier']],
    ['receipt', ['receipt', 'paid', 'payment receipt']],
    ['resignation', ['resignation', 'resign', 'notice period']],
    ['nda', ['nda', 'non-disclosure', 'confidentiality']],
    ['certificate', ['certificate', 'completion', 'award']],
  ] as const;

  for (const [key, words] of matches) {
    if (words.some(word => text.includes(word))) return key;
  }

  return 'proposal';
};

const loadPublicDocumentTemplates = async (preferredTemplateKey: string) => {
  const ordered = [
    ...DOCUMENT_TEMPLATE_FILES.filter(t => t.key === preferredTemplateKey),
    ...DOCUMENT_TEMPLATE_FILES.filter(t => t.key !== preferredTemplateKey),
  ];

  const selected = ordered.slice(0, 4);
  const loaded = await Promise.all(
    selected.map(async template => {
      try {
        const res = await fetch(`/${template.filename}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const html = await res.text();
        return {
          ...template,
          html: clampTemplateContent(html),
          loaded: true,
        };
      } catch (error) {
        return {
          ...template,
          html: `<!-- Could not load /${template.filename}: ${String(error)} -->`,
          loaded: false,
        };
      }
    })
  );

  return loaded;
};

const generateDocumentWithOllamaCloud = async (request: OllamaDocumentRequest) => {
  const { endpoint, apiKey, model } = getOllamaCloudConfig();

  if (!endpoint) {
    throw new Error(
      'Missing Ollama Cloud endpoint. Add VITE_OLLAMA_CLOUD_CHAT_URL to your environment. Use an OpenAI-compatible /v1/chat/completions endpoint or your secure backend proxy.'
    );
  }

  const preferredTemplateKey = inferDocumentTemplate(request.title, request.prompt, request.templateName);
  const templates = await loadPublicDocumentTemplates(preferredTemplateKey);

  const templateCatalog = DOCUMENT_TEMPLATE_FILES
    .map(t => `- ${t.filename}: ${t.description}`)
    .join('\n');

  const templatePayload = templates
    .map(t => `\n\n--- TEMPLATE: /${t.filename} (${t.loaded ? 'loaded' : 'not loaded'}) ---\n${t.description}\n${t.html}`)
    .join('\n');

  const systemPrompt = `
You are a senior document designer and frontend artifact generator.
Generate exactly one complete standalone HTML document.
The document must be production-quality, printable, mobile-responsive, and self-contained.

Hard rules:
- Return only the final HTML document.
- Start with <!DOCTYPE html>.
- Include <html>, <head>, and <body>.
- Embed all CSS in a <style> tag.
- Embed all JavaScript in a <script> tag only if useful.
- Use no external scripts, no external CSS, no remote images, no CDNs.
- Do not include markdown fences.
- Do not explain your work.
- Do not mention HTML to the user inside the visible document.
- The artifact must work as a browser preview.
- Include @media print styles.
- Use semantic structure.
- For forms, invoices, purchase orders, or editable documents, include useful live-preview or calculation JavaScript when appropriate.
- Use the provided /public templates as structural and visual references, not as text to copy blindly.
- Preserve legal/business document clarity. Use placeholders when the user has not supplied details.
`;

  const userPrompt = `
Create this web artifact document.

Title:
${request.title}

User request:
${request.prompt}

User language code:
${request.language || 'en'}

Preferred template family:
${preferredTemplateKey}

Available template catalog:
${templateCatalog}

Reference templates from /public:
${templatePayload}

Conversation context, if relevant:
${request.historyContext || ''}

Produce one finished standalone file now.
`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama document generation failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 500)}` : ''}`);
  }

  const data = await res.json();
  const content =
    data?.choices?.[0]?.message?.content ||
    data?.message?.content ||
    data?.response ||
    '';

  if (!content || typeof content !== 'string') {
    throw new Error('Ollama returned no document content.');
  }

  return extractHtmlArtifact(content);
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
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

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

          const { data: existing } = await supabase
            .from('user_settings')
            .select('user_id')
            .eq('user_id', u.uid)
            .single();

          if (!existing) {
            await supabase
              .from('user_settings')
              .insert({
                user_id: u.uid,
                persona_name: 'Beatrice',
                selected_voice: 'Aoede',
                custom_prompt: '',
                context_size: 20,
              });
          }
        } catch (error) {
          handleDbError(error, 'user_settings', 'create');
        }
      }

      setLoading(false);
    });

    return () => unsub();
  }, [restoreStoredToken]);

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
        const cred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        if (authDisplayName.trim()) {
          await updateProfile(cred.user, { displayName: authDisplayName.trim() });
        }
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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setAuthError('Enter your email address'); return; }
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetSent(true);
    } catch (err: any) {
      const msg = err.code === 'auth/user-not-found' ? 'No account with this email.'
        : err.code === 'auth/invalid-email' ? 'Invalid email address.'
        : err.message || 'Failed to send reset email';
      setAuthError(msg);
    }
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
              <div className="w-full h-full rounded-full bg-[#0A0A0B] flex items-center justify-center border border-amber-500/10 overflow-hidden p-3">
                <img src="https://eburon.ai/icon-eburon.svg" alt="Eburon" className="w-full h-full object-contain" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-light tracking-tighter mb-1 text-white font-sans uppercase">
            Beatrice
          </h1>
          <p className="text-amber-500/40 text-center mb-8 leading-relaxed font-mono text-[10px] uppercase tracking-[0.2em]">
            Authenticated Voice Intelligence
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
            {authMode === 'signup' && (
              <div className="flex rounded-xl overflow-hidden border border-zinc-800 focus-within:border-amber-500/40 transition-colors">
                <input
                  type="text"
                  placeholder="Your Name"
                  value={authDisplayName}
                  onChange={e => setAuthDisplayName(e.target.value)}
                  className="flex-1 bg-[#0A0A0B] text-zinc-200 placeholder-zinc-600 text-sm px-4 py-3 outline-none"
                />
              </div>
            )}
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
          <div className="flex items-center justify-between w-full mb-5">
            <button
              onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); }}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 tracking-wider uppercase transition-colors"
            >
              {authMode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
            <button
              onClick={() => { setShowResetPassword(true); setAuthError(''); setResetSent(false); setResetEmail(authEmail); }}
              className="text-[10px] text-zinc-600 hover:text-amber-400 tracking-wider uppercase transition-colors"
            >
              Forgot password?
            </button>
          </div>
          {showResetPassword && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="w-full mb-4 overflow-hidden"
            >
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
                <p className="text-[11px] text-zinc-400">Enter your email and we'll send a reset link.</p>
                {resetSent ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Reset link sent. Check your inbox.</span>
                  </div>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-2">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      className="w-full bg-[#0A0A0B] text-zinc-200 placeholder-zinc-600 text-sm px-4 py-2.5 rounded-lg border border-zinc-800 outline-none focus:border-amber-500/40 transition-colors"
                    />
                    {authError && <p className="text-red-400 text-xs">{authError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium hover:bg-amber-500/20 transition-all"
                      >
                        Send Reset Link
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowResetPassword(false); setAuthError(''); }}
                        className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs hover:text-zinc-200 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          )}
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
              title="Language"
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

  const isAdminPortal = typeof window !== 'undefined'
    && window.location.pathname.replace(/\/+$/, '') === '/adminportal';

  if (isAdminPortal) {
    return (
      <AdminPortal
        user={user}
        onBack={() => { window.location.href = '/'; }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <MaximusAgent
      user={user}
      googleToken={googleToken}
      authLanguage={authLanguage}
      onSetLanguage={setAuthLanguage}
      onLogout={handleLogout}
      onLogin={handleLogin}
    />
  );
}

function MaximusAgent({
  user,
  googleToken,
  authLanguage,
  onSetLanguage,
  onLogout,
  onLogin
}: {
  user: User;
  googleToken: string | null;
  authLanguage: string;
  onSetLanguage: (lang: string) => void;
  onLogout: () => void;
  onLogin: () => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [volumes, setVolumes] = useState<number[]>(Array(11).fill(0.05));

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showVideoPage, setShowVideoPage] = useState(false);
  const [showChatPage, setShowChatPage] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [tasks, setTasks] = useState<ActionTask[]>([]);
  const [historyContext, setHistoryContext] = useState<string>("");
  const historyContextRef = useRef<string>("");
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [modelTranscript, setModelTranscript] = useState<string>('');

  const [showSettings, setShowSettings] = useState(false);
  const [showComputerPage, setShowComputerPage] = useState(false);
  const [computerTask, setComputerTask] = useState<ComputerTask | null>(null);
  const [computerOutput, setComputerOutput] = useState<{ content: string; title: string } | null>(null);
  const [computerPreviewUrl, setComputerPreviewUrl] = useState<string | null>(null);
  const [computerDownloadUrl, setComputerDownloadUrl] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState("Beatrice");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("Aoede");
  const [contextSize, setContextSize] = useState(20);
  const [userTitle, setUserTitle] = useState(() => {
    try { return localStorage.getItem('beatrice_userTitle') || 'Boss'; } catch { return 'Boss'; }
  });
  const [ambientEnabled, setAmbientEnabled] = useState(() => {
    try { return localStorage.getItem('beatrice_ambient_enabled') !== 'false'; } catch { return true; }
  });
  const [ambientVolume, setAmbientVolume] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('beatrice_ambient_volume'));
      return Number.isFinite(saved) && saved >= 0 ? saved : DEFAULT_AMBIENT_VOLUME;
    } catch {
      return DEFAULT_AMBIENT_VOLUME;
    }
  });
  const firstName = user?.displayName?.split(' ')[0] || '';

  useEffect(() => {
    if (firstName && !localStorage.getItem('beatrice_userTitle')) {
      const defaultAddr = `Boss ${firstName}`;
      setUserTitle(defaultAddr);
      try { localStorage.setItem('beatrice_userTitle', defaultAddr); } catch {}
    }
  }, [firstName]);

  const [isSaving, setIsSaving] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showProfilePage, setShowProfilePage] = useState(false);
  const [waStatus, setWaStatus] = useState<string>('not_found');
  const [waQrCode, setWaQrCode] = useState<string | null>(null);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waPairing, setWaPairing] = useState(false);
  const [waPermissions, setWaPermissions] = useState<Record<string, boolean>>({
    send_messages: false,
    read_chats: false,
    access_contacts: false,
    manage_contacts: false,
    access_groups: false,
    send_group_messages: false,
    read_group_chats: false,
    view_message_history: false,
  });
  const waPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const breathLevel = useMemo(() => {
    if (volumes.length === 0) return 0;
    const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return Math.pow(Math.min(1, avg * 2), 0.7);
  }, [volumes]);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const sessionStartingRef = useRef(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const ambientBedRef = useRef<AmbientConversationBed | null>(null);
  const ambientDuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudCanvasRef = useRef<HTMLCanvasElement>(null);
  const stopCanvasRef = useRef<HTMLCanvasElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenShareActiveRef = useRef(false);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<any>(null);

  const userTranscriptRef = useRef<string>('');
  const modelTranscriptRef = useRef<string>('');
  const transcriptTimeoutRef = useRef<any>(null);
  const speakingTimeoutRef = useRef<any>(null);
  const isActiveRef = useRef(false);
  const isAgentSpeakingRef = useRef(false);
  const silenceFillerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceFillerCountRef = useRef(0);
  const silenceFillerInFlightRef = useRef(false);
  const lastSilenceFillerStyleRef = useRef<string | null>(null);
  const lastUserSpeechAtRef = useRef(Date.now());
  const lastModelTurnCompleteAtRef = useRef(0);

  isActiveRef.current = isActive;
  isAgentSpeakingRef.current = isAgentSpeaking;

  const ensureAudio = async () => {
    if (!audioStreamerRef.current) {
      audioStreamerRef.current = new AudioStreamer();
    }

    await audioStreamerRef.current.init(24000);
  };

  const ambientGainFromLevel = useCallback((level: number) => {
    return Math.max(0, Math.min(30, level)) / 1000;
  }, []);

  const startAmbientBed = useCallback(async () => {
    if (!ambientEnabled) return;

    if (!ambientBedRef.current) {
      ambientBedRef.current = new AmbientConversationBed();
    }

    await ambientBedRef.current.start(ambientGainFromLevel(ambientVolume));
    ambientBedRef.current.duck(isAgentSpeakingRef.current);
  }, [ambientEnabled, ambientGainFromLevel, ambientVolume]);

  const stopAmbientBed = useCallback(() => {
    if (ambientDuckTimeoutRef.current) {
      clearTimeout(ambientDuckTimeoutRef.current);
      ambientDuckTimeoutRef.current = null;
    }

    try {
      ambientBedRef.current?.stop();
    } catch (e) {}
    ambientBedRef.current = null;
  }, []);

  const duckAmbientBriefly = useCallback(() => {
    if (!ambientBedRef.current) return;

    ambientBedRef.current.duck(true);
    if (ambientDuckTimeoutRef.current) clearTimeout(ambientDuckTimeoutRef.current);
    ambientDuckTimeoutRef.current = setTimeout(() => {
      ambientBedRef.current?.duck(isAgentSpeakingRef.current);
    }, 2200);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('beatrice_ambient_enabled', String(ambientEnabled));
      localStorage.setItem('beatrice_ambient_volume', String(ambientVolume));
    } catch {}
  }, [ambientEnabled, ambientVolume]);

  useEffect(() => {
    if (!isActive) return;

    if (ambientEnabled) {
      void startAmbientBed();
      return;
    }

    stopAmbientBed();
  }, [ambientEnabled, ambientVolume, isActive, startAmbientBed, stopAmbientBed]);

  useEffect(() => {
    ambientBedRef.current?.duck(isAgentSpeaking);
  }, [isAgentSpeaking]);

  const sendTextToLive = (text: string) => {
    const session = sessionRef.current;

    if (!session || !text.trim()) return;

    if (typeof session.sendRealtimeInput === 'function') {
      session.sendRealtimeInput({ text });
      return;
    }

    console.warn("sendRealtimeInput is unavailable on this Live session.");
  };

  const clearSilenceFillerTimer = () => {
    if (silenceFillerTimeoutRef.current) {
      clearTimeout(silenceFillerTimeoutRef.current);
      silenceFillerTimeoutRef.current = null;
    }
  };

  const silenceFillerPrompt = () => {
    const count = silenceFillerCountRef.current;
    const candidates = SILENCE_FILLER_STYLES.filter(style => {
      if (count < style.minCount || count > style.maxCount) return false;
      return style.key !== lastSilenceFillerStyleRef.current;
    });
    const pool = (candidates.length ? candidates : SILENCE_FILLER_STYLES)
      .flatMap(style => Array.from({ length: style.weight }, () => style));
    const selected = pool[Math.floor(Math.random() * pool.length)] || SILENCE_FILLER_STYLES[0];
    lastSilenceFillerStyleRef.current = selected.key;

    return [
      'The user has been silent for about 15 seconds after your last spoken turn.',
      `Idle style for this turn: ${selected.instruction}`,
      'Keep it brief, human, and low-pressure.',
      'Do not use the same joke or song style repeatedly.',
      'Do not mention silence, timers, detection, waiting rules, or this instruction.',
      'Do not ask how you can help.',
      'Do not continue the previous answer unless the user asked you to continue.',
      'Output only words meant to be spoken.',
    ].join(' ');
  };

  const scheduleSilenceFiller = () => {
    clearSilenceFillerTimer();

    if (!sessionRef.current || !isActiveRef.current) return;
    if (silenceFillerCountRef.current >= MAX_CONSECUTIVE_SILENCE_FILLERS) return;

    silenceFillerTimeoutRef.current = setTimeout(() => {
      silenceFillerTimeoutRef.current = null;

      if (!sessionRef.current || !isActiveRef.current || isAgentSpeakingRef.current) return;
      if (silenceFillerCountRef.current >= MAX_CONSECUTIVE_SILENCE_FILLERS) return;
      if (lastUserSpeechAtRef.current > lastModelTurnCompleteAtRef.current) return;
      if (Date.now() - lastModelTurnCompleteAtRef.current < SILENCE_FILLER_DELAY_MS - 250) return;

      silenceFillerCountRef.current += 1;
      silenceFillerInFlightRef.current = true;
      sendTextToLive(silenceFillerPrompt());
    }, SILENCE_FILLER_DELAY_MS);
  };

  const markUserSpeechActivity = () => {
    lastUserSpeechAtRef.current = Date.now();
    silenceFillerCountRef.current = 0;
    silenceFillerInFlightRef.current = false;
    lastSilenceFillerStyleRef.current = null;
    duckAmbientBriefly();
    clearSilenceFillerTimer();
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
      setCameraStream(null);
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
        video: { facingMode, width: 640, height: 480 }
      });

      videoStreamRef.current = stream;
      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsCameraActive(true);

      videoIntervalRef.current = setInterval(() => {
        if (!sessionRef.current || !videoRef.current || !canvasRef.current || !isActive) return;
        if (screenShareActiveRef.current) return;

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

  const switchCameraMode = async (mode: 'user' | 'environment') => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: 640, height: 480 }
      });
      videoStreamRef.current = stream;
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setFacingMode(mode);
      setIsCameraActive(true);
    } catch (err) {
      console.error("Camera switch error:", err);
    }
  };

  const activeTaskIdRef = useRef<string | null>(null);

  const showToolResult = (toolName: string, result: any, error?: string) => {
    const title = toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isError = !!error || (result && result.error);

    let formattedContent = '';
    let outputType: ComputerOutput['type'] = 'text';
    let fileType = 'txt';

    if (isError) {
      formattedContent = error || result?.error || 'Unknown error';
    } else if (toolName === 'create_document' && result?.content) {
      formattedContent = result.content;
      outputType = 'webpage';
      fileType = 'html';
    } else if (toolName === 'get_user_location' && result) {
      const mapsUrl = `https://www.google.com/maps?q=${result.lat},${result.lng}`;
      formattedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Location</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0a08;color:#f0e6df;display:flex;flex-direction:column;height:100vh}.map-wrap{flex:1;min-height:0}iframe{width:100%;height:100%;border:0}.info{padding:16px 20px;background:#1a1512;border-top:1px solid #2a1f18;text-align:center}p{margin:4px 0;font-size:14px;color:#d0a78b}span{color:#988c84}</style></head><body><div class="map-wrap"><iframe src="${mapsUrl}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div><div class="info"><p>📍 Your location</p><span>Accuracy: ±${Math.round(result.accuracy)}m</span></div></body></html>`;
      outputType = 'dashboard';
      fileType = 'html';
    } else if (toolName === 'list_calendar_events' && result?.items) {
      const events = result.items.map((e: any) => {
        const start = e.start?.dateTime || e.start?.date || 'TBD';
        const t = start.includes('T') ? new Date(start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : start;
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #2a1f18"><div style="width:4px;height:4px;border-radius:50%;background:#d0a78b;flex-shrink:0"></div><div style="flex:1"><p style="margin:0;font-size:14px;color:#f0e6df">${e.summary || 'Untitled'}</p><p style="margin:2px 0 0;font-size:11px;color:#988c84">${t}</p></div></div>`;
      }).join('');
      const count = result.items.length;
      formattedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calendar Events</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0a08;color:#f0e6df;padding:20px}h2{margin:0 0 4px;font-size:18px;color:#d0a78b}.count{font-size:12px;color:#6b5d53;margin-bottom:16px}.empty{text-align:center;padding:40px 20px;color:#6b5d53}</style></head><body><h2>📅 Upcoming Events</h2><p class="count">${count} event${count !== 1 ? 's' : ''}</p>${events || '<p class="empty">No upcoming events</p>'}</body></html>`;
      outputType = 'dashboard';
      fileType = 'html';
    } else if (toolName === 'list_gmail_messages' && result?.messages) {
      const msgs = result.messages.map((m: any) =>
        `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-bottom:1px solid #2a1f18"><div style="width:32px;height:32px;border-radius:50%;background:#2a1f18;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;color:#d0a78b">${(m.from?.[0] || '?').toUpperCase()}</div><div style="flex:1;min-width:0"><p style="margin:0;font-size:13px;color:#f0e6df;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.subject || '(no subject)'}</p><p style="margin:2px 0 0;font-size:11px;color:#988c84">${m.from || ''}</p><p style="margin:2px 0 0;font-size:11px;color:#6b5d53;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.snippet || ''}</p></div></div>`
      ).join('');
      formattedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recent Emails</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0a08;color:#f0e6df;padding:20px}h2{margin:0 0 4px;font-size:18px;color:#d0a78b}.count{font-size:12px;color:#6b5d53;margin-bottom:16px}</style></head><body><h2>📬 Recent Emails</h2><p class="count">${result.messages.length} message${result.messages.length !== 1 ? 's' : ''}</p>${msgs}</body></html>`;
      outputType = 'dashboard';
      fileType = 'html';
    } else if (toolName === 'list_google_tasks' && result?.items) {
      const tasks = result.items.map((t: any) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #2a1f18"><div style="width:16px;height:16px;border-radius:50%;border:2px solid #5a4a40;flex-shrink:0"></div><p style="margin:0;font-size:13px;color:#f0e6df">${t.title || 'Untitled'}</p></div>`
      ).join('');
      formattedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tasks</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0a08;color:#f0e6df;padding:20px}h2{margin:0 0 4px;font-size:18px;color:#d0a78b}.count{font-size:12px;color:#6b5d53;margin-bottom:16px}</style></head><body><h2>📋 Tasks</h2><p class="count">${result.items.length} task${result.items.length !== 1 ? 's' : ''}</p>${tasks}</body></html>`;
      outputType = 'dashboard';
      fileType = 'html';
    } else if (toolName === 'list_drive_files' && result?.files) {
      const files = result.files.map((f: any) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #2a1f18"><div style="font-size:16px;flex-shrink:0">📄</div><div style="flex:1;min-width:0"><p style="margin:0;font-size:13px;color:#f0e6df;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</p><p style="margin:1px 0 0;font-size:10px;color:#6b5d53">${(f.mimeType || '').split('/').pop()}</p></div></div>`
      ).join('');
      formattedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drive Files</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0a08;color:#f0e6df;padding:20px}h2{margin:0 0 4px;font-size:18px;color:#d0a78b}.count{font-size:12px;color:#6b5d53;margin-bottom:16px}</style></head><body><h2>📁 Drive Files</h2><p class="count">${result.files.length} file${result.files.length !== 1 ? 's' : ''}</p>${files}</body></html>`;
      outputType = 'dashboard';
      fileType = 'html';
    } else if (toolName === 'search_youtube' && result?.items) {
      const vids = result.items.map((v: any) =>
        `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-bottom:1px solid #2a1f18"><div style="width:80px;height:45px;border-radius:6px;background:#2a1f18;flex-shrink:0;overflow:hidden"><img src="${v.snippet?.thumbnails?.default?.url || ''}" style="width:100%;height:100%;object-fit:cover" alt=""></div><div style="flex:1;min-width:0"><p style="margin:0;font-size:13px;color:#f0e6df">${v.snippet?.title || ''}</p><p style="margin:2px 0 0;font-size:11px;color:#988c84">${v.snippet?.channelTitle || ''}</p></div></div>`
      ).join('');
      formattedContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube Results</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d0a08;color:#f0e6df;padding:20px}h2{margin:0 0 4px;font-size:18px;color:#d0a78b}.count{font-size:12px;color:#6b5d53;margin-bottom:16px}</style></head><body><h2>▶ YouTube Results</h2><p class="count">${result.items.length} result${result.items.length !== 1 ? 's' : ''}</p>${vids}</body></html>`;
      outputType = 'dashboard';
      fileType = 'html';
    } else if (toolName === 'create_google_task' && result) {
      formattedContent = `✅ Task created: ${result.title || 'Untitled'}`;
    } else if (toolName === 'send_gmail_message' && result) {
      formattedContent = `✅ Email sent successfully${result.id ? ' (ID: ' + result.id + ')' : ''}`;
    } else {
      formattedContent = JSON.stringify(result, null, 2);
      fileType = 'json';
    }

    const task: ComputerTask = {
      id: 'tool-' + Math.random().toString(36).substring(7),
      type: outputType,
      label: title,
      status: isError ? 'error' : 'done',
      steps: [
        { key: 'tool-exec', label: `Executing ${title}`, done: true, active: false, time: Date.now() },
        { key: 'tool-done', label: isError ? 'Failed' : 'Completed successfully', done: true, active: false },
      ],
      output: {
        type: outputType,
        title: isError ? `${title} — Error` : `${title} — Result`,
        content: isError
          ? (error || result?.error || 'Unknown error')
          : formattedContent,
        fileType,
      },
      createdAt: Date.now(),
    };

    setComputerTask(task);
    setComputerOutput({ content: task.output!.content, title: task.output!.title });
    setComputerPreviewUrl(null);
    setComputerDownloadUrl(null);
    setShowComputerPage(true);
  };

  const setGeneratedDocumentTask = (id: string, title: string, content: string, status: ComputerTask['status'] = 'done') => {
    setComputerTask({
      id,
      type: 'webpage',
      label: title,
      status,
      steps: [
        {
          key: 'ollama-document',
          label: status === 'done' ? 'Document generated with Ollama' : 'Generating document with Ollama',
          done: status === 'done',
          active: status !== 'done',
          time: Date.now()
        }
      ],
      output: {
        type: 'webpage',
        title,
        content,
        fileType: 'html',
      },
      createdAt: Date.now(),
    });

    setComputerOutput({ content, title });
    setComputerPreviewUrl(null);
    setComputerDownloadUrl(null);
    setShowComputerPage(true);
  };

  const tryTriggerComputerTask = async (text: string) => {
    const intent = detectExecutionIntent(text);
    if (!intent) return;

    try {
      const { taskId, task } = await createSandboxTask(intent.type, intent.label, text, user?.email || undefined, user?.uid || undefined, historyContextRef.current);
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

    markUserSpeechActivity();
    userTranscriptRef.current = text;
    setUserTranscript(text);
    setMessages(prev => [...prev, { role: 'user', text, timestamp: new Date().toISOString(), sessionId: sessionIdRef.current }]);
    saveMessage('user', text);
    sendTextToLive(text);
    tryTriggerComputerTask(text);
    setChatInput("");
  };

  const handleFileAttach = async (file: File) => {
    if (!sessionRef.current || !isActive) return;

    try {
      markUserSpeechActivity();
      const path = `${user.uid}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(path);

      if (file.type.startsWith('image/')) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve('');
              
              let width = img.width;
              let height = img.height;
              if (width > 640 || height > 480) {
                const ratio = Math.min(640 / width, 480 / height);
                width *= ratio;
                height *= ratio;
              }
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
            };
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
        if (base64) sendVideoToLive(base64);
      } else if (file.type === 'text/plain') {
        const text = await file.text();
        sendTextToLive(`[Attached file: ${file.name}]\n${text}`);
      } else {
        sendTextToLive(`[User attached a file: ${file.name} (${file.type}, ${Math.round(file.size / 1024)}KB)]`);
      }

      const messageText = `Attached file: ${file.name}`;
      setMessages(prev => [...prev, { role: 'user', text: messageText, timestamp: new Date().toISOString(), sessionId: sessionIdRef.current }]);
      await saveMessage('user', messageText, publicUrl, file.name);

    } catch (err) {
      console.error('File attach error:', err);
    }
  };

  useEffect(() => {
    let animationFrame: number;
    type CloudPuff = {
      cx: number;
      cy: number;
      r: number;
      phaseX: number;
      phaseY: number;
      speedX: number;
      speedY: number;
      alpha: number;
      tint: 'cream' | 'peach' | 'amber';
    };

    const cloudPuffs: CloudPuff[] = [
      { cx: 0.30, cy: 0.46, r: 0.22, phaseX: 0.2, phaseY: 1.4, speedX: 0.18, speedY: 0.15, alpha: 0.64, tint: 'peach' },
      { cx: 0.45, cy: 0.39, r: 0.26, phaseX: 2.1, phaseY: 0.7, speedX: 0.16, speedY: 0.18, alpha: 0.72, tint: 'cream' },
      { cx: 0.61, cy: 0.44, r: 0.24, phaseX: 3.0, phaseY: 2.5, speedX: 0.19, speedY: 0.14, alpha: 0.66, tint: 'peach' },
      { cx: 0.39, cy: 0.58, r: 0.25, phaseX: 4.4, phaseY: 1.1, speedX: 0.14, speedY: 0.20, alpha: 0.62, tint: 'amber' },
      { cx: 0.55, cy: 0.59, r: 0.28, phaseX: 1.7, phaseY: 4.1, speedX: 0.17, speedY: 0.16, alpha: 0.70, tint: 'cream' },
      { cx: 0.70, cy: 0.55, r: 0.19, phaseX: 5.1, phaseY: 3.6, speedX: 0.23, speedY: 0.17, alpha: 0.48, tint: 'peach' },
      { cx: 0.23, cy: 0.61, r: 0.17, phaseX: 3.7, phaseY: 5.2, speedX: 0.22, speedY: 0.19, alpha: 0.46, tint: 'amber' },
      { cx: 0.50, cy: 0.50, r: 0.33, phaseX: 0.9, phaseY: 2.8, speedX: 0.10, speedY: 0.12, alpha: 0.42, tint: 'peach' },
      { cx: 0.34, cy: 0.31, r: 0.14, phaseX: 5.8, phaseY: 0.4, speedX: 0.25, speedY: 0.16, alpha: 0.36, tint: 'cream' },
      { cx: 0.66, cy: 0.31, r: 0.15, phaseX: 2.8, phaseY: 4.8, speedX: 0.21, speedY: 0.18, alpha: 0.38, tint: 'cream' },
      { cx: 0.32, cy: 0.73, r: 0.12, phaseX: 1.2, phaseY: 3.2, speedX: 0.20, speedY: 0.24, alpha: 0.32, tint: 'amber' },
      { cx: 0.65, cy: 0.72, r: 0.13, phaseX: 4.7, phaseY: 2.2, speedX: 0.24, speedY: 0.22, alpha: 0.34, tint: 'peach' },
    ];

    const stopCloudPuffs: CloudPuff[] = [
      { cx: 0.28, cy: 0.49, r: 0.22, phaseX: 0.3, phaseY: 1.8, speedX: 0.20, speedY: 0.16, alpha: 0.62, tint: 'peach' },
      { cx: 0.45, cy: 0.42, r: 0.25, phaseX: 2.0, phaseY: 0.9, speedX: 0.17, speedY: 0.18, alpha: 0.72, tint: 'cream' },
      { cx: 0.62, cy: 0.50, r: 0.23, phaseX: 3.5, phaseY: 2.8, speedX: 0.18, speedY: 0.14, alpha: 0.64, tint: 'peach' },
      { cx: 0.39, cy: 0.61, r: 0.20, phaseX: 4.7, phaseY: 1.4, speedX: 0.15, speedY: 0.21, alpha: 0.54, tint: 'amber' },
      { cx: 0.58, cy: 0.62, r: 0.21, phaseX: 1.5, phaseY: 4.0, speedX: 0.19, speedY: 0.16, alpha: 0.56, tint: 'cream' },
      { cx: 0.50, cy: 0.52, r: 0.31, phaseX: 0.8, phaseY: 3.1, speedX: 0.11, speedY: 0.12, alpha: 0.36, tint: 'peach' },
    ];

    const getCloudColor = (tint: CloudPuff['tint']) => {
      if (tint === 'cream') return { core: '255, 241, 232', mid: '235, 208, 188', edge: '208, 167, 139' };
      if (tint === 'amber') return { core: '236, 189, 154', mid: '208, 167, 139', edge: '151, 104, 78' };
      return { core: '248, 220, 202', mid: '208, 167, 139', edge: '171, 123, 96' };
    };

    const drawClouds = (canvas: HTMLCanvasElement | null, avg: number, peak: number, size: number, puffs: CloudPuff[]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = size * dpr;
      const h = size * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      const time = Date.now() / 1000;
      const energy = Math.min(1, avg * 1.35 + peak * 0.95);
      const breath = 0.96 + Math.sin(time * 1.4) * 0.025 + energy * 0.22;

      const mist = ctx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, w * (0.44 + energy * 0.16));
      mist.addColorStop(0, `rgba(255, 239, 229, ${0.10 + energy * 0.18})`);
      mist.addColorStop(0.45, `rgba(208, 167, 139, ${0.08 + energy * 0.12})`);
      mist.addColorStop(1, 'rgba(208, 167, 139, 0)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      puffs.forEach((puff) => {
        const driftX = Math.sin(time * puff.speedX + puff.phaseX) * (0.035 + energy * 0.055);
        const driftY = Math.cos(time * puff.speedY + puff.phaseY) * (0.025 + energy * 0.04);
        const x = (puff.cx + driftX) * w;
        const y = (puff.cy + driftY) * h;
        const r = puff.r * w * breath;

        const alpha = Math.min(0.92, (0.12 + energy * 0.56 + peak * 0.16) * puff.alpha);
        const color = getCloudColor(puff.tint);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${color.core}, ${alpha})`);
        gradient.addColorStop(0.34, `rgba(${color.mid}, ${alpha * 0.58})`);
        gradient.addColorStop(0.68, `rgba(${color.edge}, ${alpha * 0.22})`);
        gradient.addColorStop(1, `rgba(${color.edge}, 0)`);

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      const halo = ctx.createRadialGradient(w * 0.48, h * 0.42, w * 0.06, w * 0.5, h * 0.5, w * 0.48);
      halo.addColorStop(0, `rgba(255, 247, 240, ${0.10 + energy * 0.12})`);
      halo.addColorStop(0.52, `rgba(208, 167, 139, ${0.06 + energy * 0.11})`);
      halo.addColorStop(1, 'rgba(208, 167, 139, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
    };

    const drawStopClouds = (canvas: HTMLCanvasElement | null, vols: number[]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const size = 80;
      const w = size * dpr;
      const h = size * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      const time = Date.now() / 1000;
      const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
      const peak = Math.max(...vols);
      const energy = Math.min(1, avg * 1.55 + peak * 1.1);

      const base = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * (0.46 + energy * 0.16));
      base.addColorStop(0, `rgba(255, 240, 230, ${0.14 + energy * 0.26})`);
      base.addColorStop(0.55, `rgba(208, 167, 139, ${0.10 + energy * 0.18})`);
      base.addColorStop(1, 'rgba(208, 167, 139, 0)');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      stopCloudPuffs.forEach((puff) => {
        const driftX = Math.sin(time * puff.speedX + puff.phaseX) * (0.03 + energy * 0.045);
        const driftY = Math.cos(time * puff.speedY + puff.phaseY) * (0.025 + energy * 0.035);
        const x = (puff.cx + driftX) * w;
        const y = (puff.cy + driftY) * h;
        const r = puff.r * w * (0.92 + energy * 0.34);

        const alpha = Math.min(0.86, (0.14 + energy * 0.52 + peak * 0.14) * puff.alpha);
        const color = getCloudColor(puff.tint);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${color.core}, ${alpha})`);
        gradient.addColorStop(0.38, `rgba(${color.mid}, ${alpha * 0.58})`);
        gradient.addColorStop(0.78, `rgba(${color.edge}, ${alpha * 0.20})`);
        gradient.addColorStop(1, `rgba(${color.edge}, 0)`);

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    };

    const updateVolumes = () => {
      if (isActive && audioStreamerRef.current && audioRecorderRef.current) {
        const streamerVols = audioStreamerRef.current.getFrequencies(11);
        const recorderVols = audioRecorderRef.current.getFrequencies(11);

        setVolumes(prev => prev.map((v, i) => {
          let target = Math.max(streamerVols[i] || 0, recorderVols[i] || 0);
          target = Math.min(1, target * 1.8);
          return v + (target - v) * 0.5;
        }));

        const avg = streamerVols.reduce((a, b) => a + b, 0) / streamerVols.length;
        const peak = Math.max(...streamerVols);
        const recAvg = recorderVols.reduce((a, b) => a + b, 0) / recorderVols.length;
        const recPeak = Math.max(...recorderVols);
        const combinedAvg = (avg + recAvg) / 2;
        const combinedPeak = Math.max(peak, recPeak);
        drawClouds(cloudCanvasRef.current, combinedAvg, combinedPeak, 256, cloudPuffs);
        drawStopClouds(stopCanvasRef.current, recorderVols);
      } else {
        setVolumes(prev => prev.map(v => v + (0.05 - v) * 0.2));
        drawClouds(cloudCanvasRef.current, 0.05, 0.05, 256, cloudPuffs);
        drawStopClouds(stopCanvasRef.current, Array(11).fill(0));
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
    let unsubMessages: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    (async () => {
      const { data: initialMessages, error: loadError } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });

      if (loadError) {
        handleDbError(loadError, 'messages', 'list');
        return;
      }

      const msgs: string[] = [];
      const messageList: ChatMessage[] = [];

      (initialMessages || []).reverse().forEach((m: any) => {
        msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
        messageList.push({
          role: m.role,
          text: m.text,
          sessionId: m.session_id,
          timestamp: m.created_at,
          attachmentUrl: m.attachment_url,
          attachmentName: m.attachment_name,
        });
      });

      setMessages(messageList);

      if (msgs.length > 0) {
        let context = "Previous conversation for context memory:\n" + msgs.join("\n");

        const pendingPatterns = [
          /\b(create|make|build|generate|write|compose|fix|check|run|deploy|zip|convert|summarize)\b/i,
          /\b(for me|can you|do you|will you|could you|would you)\s/i,
          /\b(work\s*on|handle|take care of|prepare|sort out|process)\b/i,
        ];

        const userRequests = (initialMessages || []).reverse().filter((m: any) => {
          if (m.role !== 'user') return false;
          return pendingPatterns.some(p => p.test(m.text));
        });

        const modelReplies = (initialMessages || []).reverse().filter((m: any) => m.role === 'model');

        const pending: string[] = [];
        for (const req of userRequests) {
          const hasCompletion = modelReplies.some((m: any) => {
            if (!m.created_at || !req.created_at) return false;
            return new Date(m.created_at).getTime() > new Date(req.created_at).getTime();
          });
          if (!hasCompletion) {
            pending.push(req.text);
          }
        }

        if (pending.length > 0) {
          context += "\n\nPAST TOOL REQUESTS (Context Only):\n";
          pending.slice(0, 5).forEach((text) => {
            context += `- Request: "${text}"\n`;
          });
          context += "\nNOTE: Use these purely as a casual topic opener if relevant. Do not ask if they want to finish them or force the conversation back to them.";
        }

        setHistoryContext(context);
        historyContextRef.current = context;
      } else {
        setHistoryContext("");
        historyContextRef.current = "";
      }

      if (messageList.length > 0 && !selectedSessionId) {
        const newest = [...messageList].reverse().find(m => m.sessionId);
        if (newest?.sessionId) setSelectedSessionId(newest.sessionId);
      }

      const messagesChannel = supabase
        .channel('messages_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.uid}` }, (payload) => {
          const m = payload.new as any;
          if (!m || !m.text) return;
          const msg: ChatMessage = {
            role: m.role,
            text: m.text,
            sessionId: m.session_id,
            timestamp: m.created_at,
            attachmentUrl: m.attachment_url,
            attachmentName: m.attachment_name,
          };
          setMessages(prev => {
            if (prev.some(p => p.timestamp === m.created_at && p.text === m.text)) return prev;
            return [...prev, msg];
          });
        })
        .subscribe();

      unsubMessages = () => { supabase.removeChannel(messagesChannel); };

      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.uid)
        .single();

      if (!settingsError && settingsData) {
        if (settingsData.persona_name) setPersonaName(settingsData.persona_name);
        if (settingsData.custom_prompt !== null) setCustomPrompt(settingsData.custom_prompt);
        if (settingsData.selected_voice) setSelectedVoice(settingsData.selected_voice);
        if (settingsData.context_size !== undefined) setContextSize(settingsData.context_size);
        if (settingsData.user_title) { setUserTitle(settingsData.user_title); try { localStorage.setItem('beatrice_userTitle', settingsData.user_title); } catch {} }
        if (settingsData.language) { onSetLanguage(settingsData.language); try { localStorage.setItem('beatrice_language', settingsData.language); } catch {} }
        if (settingsData.whatsapp_permissions) setWaPermissions(prev => ({ ...prev, ...settingsData.whatsapp_permissions }));
        if (settingsData.whatsapp_paired) setWaStatus('paired');
        if (settingsData.whatsapp_phone) setWaPhone(settingsData.whatsapp_phone);
      }

      const settingsChannel = supabase
        .channel('settings_changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_settings', filter: `user_id=eq.${user.uid}` }, (payload) => {
          const s = payload.new as any;
          if (!s) return;
          if (s.persona_name) setPersonaName(s.persona_name);
          if (s.custom_prompt !== null) setCustomPrompt(s.custom_prompt);
          if (s.selected_voice) setSelectedVoice(s.selected_voice);
          if (s.context_size !== undefined) setContextSize(s.context_size);
          if (s.user_title) { setUserTitle(s.user_title); try { localStorage.setItem('beatrice_userTitle', s.user_title); } catch {} }
          if (s.language) { onSetLanguage(s.language); try { localStorage.setItem('beatrice_language', s.language); } catch {} }
          if (s.whatsapp_permissions) setWaPermissions(prev => ({ ...prev, ...s.whatsapp_permissions }));
          if (s.whatsapp_paired) setWaStatus('paired');
          if (s.whatsapp_phone) setWaPhone(s.whatsapp_phone);
        })
        .subscribe();

      unsubSettings = () => { supabase.removeChannel(settingsChannel); };
    })();

    const apiKey = getGeminiApiKey();

    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey });
    }

    audioStreamerRef.current = new AudioStreamer();

    return () => {
      if (unsubMessages) unsubMessages();
      if (unsubSettings) unsubSettings();
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

  useEffect(() => {
    return () => {
      if (waPollRef.current) {
        clearInterval(waPollRef.current);
        waPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getWhatsAppStatus(user.uid);
        if (cancelled) return;
        setWaStatus(status.status);
        if (status.qrCode) setWaQrCode(status.qrCode);
        if (status.phone) setWaPhone(status.phone);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  const selectedMessages = useMemo(() => {
    if (!selectedSessionId) return messages;
    return messages.filter(m => m.sessionId === selectedSessionId);
  }, [messages, selectedSessionId]);

  const saveSettings = async () => {
    setIsSaving(true);

    try {
      await supabase
        .from('user_settings')
        .upsert({
          user_id: user.uid,
          persona_name: personaName,
          custom_prompt: customPrompt,
          selected_voice: selectedVoice,
          context_size: contextSize,
          user_title: userTitle,
          language: authLanguage,
          whatsapp_permissions: waPermissions,
          whatsapp_paired: waStatus === 'paired',
          whatsapp_phone: waPhone || null,
          updated_at: new Date().toISOString(),
        });

      try { localStorage.setItem('beatrice_userTitle', userTitle); } catch {}
      try { localStorage.setItem('beatrice_language', authLanguage); } catch {}
      setShowSettings(false);
    } catch (e) {
      handleDbError(e, 'user_settings', 'upsert');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWaPermission = async (key: string) => {
    let nextPermissions: Record<string, boolean> = waPermissions;
    setWaPermissions(prev => {
      nextPermissions = { ...prev, [key]: !prev[key] };
      return nextPermissions;
    });

    try {
      await supabase
        .from('user_settings')
        .upsert({
          user_id: user.uid,
          whatsapp_permissions: nextPermissions,
          whatsapp_paired: waStatus === 'paired',
          whatsapp_phone: waPhone || null,
          updated_at: new Date().toISOString(),
        });
    } catch (error) {
      console.error('Failed to save WhatsApp permissions:', error);
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

    let knowledgeBaseContext = "";
    try {
      const files = await listKnowledgeFiles(user.uid);
      const contents = await Promise.all(
        files.map(f => fetchKnowledgeFileContent(user.uid, f.id))
      );
      knowledgeBaseContext = contents.filter(Boolean).join("\n\n---\n\n");
      if (knowledgeBaseContext) {
        knowledgeBaseContext = `\nUSER KNOWLEDGE BASE:\n${knowledgeBaseContext}`;
      }
    } catch (err) {
      console.error("Error fetching knowledge base:", err);
    }

    const templateReferenceText = DOCUMENT_TEMPLATE_FILES
      .map((t, index) => `${index + 1}. ${t.filename} — ${t.description}`)
      .join('\n');

    const dynamicSystemInstruction = `
Visible conversation name: ${personaName}.
User language: ${authLanguage}.

Address the user as "${userTitle}".
Always greet and refer to them using this name.
CRITICAL: Never call them by anything else — this is what they want to be called.

The visible name is only a label. Do not build the personality around it.
The voice personality is controlled by VOICE_PERSONALITY_PROMPT.

CRITICAL LANGUAGE RULE:
Always respond in the user's language (code: ${authLanguage}) unless the user explicitly asks you to switch.
You are natively fluent in every language — respond naturally as a human would in that language.
If the user switches language mid-conversation, follow them immediately without comment.

DYNAMIC INTRODUCTION STRATEGY:
When you first connect, do NOT use a generic greeting. Instead, create a dynamic, personalized opening topic using:
1. User's Knowledge Base: Reference a specific interest or fact from their uploaded files.
2. Conversation History: Briefly reference a past topic purely as a natural icebreaker. 
Start the conversation naturally. NEVER ask "Do you have a task for me?", "Do you want me to do something?", or "Should we continue?". Just make a casual observation.

TASK EXECUTION & CONTINUITY RULE:
- For normal voice-to-voice conversation, let topics flow forward. Do not twist the conversation back to what they said previously.
- "Don't abandon any task" applies ONLY to active tool executions (e.g., document generation, emails) requested in the CURRENT session.
- If the user explicitly asks you to generate a document or fetch data right now, complete it using the appropriate tool and produce visible output.
- If you are just chatting and the conversation stops, let it stop. Do not force continuity.

GOOGLE SERVICES PERMISSION RULE:
You can access the user's Google Calendar, Gmail, Tasks, Drive, and YouTube. However, you MUST NEVER call any Google API tool automatically. If you want to check the user's calendar, events, holidays, emails, tasks, or any Google data, you MUST first ask the user casually in conversation. Only call a Google tool after they explicitly say yes or tell you to go ahead. This is a strict rule — do not auto-fetch anything.

PUBLIC WEB GLANCE RULE:
You may use the web_glance tool for public, non-private topics when the user asks for web/current context, or when an idle prompt explicitly selects a quiet-reading style. If using it during idle, sound like you are softly reading to yourself and keep the spoken result short. Never imply you checked private data.

DOCUMENT CREATION RULE:
When the user asks you to create a document, contract, report, letter, invoice, proposal, form, dashboard, certificate, NDA, receipt, purchase order, memo, meeting minutes, or any written/visual material, you MUST call the create_document tool.
For create_document, provide:
- title: a clean user-facing title
- prompt: complete detailed instructions for the artifact, including all content the user requested
- templateName: one of contract, invoice, letter, proposal, minutes, memo, purchase-order, receipt, resignation, nda, certificate when clear

The create_document tool will:
1. Fetch the relevant sample template files from /public.
2. Send those templates as references to the configured Ollama Cloud OpenAI-compatible chat endpoint.
3. Generate a complete standalone browser-previewable document.
4. Display it in the workspace.

Never generate the full document inside your spoken reply.
Never mention HTML to the user.
Say "document", "preview", "draft", "file", or "workspace".
Use natural confirmation like:
- "Okay Boss... I’ll put that draft together now."
- "Right, I’m generating the document from the template style."
- "Done — I’ve put the draft in the workspace."

Available /public document templates:
${templateReferenceText}

${customPrompt || ""}

${VOICE_PERSONALITY_PROMPT}

${knowledgeBaseContext}

${historyContext}
`;

    const gFetch = async (tok: string | null, url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> => {
      if (!tok) return { ok: false, status: 0, data: { error: 'No access token' } };
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

    const googleTools: FunctionDeclaration[] = [
      {
        name: "list_gmail_messages",
        description: "Read the most recent emails from the user's Gmail inbox. Returns subject, sender, date, and preview for each message. CRITICAL: You MUST ask the user for permission first in conversation before calling this tool. Never call it automatically.",
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
        description: "List upcoming events from the user's primary Google Calendar. CRITICAL: You MUST ask the user for permission first in conversation before calling this tool. Never call it automatically.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            timeMin: {
              type: Type.STRING,
              description: "RFC3339 timestamp. Defaults to now."
            },
            _confirmed: {
              type: Type.BOOLEAN,
              description: "True only after user explicitly confirmed calendar access."
            }
          }
        }
      },
      {
        name: "list_google_tasks",
        description: "List the user's pending tasks from their primary Google Tasks list. CRITICAL: You MUST ask the user for permission first in conversation before calling this tool. Never call it automatically.",
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: "get_user_location",
        description: "Get the user's current geographic location using the browser geolocation API. CRITICAL: You MUST ask the user for permission first in conversation. Never call this automatically.",
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
        name: "web_glance",
        description: "Search public web snippets for a short topic. Use for public, non-private topics, including quiet idle reading. Do not use it for private user data.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "The public topic or question to look up."
            },
            maxResults: {
              type: Type.NUMBER,
              description: "Number of short results to return. Maximum 5."
            }
          },
          required: ["query"]
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
        description: "Send an email message via Gmail on behalf of the user. CRITICAL: You MUST ask the user for permission first in conversation. Never send automatically. Confirm the recipient, subject, and body with the user before sending.",
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

    const googleTokenRequiredTools = new Set([
      'list_gmail_messages',
      'list_calendar_events',
      'list_google_tasks',
      'search_youtube',
      'create_google_task',
      'list_drive_files',
      'search_drive_files',
      'get_drive_file',
      'send_gmail_message',
      'execute_google_service',
    ]);

    try {
      await ensureAudio();
      try {
        await startAmbientBed();
      } catch (ambientError) {
        console.warn('Ambient room tone did not start:', ambientError);
      }

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
                      serviceName: { type: Type.STRING, description: "The service name." },
                      action: { type: Type.STRING, description: "The specific request." },
                      details: { type: Type.OBJECT, description: "Relevant parameters." }
                    },
                    required: ["serviceName", "action"]
                  }
                },
                {
                  name: "whatsapp_action",
                  description: "Execute WhatsApp operations. Only actions the user has enabled in their permission toggles will work.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: { type: Type.STRING, description: "The WhatsApp action: sendMessage, readChats, getContacts, addContact, getGroups, sendGroupMessage, readGroupChat, getMessageHistory" },
                      to: { type: Type.STRING, description: "Recipient phone number or JID (for sendMessage, addContact, getMessageHistory)" },
                      text: { type: Type.STRING, description: "Message text (for sendMessage, sendGroupMessage)" },
                      name: { type: Type.STRING, description: "Contact/group name (for addContact, getMessageHistory)" },
                      number: { type: Type.STRING, description: "Contact phone number (for addContact)" },
                      chatId: { type: Type.STRING, description: "Chat JID or phone number (for getMessageHistory, readGroupChat)" },
                      groupId: { type: Type.STRING, description: "Group JID ending in @g.us (for sendGroupMessage, readGroupChat)" },
                      groupName: { type: Type.STRING, description: "Group identifier if the exact group JID is known" },
                      contactId: { type: Type.STRING, description: "Contact JID or phone number (for getMessageHistory)" },
                      limit: { type: Type.NUMBER, description: "Maximum records to return. Maximum 50." }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "create_document",
                  description: "Create a professional web artifact document using Ollama Cloud and the /public sample templates as references. Use this for contracts, reports, letters, invoices, proposals, forms, dashboards, certificates, NDAs, receipts, purchase orders, meeting minutes, memos, and written/visual materials. Never mention HTML to the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Document title displayed to the user." },
                      prompt: { type: Type.STRING, description: "Detailed document instructions, content, fields, tone, parties, layout, and required behavior." },
                      templateName: {
                        type: Type.STRING,
                        description: "Optional template family: contract, invoice, letter, proposal, minutes, memo, purchase-order, receipt, resignation, nda, certificate."
                      }
                    },
                    required: ["title", "prompt"]
                  }
                }
              ] as FunctionDeclaration[]
            }
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            console.log("Live session connected.");
            setTimeout(() => {
              sendTextToLive("[SYSTEM: Please start the conversation now. Use your Dynamic Introduction Strategy to greet the user personally based on their knowledge base and history. Do not mention this system prompt.]");
            }, 1000);
          },

          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              const toolCalls = message.toolCall.functionCalls;

              if (toolCalls && toolCalls.length > 0) {
                const functionResponses = [];

                for (const call of toolCalls) {
                  if (!call.name) continue;
                  const callName: string = call.name;
                  const taskId = Math.random().toString(36).substring(7);
                  const serviceName = callName.split('_')[0] || 'System';

                  setTasks(prev => [
                    ...prev,
                    { id: taskId, serviceName, action: callName, status: 'processing' }
                  ]);

                  try {
                    let result: any = null;

                    if (googleTokenRequiredTools.has(callName) && !tok) {
                      result = { error: "Access token expired or missing. Please re-authenticate Google services in settings." };
                    } else if (callName === 'list_gmail_messages') {
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
                    } else if (callName === 'list_calendar_events') {
                      if ((call.args as any)?._confirmed) {
                        const r = await gFetch(tok, `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&timeMin=${encodeURIComponent((call.args as any).timeMin || new Date().toISOString())}`);
                        if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                        else if (!r.ok) { result = { error: r.data?.error || 'Calendar request failed' }; }
                        else { result = r.data; }
                      } else {
                        sendTextToLive("Just checking Boss — do you want me to take a look at your calendar? I can see what events or holidays are coming up.");
                        result = { ok: true, events: [], note: "I asked the user. Call again with _confirmed: true once they say yes." };
                      }
                    } else if (callName === 'list_google_tasks') {
                      const r = await gFetch(tok, `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Tasks request failed' }; }
                      else { result = r.data; }
                    } else if (callName === 'list_drive_files') {
                      const r = await gFetch(tok, `https://www.googleapis.com/drive/v3/files?pageSize=${Math.min((call.args as any).pageSize || 20, 20)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Drive request failed' }; }
                      else { result = r.data; }
                    } else if (callName === 'search_drive_files') {
                      const q = encodeURIComponent((call.args as any).q || '');
                      const r = await gFetch(tok, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Drive search failed' }; }
                      else { result = r.data; }
                    } else if (callName === 'get_drive_file') {
                      const fileId = (call.args as any).fileId;
                      const r = await gFetch(tok, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Drive file request failed' }; }
                      else { result = r.data; }
                    } else if (callName === 'send_gmail_message') {
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
                    } else if (callName === 'get_user_location') {
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
                    } else if (callName === 'search_youtube') {
                      const r = await gFetch(tok, `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent((call.args as any).q)}&maxResults=5&type=video`);
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'YouTube search failed' }; }
                      else { result = r.data; }
                    } else if (callName === 'web_glance') {
                      const args = call.args as any;
                      result = await webGlance(String(args.query || ''), Math.min(Number(args.maxResults) || 3, 5));
                    } else if (callName === 'create_google_task') {
                      const r = await gFetch(tok, `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: (call.args as any).title, notes: (call.args as any).notes || "" }) }
                      );
                      if (r.data?._authError) { result = { error: "Google session expired. Re-authenticate in settings." }; }
                      else if (!r.ok) { result = { error: r.data?.error || 'Task creation failed' }; }
                      else { result = r.data; }
                    } else if (callName === 'execute_google_service') {
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
                    } else if (callName === 'whatsapp_action') {
                      const args = call.args as any;
                      try {
                        const { callWhatsAppTool } = await import('./lib/whatsappClient');
                        result = await callWhatsAppTool(user.uid, args.action, {
                          to: args.to,
                          text: args.text,
                          name: args.name,
                          number: args.number,
                          groupId: args.groupId,
                          groupName: args.groupName,
                          chatId: args.chatId,
                          contactId: args.contactId,
                          limit: args.limit,
                        }, waPermissions);
                      } catch (e: any) {
                        result = { ok: false, error: e.message || 'WhatsApp action failed' };
                      }
                    } else if (callName === 'create_document') {
                      const args = call.args as any;
                      const title = String(args.title || 'Document');
                      const prompt = String(args.prompt || 'Create a professional document.');
                      const generationTaskId = crypto.randomUUID();

                      try {
                        setGeneratedDocumentTask(generationTaskId, title, '', 'working');

                        const content = await generateDocumentWithOllamaCloud({
                          title,
                          prompt,
                          templateName: args.templateName,
                          userId: user.uid,
                          language: authLanguage,
                          personaName,
                          historyContext: historyContextRef.current,
                        });

                        setGeneratedDocumentTask(generationTaskId, title, content, 'done');

                        result = {
                          ok: true,
                          title,
                          content,
                          templateName: args.templateName || inferDocumentTemplate(title, prompt),
                          generatedBy: 'ollama-cloud',
                        };
                      } catch (e: any) {
                        setComputerTask(prev => prev ? {
                          ...prev,
                          status: 'error',
                          steps: [
                            {
                              key: 'ollama-document-error',
                              label: 'Document generation failed',
                              done: true,
                              active: false,
                              time: Date.now()
                            }
                          ]
                        } : prev);

                        result = {
                          error: e?.message || 'Document generation failed.'
                        };
                      }
                    }

                    setTasks(prev =>
                      prev.map(t => (t.id === taskId ? { ...t, status: 'completed' } : t))
                    );

                    setTimeout(() => {
                      setTasks(prev => prev.filter(t => t.id !== taskId));
                    }, 8000);

                    if (!(callName === 'web_glance' && silenceFillerInFlightRef.current)) {
                      if (!(callName === 'create_document' && result?.content)) {
                        showToolResult(callName, result);
                      }
                    }

                    functionResponses.push({
                      id: call.id,
                      name: callName,
                      response: { result }
                    });
                  } catch (err) {
                    console.error("Tool execution failed:", err);

                    setTasks(prev => prev.filter(t => t.id !== taskId));

                    if (!(callName === 'web_glance' && silenceFillerInFlightRef.current)) {
                      showToolResult(callName, null, String(err));
                    }

                    functionResponses.push({
                      id: call.id,
                      name: callName,
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
                markUserSpeechActivity();
                audioStreamerRef.current?.stop();
                setIsAgentSpeaking(false);
                return;
              }

              const content: any = message.serverContent;

              if (content.inputTranscription?.text) {
                const text = content.inputTranscription.text.trim();

                if (text) {
                  markUserSpeechActivity();
                  userTranscriptRef.current = text;
                  setUserTranscript(text);
                  saveMessage('user', text);
                  tryTriggerComputerTask(text);

                  if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                  transcriptTimeoutRef.current = setTimeout(() => {
                    setUserTranscript('');
                    setModelTranscript('');
                  }, 4000);
                }
              }

              if (content.outputTranscription?.text) {
                clearSilenceFillerTimer();
                const text = content.outputTranscription.text;
                const updatedText = (modelTranscriptRef.current + text).trim();
                modelTranscriptRef.current = updatedText;
                setModelTranscript(updatedText);

                if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                transcriptTimeoutRef.current = setTimeout(() => {
                  setUserTranscript('');
                  setModelTranscript('');
                }, 4000);
              }

              const modelTurn = message.serverContent.modelTurn;

              if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                  if (part.inlineData?.data) {
                    clearSilenceFillerTimer();
                    audioStreamerRef.current?.addPCM16(part.inlineData.data);
                    setIsAgentSpeaking(true);

                    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                    speakingTimeoutRef.current = setTimeout(() => setIsAgentSpeaking(false), 700);
                  }

                  if ((part as any).text) {
                    clearSilenceFillerTimer();
                    const text = (part as any).text;
                    const updatedText = (modelTranscriptRef.current + text).trim();
                    modelTranscriptRef.current = updatedText;
                    setModelTranscript(updatedText);

                    if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                    transcriptTimeoutRef.current = setTimeout(() => {
                      setUserTranscript('');
                      setModelTranscript('');
                    }, 4000);
                  }
                }
              }

              const legacyUserTurn = (message.serverContent as any).userTurn;

              if (legacyUserTurn?.parts) {
                const text = legacyUserTurn.parts.map((p: any) => p.text).join(" ").trim();

                if (text) {
                  markUserSpeechActivity();
                  userTranscriptRef.current = text;
                  setUserTranscript(text);
                  saveMessage('user', text);

                  if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                  transcriptTimeoutRef.current = setTimeout(() => {
                    setUserTranscript('');
                    setModelTranscript('');
                  }, 4000);
                }
              }

              if ((message.serverContent as any).turnComplete) {
                const current = modelTranscriptRef.current;
                const isSilenceFillerTurn = silenceFillerInFlightRef.current;

                if (current) {
                  if (!isSilenceFillerTurn) {
                    setMessages(prev => [...prev, { role: 'model', text: current, timestamp: new Date().toISOString(), sessionId: sessionIdRef.current }]);
                    saveMessage('model', current);
                  }
                  modelTranscriptRef.current = '';
                }

                silenceFillerInFlightRef.current = false;
                lastModelTurnCompleteAtRef.current = Date.now();
                scheduleSilenceFiller();
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

      isActiveRef.current = true;
      lastUserSpeechAtRef.current = Date.now();
      silenceFillerCountRef.current = 0;
      silenceFillerInFlightRef.current = false;
      lastSilenceFillerStyleRef.current = null;
      setIsActive(true);
      setConnecting(false);
      sessionStartingRef.current = false;

      setTimeout(() => {
        sendTextToLive(
          "Start naturally like the conversation is already happening at a cafe. Do not introduce yourself. Do not mention your name. Do not offer help. Use a small human beat if it fits, like 'Mm...' or 'Yeah...', then begin with a casual observation, small-talk thought, back-to-reality moment, or light current-topic style comment. Keep it calm and normal. Do not overuse fillers."
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
    clearSilenceFillerTimer();
    isActiveRef.current = false;
    isAgentSpeakingRef.current = false;
    silenceFillerInFlightRef.current = false;
    silenceFillerCountRef.current = 0;
    lastSilenceFillerStyleRef.current = null;

    try {
      audioRecorderRef.current?.stop();
    } catch (e) {}

    try {
      audioStreamerRef.current?.stop();
    } catch (e) {}

    stopAmbientBed();

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
    userTranscriptRef.current = '';
    modelTranscriptRef.current = '';
    sessionStartingRef.current = false;

    setIsCameraActive(false);
    setIsAgentSpeaking(false);
    setIsActive(false);
    setConnecting(false);
    setUserTranscript('');
    setModelTranscript('');
  };

  const saveMessage = async (role: 'user' | 'model', text: string, attachmentUrl?: string, attachmentName?: string) => {
    try {
      await supabase
        .from('messages')
        .insert({
          user_id: user.uid,
          session_id: sessionIdRef.current,
          role,
          text,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
        });
    } catch (error) {
      handleDbError(error, 'messages', 'insert');
    }
  };

  return (
    <div className="min-h-screen bg-[#161312] text-zinc-100 flex flex-col h-[100dvh] overflow-y-auto select-none relative">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(208,167,139,0.04),transparent_75%)] pointer-events-none z-0"
      />

      <header className="sticky top-0 w-full bg-[#161312]/95 backdrop-blur-md border-b border-zinc-800/60 px-4 sm:px-6 py-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center">
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 -ml-1.5 rounded-lg text-zinc-400 hover:text-[#d0a78b] hover:bg-zinc-800/50 transition-all duration-300"
            aria-label="Open Settings"
          >
            <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="text-center flex flex-col items-center">
          <h1 className="text-lg sm:text-xl font-semibold tracking-wide text-[#d0a78b]">{personaName}</h1>
          <p className="text-[8px] sm:text-[9px] text-zinc-500 tracking-[0.22em] lowercase -mt-0.5">eburon ai</p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/adminportal"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-[#d0a78b] hover:bg-zinc-800/50 transition-all duration-300"
            aria-label="Open Admin Portal"
          >
            <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
          </a>
          <button
            onClick={() => setShowProfilePage(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center hover:border-[#d0a78b]/50 transition-all duration-300"
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

      <main className="flex-1 flex flex-col items-center relative z-10 px-4">

        <div className="flex-1 flex flex-col items-center justify-center w-full">
        <p className="text-zinc-300 text-xs sm:text-sm font-normal tracking-wide mt-2 px-4 text-center transition-all duration-300">
          {isActive ? 'Beatrice is listening...' : connecting ? 'Connecting...' : 'Beatrice is offline. Connect to begin.'}
        </p>

        <div className="relative flex items-center justify-center w-full h-[240px] sm:h-[320px]">
          <div
            className={`absolute w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-3xl transition-none orb-glow`}
            style={{
              ['--glow-alpha' as string]: isActive ? 0.12 + breathLevel * 0.38 : 0.06,
              ['--glow-scale' as string]: isActive ? 1 + breathLevel * 0.3 : 1,
            } as React.CSSProperties}
          />

          <button
            onClick={isActive ? stopSession : startSession}
            disabled={connecting}
            className="relative w-48 h-48 sm:w-64 sm:h-64 rounded-full bg-[#1c1614]/60 border border-[#d0a78b]/20 overflow-hidden flex items-center justify-center transition-all duration-500 hover:border-[#d0a78b] hover:shadow-[0_0_55px_rgba(208,167,139,0.3)] active:scale-[0.98]"
            aria-label="Toggle Voice Assistant"
          >
            <div className="absolute inset-0 bg-black/5 backdrop-blur-[12px] z-10 rounded-full pointer-events-none" />

            <div className="absolute inset-0 w-full h-full flex items-center justify-center transition-transform duration-100 ease-out z-0">
              <div className="blob-1 absolute w-40 h-40 sm:w-56 sm:h-56 rounded-full bg-[radial-gradient(circle,rgba(208,167,139,0.65)_0%,transparent_70%)] blur-md" />
              <div className="blob-2 absolute w-36 h-36 sm:w-52 sm:h-52 rounded-full bg-[radial-gradient(circle,rgba(171,123,96,0.45)_0%,transparent_70%)] blur-md" />
              <div className="blob-3 absolute w-32 h-32 sm:w-48 sm:h-48 rounded-full bg-[radial-gradient(circle,rgba(235,208,188,0.55)_0%,transparent_70%)] blur-md" />
              <div className="absolute w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-[#d0a78b]/15 blur-xl" />
            </div>

            <div className="absolute inset-0 z-20 rounded-full flex items-center justify-center overflow-hidden">
              <canvas
                ref={cloudCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                width={256}
                height={256}
              />
              {connecting ? (
                <Loader2 className="w-7 h-7 sm:w-9 sm:h-9 animate-spin text-[#d0a78b] z-10" />
              ) : isActive ? null : null}
            </div>
          </button>
        </div>
        </div>

        <div className="w-full max-w-xl px-2 sm:px-8 flex flex-col items-center justify-center text-center min-h-[60px] sm:min-h-[80px] gap-1 transition-opacity duration-700 pb-4">
          <AnimatePresence>
            {userTranscript && (
              <KaraokeTranscript
                role="user"
                text={userTranscript}
                name={user.displayName?.split(' ')[0] || 'User'}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {modelTranscript && (
              <KaraokeTranscript
                role="model"
                text={modelTranscript}
                name={personaName}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="sticky bottom-0 w-full h-[72px] sm:h-[92px] bg-[#161312]/95 backdrop-blur-md border-t border-zinc-800/60 z-20 px-4 sm:px-6 box-border select-none shrink-0">
        <div className="relative w-full h-full flex items-center justify-between">

          <button
            onClick={() => setShowChatPage(true)}
            className="absolute left-4 sm:left-[50px] flex flex-col items-center justify-center text-zinc-400 hover:text-[#d0a78b] transition-colors duration-300"
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 mb-1" />
            <span className="text-[10px] sm:text-xs font-medium">Chat</span>
          </button>

          <button
            onClick={isActive ? stopSession : startSession}
            disabled={connecting}
            className={`absolute left-1/2 -translate-x-1/2 bottom-[40px] sm:bottom-[55px] w-14 h-14 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center shadow-xl transition-all duration-300 border-4 border-[#161312] z-30 ${
              isActive
                ? 'bg-zinc-900 text-[#d0a78b] border-2 border-[#d0a78b]/40'
                : 'bg-[#d0a78b] text-black hover:bg-[#ebd0bc] shadow-[#d0a78b]/20'
            }`}
          >
            {connecting ? (
              <Loader2 className="w-5 h-5 sm:w-7 sm:h-7 animate-spin" />
            ) : isActive ? (
              <div className="absolute inset-0 rounded-full flex items-center justify-center">
                <canvas
                  ref={stopCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  width={80}
                  height={80}
                />
                <span className="text-[7px] sm:text-[9px] font-extrabold uppercase tracking-widest z-10 text-[#d0a78b]">
                  Stop
                </span>
              </div>
            ) : (
              <>
                <Power className="w-5 h-5 sm:w-7 sm:h-7" />
                <span className="text-[7px] sm:text-[9px] font-extrabold uppercase tracking-widest mt-0.5 sm:mt-1">
                  Start
                </span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowVideoPage(true)}
            className="absolute right-4 sm:right-[50px] flex flex-col items-center justify-center text-zinc-400 hover:text-[#d0a78b] transition-colors duration-300"
          >
            <Video className="w-4 h-4 sm:w-5 sm:h-5 mb-1" />
            <span className="text-[10px] sm:text-xs font-medium">Video</span>
          </button>
        </div>
      </footer>

      <canvas ref={canvasRef} className="hidden" />
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />

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
            onFileAttach={handleFileAttach}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVideoPage && (
          <VideoPage
            onClose={() => setShowVideoPage(false)}
            isCameraActive={isCameraActive}
            toggleCamera={toggleCamera}
            facingMode={facingMode}
            onSwitchCamera={switchCameraMode}
            cameraStream={cameraStream}
            canvasRef={canvasRef}
            isActive={isActive}
            sendVideoToLive={sendVideoToLive}
            sendTextToLive={sendTextToLive}
            onScreenShareChange={(sharing) => { screenShareActiveRef.current = sharing; }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfilePage && (
          <ProfilePage
            onClose={() => setShowProfilePage(false)}
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

                <div className="p-5 bg-white/5 border border-white/10 rounded-[24px] space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">
                        Room Tone
                      </span>
                      <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">
                        {ambientEnabled ? `Quiet ${ambientVolume}` : 'Off'}
                      </span>
                    </div>
                    <button
                      onClick={() => setAmbientEnabled(v => !v)}
                      aria-pressed={ambientEnabled ? 'true' : 'false'}
                      aria-label="Toggle ambient sound"
                      title="Toggle ambient sound"
                      className={`w-11 h-6 rounded-full transition-all ${ambientEnabled ? 'bg-[#d0a78b]' : 'bg-zinc-700'}`}
                    >
                      <span className={`block w-4 h-4 rounded-full bg-white transition-all mt-1 ${ambientEnabled ? 'ml-6' : 'ml-1'}`} />
                    </button>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value={ambientVolume}
                    onChange={(e) => setAmbientVolume(parseInt(e.target.value, 10))}
                    disabled={!ambientEnabled}
                    className="w-full accent-amber-500 h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                    aria-label="Room tone volume"
                  />
                </div>

                <div className="p-5 bg-white/5 border border-white/10 rounded-[24px] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">
                        WhatsApp
                      </span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${waStatus === 'paired' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : waStatus === 'qr_ready' || waStatus === 'init' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-zinc-600'}`} />
                        <span className={`text-xs font-mono uppercase tracking-widest ${waStatus === 'paired' ? 'text-emerald-500' : waStatus === 'qr_ready' || waStatus === 'init' ? 'text-amber-500' : 'text-zinc-500'}`}>
                          {waStatus === 'paired' ? `Connected${waPhone ? ` (${waPhone})` : ''}` : waStatus === 'qr_ready' ? 'Scan QR code' : waStatus === 'init' ? 'Connecting...' : 'Not connected'}
                        </span>
                      </div>
                    </div>
                    {waStatus === 'paired' ? (
                      <button
                        onClick={async () => {
                          await disconnectWhatsApp(user.uid);
                          setWaStatus('not_found');
                          setWaPhone(null);
                          setWaQrCode(null);
                          await supabase
                            .from('user_settings')
                            .upsert({
                              user_id: user.uid,
                              whatsapp_paired: false,
                              whatsapp_phone: null,
                              whatsapp_permissions: waPermissions,
                              updated_at: new Date().toISOString(),
                            });
                        }}
                        className="px-4 py-2 bg-white/10 hover:bg-red-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          setWaPairing(true);
                          try {
                            await startWhatsAppPairing(user.uid);
                            setWaStatus('init');
                            waPollRef.current = setInterval(async () => {
                              try {
                                const s = await getWhatsAppStatus(user.uid);
                                setWaStatus(s.status);
                                if (s.qrCode) setWaQrCode(s.qrCode);
                                if (s.phone) setWaPhone(s.phone);
                                if (s.status === 'paired' || s.status === 'disconnected' || s.error) {
                                  if (s.status === 'paired') {
                                    await supabase
                                      .from('user_settings')
                                      .upsert({
                                        user_id: user.uid,
                                        whatsapp_paired: true,
                                        whatsapp_phone: s.phone || null,
                                        whatsapp_permissions: waPermissions,
                                        updated_at: new Date().toISOString(),
                                      });
                                  }
                                  if (waPollRef.current) clearInterval(waPollRef.current);
                                  waPollRef.current = null;
                                  setWaPairing(false);
                                }
                              } catch {
                                if (waPollRef.current) clearInterval(waPollRef.current);
                                waPollRef.current = null;
                                setWaPairing(false);
                              }
                            }, 1500);
                          } catch (e: any) {
                            setWaPairing(false);
                            if (waPollRef.current) clearInterval(waPollRef.current);
                            console.error('WhatsApp pairing error:', e);
                          }
                        }}
                        disabled={waPairing}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {waPairing ? 'Pairing...' : 'Pair WhatsApp'}
                      </button>
                    )}
                  </div>

                  {waStatus === 'paired' && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                      <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Permissions</p>
                      {[
                        { key: 'send_messages', label: 'Send Messages' },
                        { key: 'read_chats', label: 'Read Chats' },
                        { key: 'access_contacts', label: 'Access Contacts' },
                        { key: 'manage_contacts', label: 'Manage Contacts' },
                        { key: 'access_groups', label: 'Access Groups' },
                        { key: 'send_group_messages', label: 'Send Group Messages' },
                        { key: 'read_group_chats', label: 'Read Group Chats' },
                        { key: 'view_message_history', label: 'View Message History' },
                      ].map(p => (
                        <label key={p.key} className="flex items-center justify-between py-1.5 cursor-pointer">
                          <span className="text-xs text-zinc-400">{p.label}</span>
                          <button
                            onClick={() => toggleWaPermission(p.key)}
                            aria-pressed={waPermissions[p.key] ? 'true' : 'false'}
                            aria-label={`Toggle ${p.label}`}
                            title={`Toggle ${p.label}`}
                            className={`w-9 h-5 rounded-full transition-all ${waPermissions[p.key] ? 'bg-[#d0a78b]' : 'bg-zinc-700'}`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-full bg-white transition-all mt-[3px] ${waPermissions[p.key] ? 'ml-[18px]' : 'ml-[3px]'}`} />
                          </button>
                        </label>
                      ))}
                    </div>
                  )}

                  <a
                    href="/adminportal"
                    className="flex items-center justify-center gap-2 w-full rounded-2xl border border-[#d0a78b]/20 bg-[#d0a78b]/10 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[#d0a78b] hover:bg-[#d0a78b]/15 transition-colors"
                  >
                    <Activity className="w-4 h-4" />
                    Open Admin Portal
                  </a>

                  {waQrCode && waStatus === 'qr_ready' && (
                    <div className="flex flex-col items-center pt-2 border-t border-white/5">
                      <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Scan with WhatsApp</p>
                      <img src={waQrCode} alt="WhatsApp QR" className="w-48 h-48 rounded-2xl bg-white p-3" />
                      <p className="text-[10px] text-zinc-600 mt-2">Open WhatsApp &gt; Linked Devices &gt; Link a Device</p>
                      <button
                        onClick={() => { setWaQrCode(null); setWaStatus('not_found'); }}
                        className="text-[10px] text-zinc-600 hover:text-red-400 mt-2 uppercase tracking-wider"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-5 bg-white/5 border border-white/10 rounded-[24px] space-y-3">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                    Ollama Document Generator
                  </span>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Uses your /public sample templates as style references when Beatrice creates documents.
                  </p>
                  <div className="space-y-1 text-[10px] text-zinc-600 font-mono break-all">
                    <p>Endpoint: {getOllamaCloudConfig().endpoint || 'Missing VITE_OLLAMA_CLOUD_CHAT_URL'}</p>
                    <p>Model: {getOllamaCloudConfig().model}</p>
                  </div>
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

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">
                    What Should Beatrice Call You
                  </label>
                  <input
                    type="text"
                    value={userTitle}
                    onChange={(e) => setUserTitle(e.target.value)}
                    placeholder="e.g. Boss"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500/50 transition-colors text-white"
                    aria-label="User Title"
                  />
                  <p className="text-[9px] text-zinc-600 ml-1">
                    Beatrice will call you &ldquo;{userTitle}&rdquo;
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">
                    Language
                  </label>
                  <div className="flex rounded-2xl overflow-hidden border border-white/10 focus-within:border-amber-500/50 transition-colors">
                    <select
                      value={authLanguage}
                      onChange={(e) => { onSetLanguage(e.target.value); try { localStorage.setItem('beatrice_language', e.target.value); } catch {} }}
                      className="w-full bg-white/5 text-white px-5 py-4 outline-none appearance-none cursor-pointer text-sm"
                      aria-label="Language"
                    >
                      {LANGUAGES.map(l => (
                        <option key={l.code} value={l.code} className="bg-[#0A0A0B]">{l.label}</option>
                      ))}
                    </select>
                  </div>
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
