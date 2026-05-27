export interface ComputerTask {
  id: string;
  type: string;
  label: string;
  status: 'understanding' | 'preparing' | 'working' | 'reviewing' | 'finalizing' | 'done' | 'error';
  steps: ComputerStep[];
  output: ComputerOutput | null;
  createdAt: number;
}

export interface ComputerStep {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
  time?: number;
}

export interface ComputerOutput {
  type: 'document' | 'webpage' | 'code' | 'report' | 'file' | 'dashboard' | 'text' | 'zip';
  title: string;
  content: string;
  fileType?: string;
}

type ExecutionPattern = {
  regex: RegExp;
  taskType: string;
  taskLabel: string;
};

const EXECUTION_PATTERNS: ExecutionPattern[] = [
  { regex: /\b(create|make|build|generate|write|compose)\s.*?\b(document|doc|page|website|site|app|file|report|dashboard|card|table|chart|list|form|layout|design|presentation|slide|email|letter|note|summary|plan|proposal|invoice|template)\b/i, taskType: 'document', taskLabel: 'Create Document' },
  { regex: /\b(create|make|build|generate|write|code|spin up|scaffold)\s.*?\b(single\s?page|webpage|web page|html page|landing page|frontend|site|website|spa|pwa)\b/i, taskType: 'webpage', taskLabel: 'Create Web Page' },
  { regex: /\b(convert|transform|translate|change|turn|port|migrate)\s.*?(this|that|it|file|code|text|document)\b/i, taskType: 'convert', taskLabel: 'Convert Content' },
  { regex: /\b(summarize|summarise|summary|sum up|tldr|recap|condense|shorten)\s.*?\b/i, taskType: 'summarize', taskLabel: 'Summarize Content' },
  { regex: /\b(fix|repair|correct|debug|patch|resolve|untangle|clean up|refactor|improve)\s.*?\b(code|file|bug|issue|error|problem|script|function|component)\b/i, taskType: 'fix', taskLabel: 'Fix Code' },
  { regex: /\b(fix|repair|correct|clean up|improve|rewrite|polish|enhance)\s.*?\b(this|that|it|the)\b/i, taskType: 'fix', taskLabel: 'Fix Content' },
  { regex: /\b(check|inspect|verify|test|validate|audit|scan|review|look at|examine)\s.*?\b(server|vps|host|machine|system|status|health|logs|database|storage|memory|usage|cpu|network)\b/i, taskType: 'check', taskLabel: 'Check System' },
  { regex: /\b(run|execute|start|trigger|launch|begin|initiate|do|perform|process|handle|work on)\s.*?\b(this|that|it|the|task|job|script|command|operation|action|workflow|pipeline|build)\b/i, taskType: 'execute', taskLabel: 'Run Task' },
  { regex: /\b(deploy|publish|release|ship|push|upload|go live|launch|make live)\s.*?\b/i, taskType: 'deploy', taskLabel: 'Deploy' },
  { regex: /\b(zip|compress|package|bundle|archive|tarball)\s.*?\b/i, taskType: 'zip', taskLabel: 'Create Archive' },
  { regex: /\b(do|handle|take care of|prepare|sort out|organize|manage|process)\s.*?\b(this|that|it|the|for me|task)\b/i, taskType: 'execute', taskLabel: 'Handle Task' },
  { regex: /\b(for me|can you|do you|will you|could you|would you)\s/i, taskType: 'execute', taskLabel: 'Handle Request' },
  { regex: /\b(save|put|send|email|store|upload|copy|move)\s.*?\b(this|that|it|the|file|result|document|output)\s.*?\b(to|in|on|into)\b/i, taskType: 'execute', taskLabel: 'Handle Action' },
  { regex: /\b(make|turn|get)\s.*?\b(into|ready|prepared|presentable|something I can)\b/i, taskType: 'webpage', taskLabel: 'Create Artifact' },
];

export function detectExecutionIntent(text: string): { type: string; label: string } | null {
  if (!text || text.trim().length < 4) return null;

  for (const pattern of EXECUTION_PATTERNS) {
    if (pattern.regex.test(text)) {
      return { type: pattern.taskType, label: pattern.taskLabel };
    }
  }

  return null;
}
