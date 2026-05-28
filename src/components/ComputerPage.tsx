import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Loader2, Eye, Download, Copy, FileText, Code, Globe, FileArchive, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react';
import type { ComputerTask } from '../lib/executionDetector';

interface ComputerPageProps {
  task: ComputerTask;
  onClose: () => void;
  onRetry?: (taskId: string) => void;
  personaName: string;
  outputContent?: string;
  outputTitle?: string;
  previewUrl?: string | null;
  downloadUrl?: string | null;
}

const STATUS_HEADERS: Record<string, string> = {
  understanding: 'Understanding what you need',
  preparing: 'Preparing to work',
  working: 'Working on it',
  reviewing: 'Reviewing the result',
  finalizing: 'Finalizing',
  done: 'Done',
  error: 'Something needs attention',
};

const STATUS_ACTIONS: Record<string, string> = {
  understanding: 'Reading your request...',
  preparing: 'Setting up the workspace...',
  working: 'Creating your output...',
  reviewing: 'Checking everything looks right...',
  finalizing: 'Saving the final version...',
};

const TYPE_PREFIXES: Record<string, string> = {
  document: 'Creating',
  webpage: 'Building',
  convert: 'Converting',
  summarize: 'Summarizing',
  fix: 'Fixing',
  check: 'Checking',
  execute: 'Running',
  deploy: 'Deploying',
  zip: 'Packaging',
  text: 'Processing',
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  webpage: Globe,
  code: Code,
  report: FileText,
  file: FileText,
  dashboard: Globe,
  text: FileText,
  zip: FileArchive,
};

