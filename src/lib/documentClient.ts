import { getBackendUrl } from './whatsappClient';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data as T;
}

export async function streamDocumentFromVps(
  userId: string, 
  args: { title: string; content: string }, 
  onChunk: (chunk: string) => void
) {
  const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
  
  const response = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OLLAMA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MODEL || 'gpt-oss:120b',
      messages: [{
        role: 'user',
        content: `Create a professional document: ${args.title}. 
        Requirements:
        - Output must be a single self-contained HTML file (merge HTML, CSS, JS).
        - Style: PDF-like output, professional, clean.
        - Content: ${args.content}
        - Reference templates are available in /public folder.
        - Return ONLY the HTML code. No markdown blocks, no explanations.`,
      }],
      stream: true,
    }),
  });

  if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) throw new Error('Failed to obtain a reader from the response');

  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    
    // Ollama stream returns JSON objects per line
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const content = json.message?.content || '';
        fullContent += content;
        onChunk(content);
      } catch (e) {
        // Ignore partial JSON chunks
      }
    }
  }

  // Final synchronization with VPS for state consistency
  await requestJson('/api/create-document', {
    method: 'POST',
    body: JSON.stringify({ userId, title: args.title, content: fullContent }),
  });

  return fullContent;
}

export async function createDocumentOnVps(userId: string, args: { title: string; content: string }) {
  // Legacy non-streaming support
  return streamDocumentFromVps(userId, args, () => {});
}



export async function createDocumentOnVps(userId: string, args: { title: string; content: string }) {
  const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
  
  // If we have the key, we can try calling Ollama directly or through a proxy
  // but the user specifically wants the "computer use" / VPS flow.
  // To fix the "showing prompt trigger" issue, we must ensure the tool actually executes
  // and the model receives a valid response.
  
  // Implementation using the Ollama API as requested for the generation part
  try {
    const response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
    body: JSON.stringify({
      model: process.env.MODEL || 'gpt-oss:120b',
      messages: [{
        role: 'user',
        content: `Create a professional document: ${args.title}. 
        Requirements:
        - Output must be a single self-contained HTML file (merge HTML, CSS, JS).
        - Style: PDF-like output, professional, clean.
        - Content: ${args.content}
        - Reference templates are available in /public folder.
        - Return ONLY the HTML code. No markdown blocks, no explanations.`,
      }],
      stream: false,
    }),
    });

    const data = await response.json();
    const generatedHtml = data.message?.content || '';

    if (!generatedHtml) throw new Error('Ollama failed to generate content');

    // We still save the result to the VPS to keep the "computer use" state consistent
    await requestJson('/api/create-document', {
      method: 'POST',
      body: JSON.stringify({ userId, title: args.title, content: generatedHtml }),
    });

    return {
      ok: true,
      title: args.title,
      content: generatedHtml
    };

  } catch (e: any) {
    console.error('Ollama document generation failed:', e);
    throw new Error(`Document generation failed: ${e.message}`);
  }
}


export async function createDocumentOnVps(userId: string, args: { title: string; content: string }) {
  return requestJson<{ content?: string; url?: string; title?: string }>('/api/create-document', {
    method: 'POST',
    body: JSON.stringify({ userId, ...args }),
  });
}
