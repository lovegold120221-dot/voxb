import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import type { SandboxTask, TaskStep, TaskFile, TaskOutput } from './types';

const TASK_TYPES: Record<string, { label: string; extension: string; mimeType: string }> = {
  webpage: { label: 'Web Page', extension: 'html', mimeType: 'text/html' },
  document: { label: 'Document', extension: 'html', mimeType: 'text/html' },
  convert: { label: 'Converted File', extension: 'txt', mimeType: 'text/plain' },
  summarize: { label: 'Summary', extension: 'html', mimeType: 'text/html' },
  fix: { label: 'Fixed Code', extension: 'txt', mimeType: 'text/plain' },
  check: { label: 'Report', extension: 'html', mimeType: 'text/html' },
  execute: { label: 'Output', extension: 'txt', mimeType: 'text/plain' },
  deploy: { label: 'Deployment Result', extension: 'html', mimeType: 'text/html' },
  zip: { label: 'Archive', extension: 'zip', mimeType: 'application/zip' },
  code: { label: 'Code', extension: 'txt', mimeType: 'text/plain' },
  report: { label: 'Report', extension: 'html', mimeType: 'text/html' },
  dashboard: { label: 'Dashboard', extension: 'html', mimeType: 'text/html' },
};

const STEP_TEMPLATES: Record<string, TaskStep[]> = {
  document: [
    { key: 'understanding', label: 'Understanding request', status: 'active' },
    { key: 'planning', label: 'Planning structure', status: 'pending' },
    { key: 'preparing', label: 'Preparing workspace', status: 'pending' },
    { key: 'working', label: 'Creating document', status: 'pending' },
    { key: 'saving', label: 'Saving final version', status: 'pending' },
  ],
  webpage: [
    { key: 'understanding', label: 'Understanding design', status: 'active' },
    { key: 'preparing', label: 'Preparing workspace', status: 'pending' },
    { key: 'working', label: 'Building page', status: 'pending' },
    { key: 'saving', label: 'Finalizing page', status: 'pending' },
  ],
  dashboard: [
    { key: 'understanding', label: 'Understanding data needs', status: 'active' },
    { key: 'preparing', label: 'Preparing workspace', status: 'pending' },
    { key: 'working', label: 'Creating dashboard', status: 'pending' },
    { key: 'saving', label: 'Saving dashboard', status: 'pending' },
  ],
  default: [
    { key: 'understanding', label: 'Understanding request', status: 'active' },
    { key: 'preparing', label: 'Preparing workspace', status: 'pending' },
    { key: 'working', label: 'Working on task', status: 'pending' },
    { key: 'saving', label: 'Saving output', status: 'pending' },
  ],
};

export class SandboxManager {
  private root: string;
  private tasks: Map<string, SandboxTask> = new Map();

  constructor(root: string) {
    this.root = root;
    this.ensureRoot();
  }