export function ComputerPage({
  task,
  onClose,
  onRetry,
  personaName,
  outputContent,
  outputTitle,
  previewUrl,
  downloadUrl,
}: ComputerPageProps) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [localTask, setLocalTask] = useState<ComputerTask>(task);

  useEffect(() => {
    setLocalTask(task);
  }, [task]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = (content: string, fileName: string, fileType?: string) => {
    const ext = fileType === 'html' ? '.html' : fileType === 'md' ? '.md' : fileType === 'zip' ? '.zip' : '.txt';
    const blob = new Blob([content], { type: fileType === 'html' ? 'text/html' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/\s+/g, '-').toLowerCase()}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const actionText = TYPE_PREFIXES[localTask.type] || 'Working on';
  const statusHeader = STATUS_HEADERS[localTask.status] || 'Working';
  const statusAction = STATUS_ACTIONS[localTask.status];
  const isActive = localTask.status !== 'done' && localTask.status !== 'error';
  const output = localTask.output;
  const OutputIcon = output ? (ICON_MAP[output.type] || FileText) : FileText;

  const activeStep = localTask.steps.find(s => s.active);
  const liveLabel = activeStep ? activeStep.label : localTask.label;

  const isPreviewable = output?.type && ['webpage', 'dashboard', 'document', 'report', 'summarize'].includes(output.type);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0d0a08] flex flex-col h-[100dvh]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(208,167,139,0.03),transparent_70%)] pointer-events-none" />

      <header className="sticky top-0 w-full bg-[#0d0a08]/95 backdrop-blur-md border-b border-zinc-800/60 px-4 py-3 flex items-center justify-between z-10 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center flex flex-col items-center">
          <h1 className="text-sm font-semibold tracking-wide text-[#d0a78b]">{personaName}</h1>
          <p className="text-[9px] text-zinc-500 tracking-[0.2em] lowercase -mt-0.5">workspace</p>
        </div>

        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Status header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-1"
        >
          <div className="flex items-center justify-center gap-2">
            {isActive && (
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-[#d0a78b]"
              />
            )}
            {localTask.status === 'error' && (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            {localTask.status === 'done' && (
              <Check className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <p className="text-base font-medium text-zinc-200">
            {isActive ? statusHeader : localTask.status === 'error' ? 'Something went wrong' : 'All done'}
          </p>
          {isActive && localTask.status !== 'understanding' && (
            <p className="text-xs text-zinc-500">{statusAction}</p>
          )}
          {isActive && (
            <p className="text-[10px] text-[#d0a78b]/60 tracking-wide mt-1 lowercase">
              {actionText.toLowerCase()} &mdash; {liveLabel.toLowerCase()}
            </p>
          )}
        </motion.div>

        {/* Mini computer screen */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#111]/80 border border-zinc-800/50 rounded-2xl overflow-hidden shadow-inner"
        >
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/30 bg-[#0a0a0c]">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
            </div>
            <div className="flex-1 text-center">
              <span className="text-[9px] text-zinc-600 tracking-wider uppercase">beatrice.session</span>
            </div>
          </div>

          <div className="px-4 py-4 space-y-2.5 min-h-[120px]">
            {localTask.steps.map((step) => (
              <div
                key={step.key}
                className={`flex items-center gap-2.5 transition-all duration-300 ${
                  step.done ? 'opacity-60' : step.active ? 'opacity-100' : 'opacity-40'
                }`}
              >
                {step.done ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                ) : step.active ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#d0a78b] animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 flex-shrink-0" />
                )}
                <span className={`text-xs ${step.active ? 'text-[#d0a78b]' : step.done ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {step.label}
                </span>
                {step.time && step.done && (
                  <span className="text-[9px] text-zinc-700 tabular-nums ml-auto">{Math.round((Date.now() - step.time) / 1000)}s</span>
                )}
              </div>
            ))}

            {localTask.status === 'error' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-2"
              >
                <p className="text-xs text-red-400/80 leading-relaxed">
                  Something stopped the process. The partial output has been saved. You can try again or check the details.
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Output area */}
        <AnimatePresence>
          {(localTask.status === 'done' || localTask.status === 'error') && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Output
                </p>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* File card */}
              <div className="bg-[#111]/80 border border-zinc-800/50 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/30">
                  <div className="w-10 h-10 rounded-xl bg-[#d0a78b]/10 flex items-center justify-center">
                    {OutputIcon && <OutputIcon className="w-5 h-5 text-[#d0a78b]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {outputTitle || output?.title || 'Result'}
                    </p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      {output?.fileType ? `.${output.fileType}` : 'text'} &middot; {localTask.label}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3.5 space-y-3">
                  {isPreviewable ? (
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#d0a78b]/10 border border-[#d0a78b]/20 text-[#d0a78b] text-sm font-medium hover:bg-[#d0a78b]/20 transition-all"
                    >
                      <span className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        {showPreview ? 'Hide preview' : 'Open preview'}
                      </span>
                      <ChevronRight className={`w-4 h-4 transition-transform ${showPreview ? 'rotate-90' : ''}`} />
                    </button>
                  ) : (
                    <div className="bg-[#0a0a0c] rounded-xl p-3 border border-zinc-800/30 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono">
                        {(outputContent || output?.content || '').slice(0, 2000)}
                        {(outputContent || output?.content || '').length > 2000 ? '\n\n...' : ''}
                      </pre>
                    </div>
                  )}

                  <AnimatePresence>
                    {showPreview && isPreviewable && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden rounded-xl border border-zinc-800/30"
                      >
                        <iframe
                          src={previewUrl || undefined}
                          srcDoc={previewUrl ? undefined : (outputContent || output.content)}
                          className="w-full h-80 bg-white rounded-xl"
                          sandbox="allow-scripts"
                          title="Preview"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(outputContent || output?.content || '')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-medium hover:border-zinc-700 hover:text-zinc-200 transition-all"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (downloadUrl) {
                          window.open(downloadUrl, '_blank');
                        } else {
                          handleDownload(
                            outputContent || output?.content || '',
                            outputTitle || output?.title || 'output',
                            output?.fileType
                          );
                        }
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#d0a78b] text-black text-sm font-medium hover:bg-[#ebd0bc] transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>

              {localTask.status === 'error' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <button
                    onClick={() => onRetry?.(localTask.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm hover:border-zinc-700 hover:text-zinc-200 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className="sticky bottom-0 w-full bg-[#0d0a08]/95 backdrop-blur-md border-t border-zinc-800/60 px-4 py-3 z-10 shrink-0">
        <div className="flex items-center justify-center gap-2">
          <p className="text-[10px] text-zinc-600 tracking-wide">
            {isActive ? `${personaName} is working` : localTask.status === 'error' ? `${personaName} needs your attention` : `${personaName} finished`}
          </p>
        </div>
      </footer>
    </motion.div>
  );
}
