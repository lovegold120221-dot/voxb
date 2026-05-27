const GENERATION_SYSTEM_PROMPT = `You are a content generation worker for Beatrice, an AI assistant. Your job is to generate real, well-structured content based on user requests. Never respond with placeholder text or "lorem ipsum". Always generate actual, usable content.

Output rules:
- For webpages/dashboards: output complete, valid HTML with embedded CSS and JS. No markdown wrappers. Pure HTML.
- For documents/reports: output clean, structured markdown with proper headings.
- For code: output only the code, with appropriate language formatting.
- For text: output direct text content.
- Always be thorough. Never return a one-line response for a document request.`;

const WEBPAGE_SYSTEM_PROMPT = `You are a web page generator for Beatrice. Create a complete, production-quality single-page HTML file. Include embedded CSS and JavaScript. Use a dark theme with warm peach (#d0a78b) accents. Make it look polished, modern, and professional. The page must be fully self-contained with all styles inline. Output ONLY the raw HTML — no markdown wrappers, no code fences, no explanations. Start directly with <!DOCTYPE html>.`;

const DOCUMENT_SYSTEM_PROMPT = `You are a document writer for Beatrice. Create a thorough, well-structured document in markdown format. Use proper headings, bullet points, and sections. Be comprehensive — at least 300 words. The tone should be professional but warm. Include a title, overview, detailed sections, and a summary. Output ONLY the markdown content — no wrappers, no explanations.`;

const DASHBOARD_SYSTEM_PROMPT = `You are a dashboard creator for Beatrice. Create a complete, interactive single-page dashboard in HTML with embedded CSS and JS. Use a dark theme with warm peach (#d0a78b) accents. Include metrics, charts (using simple CSS visualizations), activity panels, and data displays. Make it look like a real monitoring dashboard. Output ONLY the raw HTML — no markdown wrappers, no code fences. Start directly with <!DOCTYPE html>.`;

function buildPrompt(taskType: string, prompt: string): { system: string; user: string } {
  switch (taskType) {
    case 'webpage':
      return {
        system: WEBPAGE_SYSTEM_PROMPT,
        user: `Create a complete single-page website for: ${prompt}. Make it beautiful and professional. Include navigation, a hero section, feature cards, and a footer.`,
      };
    case 'dashboard':
      return {
        system: DASHBOARD_SYSTEM_PROMPT,
        user: `Create a complete monitoring dashboard for: ${prompt}. Include metric cards, status indicators, activity lists, and performance bars. Make it look like a real operations dashboard.`,
      };
    case 'document':
      return {
        system: DOCUMENT_SYSTEM_PROMPT,
        user: `Write a comprehensive document about: ${prompt}. Include an introduction, several detailed sections, analysis, and a conclusion. Be thorough.`,
      };
    case 'report':
      return {
        system: DOCUMENT_SYSTEM_PROMPT,
        user: `Write a detailed report about: ${prompt}. Include an executive summary, findings, analysis, recommendations, and conclusion. Be thorough and professional.`,
      };
    case 'summarize':
      return {
        system: DOCUMENT_SYSTEM_PROMPT,
        user: `Create a clear, structured summary of: ${prompt}. Extract the key points and present them in an organized markdown format.`,
      };
    case 'code':
    case 'fix':
      return {
        system: GENERATION_SYSTEM_PROMPT,
        user: `Generate working code for: ${prompt}. Include comments and make it production-ready.`,
      };
    default:
      return {
        system: GENERATION_SYSTEM_PROMPT,
        user: `Create content for the following request: ${prompt}. Make it thorough and well-structured. Use markdown format.`,
      };
  }
}

export class OllamaWorker {
  private baseUrl: string;
  private model: string;
  private _available: boolean = false;
  private lastCheck: number = 0;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  available(): boolean {
    return this._available;
  }

  async checkConnection(): Promise<boolean> {
    if (Date.now() - this.lastCheck < 30000) return this._available;

    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        const found = models.some((m: any) => m.name?.startsWith(this.model) || m.name === this.model);
        this._available = found;
        this.lastCheck = Date.now();
        return found;
      }
    } catch {
      this._available = false;
    }

    this.lastCheck = Date.now();
    return this._available;
  }

  async generate(taskId: string, type: string, prompt: string): Promise<{ content: string; fileType: string; title: string }> {
    const { system, user } = buildPrompt(type, prompt);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          system,
          prompt: user,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 4096,
          },
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }

      const data = await response.json();
      let content = (data.response || '').trim();

      if (type === 'webpage' || type === 'dashboard') {
        content = extractHTML(content);
      }

      if (!content || content.length < 50) {
        throw new Error('Generated content too short');
      }

      return {
        content,
        fileType: type === 'webpage' || type === 'dashboard' ? 'html' : 'md',
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Result`,
      };
    } catch (err) {
      console.warn(`Ollama generation failed, falling back to local: ${err}`);
      throw err;
    }
  }
}

function extractHTML(text: string): string {
  const htmlStart = text.indexOf('<!DOCTYPE html>');
  const htmlStart2 = text.indexOf('<html');
  let start = htmlStart >= 0 ? htmlStart : htmlStart2 >= 0 ? htmlStart2 : -1;

  if (start >= 0) {
    const end = text.lastIndexOf('</html>');
    if (end > start) {
      return text.slice(start, end + 7).trim();
    }
    return text.slice(start).trim();
  }

  const codeBlockMatch = text.match(/```html?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  return text.trim();
}