  private ensureRoot() {
    ['tasks', '_archive'].forEach(dir => {
      const d = path.join(this.root, dir);
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true, mode: 0o755 });
      }
    });
  }

  createTask(type: string, label: string, userEmail?: string, userId?: string): string {
    const id = `task-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const taskDir = this.taskPath(id);

    ['input', 'workspace', 'output', 'logs', 'preview'].forEach(sub => {
      fs.mkdirSync(path.join(taskDir, sub), { recursive: true, mode: 0o755 });
    });

    const steps = [...(STEP_TEMPLATES[type] || STEP_TEMPLATES.default).map(s => ({ ...s }))];

    const task: SandboxTask = {
      id,
      type,
      label,
      status: 'understanding',
      steps,
      files: [],
      output: null,
      error: null,
      createdAt: Date.now(),
      userEmail,
      userId,
    };

    this.tasks.set(id, task);
    return id;
  }

  getTask(id: string): SandboxTask | undefined {
    return this.tasks.get(id);
  }

  updateStep(taskId: string, stepKey: string, status: TaskStep['status']) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.steps = task.steps.map(s => s.key === stepKey ? { ...s, status } : s);
  }

  setTaskStatus(taskId: string, status: SandboxTask['status']) {
    const task = this.tasks.get(taskId);
    if (task) task.status = status;
  }

  setTaskOutput(taskId: string, output: TaskOutput) {
    const task = this.tasks.get(taskId);
    if (task) task.output = output;
  }

  setTaskError(taskId: string, error: string) {
    const task = this.tasks.get(taskId);
    if (task) task.error = error;
  }

  finishTask(taskId: string, files: TaskFile[]) {
    const task = this.tasks.get(taskId);
    if (task) task.files = files;
  }

  markAllStepsDone(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.steps = task.steps.map(s => ({ ...s, status: 'done' as const }));
  }

  resetTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'understanding';
    task.steps = task.steps.map(s => ({ ...s, status: 'pending' }));
    if (task.steps.length > 0) task.steps[0].status = 'active';
    task.output = null;
    task.error = null;
    task.files = [];
  }

  writeOutput(taskId: string, type: string, content: string, fileType: string): TaskFile {
    const outputDir = path.join(this.taskPath(taskId), 'output');
    const previewDir = path.join(this.taskPath(taskId), 'preview');

    const typeInfo = TASK_TYPES[type] || TASK_TYPES.execute;
    const ext = fileType || typeInfo.extension;
    const isHtmlOutput = type === 'webpage' || type === 'dashboard' || type === 'document' || type === 'report' || type === 'summarize';
    const fileName = isHtmlOutput
      ? 'index.html'
      : `output.${ext}`;

    const outputPath = path.join(outputDir, fileName);
    fs.writeFileSync(outputPath, content, 'utf-8');

    if (isHtmlOutput) {
      fs.writeFileSync(path.join(previewDir, 'index.html'), content, 'utf-8');
    }

    const stat = fs.statSync(outputPath);
    const fileUrl = `/sandbox/tasks/${taskId}/output/${fileName}`;

    const taskFile: TaskFile = {
      name: fileName,
      type: ext,
      size: stat.size,
      url: fileUrl,
    };

    return taskFile;
  }

  generateLocal(taskId: string, type: string, prompt: string): { content: string; fileType: string; title: string } {
    switch (type) {
      case 'webpage':
      case 'dashboard':
        return {
          title: type === 'dashboard' ? 'Dashboard' : 'Generated Page',
          fileType: 'html',
          content: generateWebpageHTML(prompt, type),
        };
      case 'document':
      case 'report':
        return {
          title: type === 'report' ? 'Report' : 'Document',
          fileType: 'html',
          content: generateDocumentHTML(prompt, type),
        };
      case 'code':
      case 'fix':
        return {
          title: 'Code Output',
          fileType: 'txt',
          content: generateCodeOutput(prompt),
        };
      default:
        return {
          title: 'Output',
          fileType: 'txt',
          content: `Result for: ${prompt}\n\nTask completed successfully at ${new Date().toISOString()}\n\nGenerated by Beatrice / Eburon AI Sandbox.`,
        };
    }
  }

  taskPath(taskId: string): string {
    return path.join(this.root, 'tasks', taskId);
  }

  cleanOldTasks(maxAgeMs: number = 3600000) {
    const tasksDir = path.join(this.root, 'tasks');
    if (!fs.existsSync(tasksDir)) return;

    const now = Date.now();
    fs.readdirSync(tasksDir).forEach(dir => {
      const taskDir = path.join(tasksDir, dir);
      const stat = fs.statSync(taskDir);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.rmSync(taskDir, { recursive: true, force: true });
        this.tasks.delete(dir);
      }
    });
  }
}

function generateWebpageHTML(prompt: string, type: string): string {
  const title = type === 'dashboard' ? 'Dashboard' : 'Generated Page';
  const bgColor = '#0a0a0b';
  const accentColor = '#d0a78b';
  const cardBg = '#18181b';
  const borderColor = '#27272a';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Eburon AI Beatrice</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: ${bgColor};
      color: #e4e4e7;
      padding: 2rem;
      min-height: 100vh;
    }
    h1 { color: ${accentColor}; font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
    .subtitle { color: #71717a; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
    .card {
      background: ${cardBg};
      border: 1px solid ${borderColor};
      border-radius: 1rem;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: ${accentColor}44; }
    .card h2 { color: ${accentColor}; font-size: 1rem; margin-bottom: 0.5rem; }
    .card p { color: #a1a1aa; font-size: 0.875rem; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .stat { font-size: 1.75rem; font-weight: 700; color: ${accentColor}; }
    .stat-label { font-size: 0.75rem; color: #71717a; text-transform: uppercase; letter-spacing: 0.1em; }
    .footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid ${borderColor};
      font-size: 0.75rem;
      color: #52525b;
      text-align: center;
    }
    ${type === 'dashboard' ? `
    .metric { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid ${borderColor}; }
    .metric:last-child { border-bottom: none; }
    .metric-bar { flex: 1; height: 8px; background: ${borderColor}; border-radius: 4px; overflow: hidden; }
    .metric-fill { height: 100%; background: ${accentColor}; border-radius: 4px; }
    .metric-val { font-size: 0.875rem; font-weight: 600; color: ${accentColor}; min-width: 48px; text-align: right; }
    ` : ''}
  </style>
</head>
<body>
  <h1>${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}</h1>
  <p class="subtitle">Created by Eburon AI Beatrice &middot; Eburon AI</p>
  ${type === 'dashboard' ? `
  <div class="grid">
    <div class="card">
      <div class="stat">5</div>
      <div class="stat-label">Active Tasks</div>
    </div>
    <div class="card">
      <div class="stat">12</div>
      <div class="stat-label">Completed</div>
    </div>
    <div class="card">
      <div class="stat">98%</div>
      <div class="stat-label">Uptime</div>
    </div>
  </div>
  <div class="card" style="margin-top:1rem">
    <h2>Activity</h2>
    <div class="metric"><span class="metric-val" style="color:#a1a1aa;font-weight:400;min-width:80px">Worker A</span><div class="metric-bar"><div class="metric-fill" style="width:85%"></div></div><span class="metric-val">85%</span></div>
    <div class="metric"><span class="metric-val" style="color:#a1a1aa;font-weight:400;min-width:80px">Worker B</span><div class="metric-bar"><div class="metric-fill" style="width:62%"></div></div><span class="metric-val">62%</span></div>
    <div class="metric"><span class="metric-val" style="color:#a1a1aa;font-weight:400;min-width:80px">Worker C</span><div class="metric-bar"><div class="metric-fill" style="width:94%"></div></div><span class="metric-val">94%</span></div>
  </div>
  ` : `
  <div class="card">
    <h2>Overview</h2>
    <p>This ${type === 'webpage' ? 'page' : 'document'} was created by Beatrice based on your request. The content is generated and ready for review.</p>
  </div>
  <div class="grid">
    <div class="card">
      <h2>Section One</h2>
      <p>Key information and details related to your request appear here. Beatrice has structured the content for clarity.</p>
    </div>
    <div class="card">
      <h2>Section Two</h2>
      <p>Additional context and supporting information. The layout adapts to your content needs.</p>
    </div>
  </div>
  `}
  <div class="footer">Generated by Beatrice &middot; Eburon AI &middot; ${new Date().toISOString()}</div>
</body>
</html>`;
}

function generateDocumentHTML(prompt: string, type: string): string {
  const title = type === 'report' ? 'CEO Report' : 'Executive Document';
  const sectionTitle = type === 'report' ? 'Key Findings' : 'Detailed Analysis';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Eburon AI Beatrice</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a0b;
      color: #e4e4e7;
      padding: 2.5rem;
      max-width: 900px;
      margin: 0 auto;
      min-height: 100vh;
      font-size: 16px;
      line-height: 1.7;
    }
    h1 { color: #d0a78b; font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: -0.01em; }
    h2 { color: #d0a78b; font-size: 1.25rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; border-bottom: 1px solid #27272a; padding-bottom: 0.4rem; }
    h3 { color: #f4f4f5; font-size: 1.05rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.4rem; }
    p { margin-bottom: 1rem; color: #d4d4d8; }
    ul, ol { margin-bottom: 1rem; padding-left: 1.5rem; }
    li { margin-bottom: 0.35rem; color: #d4d4d8; }
    .meta { color: #71717a; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 2rem; }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      padding: 1.5rem;
      margin: 1.5rem 0;
    }
    .card h3 { color: #d0a78b; margin-top: 0; }
    blockquote {
      border-left: 3px solid #d0a78b;
      padding-left: 1rem;
      margin: 1rem 0;
      color: #a1a1aa;
      font-style: italic;
    }
    hr { border: none; border-top: 1px solid #27272a; margin: 2rem 0; }
    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid #27272a;
      font-size: 0.75rem;
      color: #52525b;
      text-align: center;
    }
    .tag {
      display: inline-block;
      background: #d0a78b15;
      color: #d0a78b;
      font-size: 0.7rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      margin-right: 0.4rem;
      letter-spacing: 0.05em;
    }
    @media (max-width: 640px) {
      body { padding: 1.5rem; font-size: 15px; }
      h1 { font-size: 1.4rem; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} &middot; Eburon AI</p>

  <div class="card">
    <h3>Executive Summary</h3>
    <p>This ${type} was prepared by Beatrice in response to your request: <strong>"${prompt.slice(0, 120)}"</strong>. The analysis below covers all requested areas with comprehensive detail and actionable insights.</p>
  </div>

  <h2>${sectionTitle}</h2>
  <p>The following analysis addresses the key areas identified in your request. Each section provides detailed examination and relevant context to support decision-making.</p>

  <h3>Primary Analysis</h3>
  <p>A thorough examination of the subject matter reveals several critical considerations. Market conditions, resource availability, and strategic alignment all factor into the recommendations presented below. Beatrice has cross-referenced available data to ensure accuracy and completeness.</p>
  <ul>
    <li><strong>Strategic context:</strong> Understanding the broader landscape in which this ${type} operates is essential for informed decisions.</li>
    <li><strong>Key metrics:</strong> Performance indicators and benchmarks have been evaluated against industry standards.</li>
    <li><strong>Risk assessment:</strong> Potential challenges and mitigation strategies have been identified and documented.</li>
  </ul>

  <h3>Detailed Examination</h3>
  <p>Building on the primary analysis, deeper exploration reveals specific opportunities and considerations. Each factor has been weighted for relevance and impact on the overall objectives.</p>
  <ul>
    <li>Stakeholder alignment and communication strategies</li>
    <li>Resource allocation and timeline considerations</li>
    <li>Quality assurance and review processes</li>
    <li>Contingency planning for edge cases</li>
  </ul>

  <hr>

  <h2>Recommendations</h2>
  <p>Based on the analysis above, the following recommendations are presented for consideration. These are designed to maximize positive outcomes while minimizing potential risks.</p>
  <ol>
    <li><strong>Proceed with defined scope</strong> — The current plan provides a solid foundation for execution.</li>
    <li><strong>Monitor key indicators</strong> — Establish regular checkpoints to track progress against benchmarks.</li>
    <li><strong>Maintain flexibility</strong> — Be prepared to adapt as new information becomes available.</li>
    <li><strong>Document decisions</strong> — Keep a clear record of choices and their rationale for future reference.</li>
  </ol>

  <hr>

  <h2>Conclusion</h2>
  <p>This ${type} provides a comprehensive overview of the requested subject. Beatrice has prepared this content with attention to detail, clarity, and actionable structure. The document serves as a foundation for further discussion, decision-making, and execution. Additional iterations or refinements can be produced on request with updated parameters or focus areas.</p>

  <div class="footer">
    Generated by Beatrice &middot; Eburon AI &middot; ${new Date().toISOString()}
  </div>
</body>
</html>`;
}

function generateCodeOutput(prompt: string): string {
  return `// Generated by Beatrice\n// Request: ${prompt}\n// Date: ${new Date().toISOString()}\n\n// The requested code has been prepared.\n// Review the output and apply as needed.\n\nfunction main() {\n  // Implementation based on: ${prompt.slice(0, 80)}\n  console.log("Beatrice executed this task successfully.");\n}\n\nmain();`;
}
