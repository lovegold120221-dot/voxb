import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Trash2, Link, Globe, User, Mail, Check, Loader2, FileText, AlertCircle, LogOut } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { supabase } from '../lib/supabase';
import {
  uploadAvatar,
  uploadKnowledgeFile,
  listKnowledgeFiles,
  deleteKnowledgeFile,
  updateKnowledgeDomains,
} from '../lib/supabaseStorage';

interface ProfilePageProps {
  onClose: () => void;
}

export function ProfilePage({ onClose }: ProfilePageProps) {
  const user = auth.currentUser!;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.photoURL);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<Array<{
    id: string; name: string; type: string; size: number; uploadedAt: string; url: string;
  }>>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [savingDomains, setSavingDomains] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('avatar_url, knowledge_domains')
        .eq('user_id', user.uid)
        .single();
      if (settings?.avatar_url) setAvatarUrl(settings.avatar_url);
      if (settings?.knowledge_domains) setDomains(settings.knowledge_domains);
      const files = await listKnowledgeFiles(user.uid);
      setKnowledgeFiles(files);
    } catch (e) {
      console.error('Failed to load profile:', e);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed for avatar');
      return;
    }
    setUploadingAvatar(true);
    setError(null);
    try {
      const url = await uploadAvatar(user.uid, file);
      setAvatarUrl(url);
      setSuccess('Avatar updated');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKnowledgeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setError(null);
    try {
      const result = await uploadKnowledgeFile(user.uid, file);
      setKnowledgeFiles(prev => [{
        id: result.id,
        name: result.name,
        type: result.type,
        size: result.size,
        uploadedAt: new Date().toISOString(),
        url: '',
      }, ...prev]);
      setSuccess('File uploaded to knowledge base');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to upload file');
    } finally {
      setUploadingFile(false);
      if (knowledgeInputRef.current) knowledgeInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    setDeletingFile(fileId);
    setError(null);
    try {
      await deleteKnowledgeFile(user.uid, fileId);
      setKnowledgeFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (e: any) {
      setError(e.message || 'Failed to delete file');
    } finally {
      setDeletingFile(null);
    }
  };

  const addDomain = () => {
    const d = domainInput.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!d) return;
    if (domains.includes(d)) { setDomainInput(''); return; }
    setDomains(prev => [...prev, d]);
    setDomainInput('');
  };

  const removeDomain = (d: string) => {
    setDomains(prev => prev.filter(x => x !== d));
  };

  const saveDomains = async () => {
    setSavingDomains(true);
    setError(null);
    try {
      await updateKnowledgeDomains(user.uid, domains);
      setSuccess('Domains saved');
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) {
      setError(e.message || 'Failed to save domains');
    } finally {
      setSavingDomains(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#161312] flex flex-col h-[100dvh]"
    >
      <header className="sticky top-0 w-full bg-[#161312]/95 backdrop-blur-md border-b border-zinc-800/60 px-4 py-3 flex items-center justify-between z-10 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-wide text-[#d0a78b]">Profile</h1>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 max-w-2xl mx-auto w-full">
        {/* Success/Error toasts */}
        <AnimatePresence>
          {(error || success) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`px-4 py-3 rounded-xl flex items-center gap-2 text-sm ${
                error ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              }`}
            >
              {error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
              <span>{error || success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User Info */}
        <section className="bg-white/5 border border-white/10 rounded-[24px] p-6">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-16 h-16 rounded-full bg-zinc-800 overflow-hidden ring-2 ring-zinc-700">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <User className="w-8 h-8" />
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <Upload className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div>
              <p className="text-white font-medium">{user.displayName || 'User'}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-sm text-zinc-400">{user.email}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] text-emerald-500 uppercase tracking-wider font-semibold">
                  Google Connected
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Knowledge Base */}
        <section className="bg-white/5 border border-white/10 rounded-[24px] p-6">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Knowledge Base</h2>
          <p className="text-[11px] text-zinc-600 mb-4">
            Upload files for Beatrice and Eburon workers to reference.
            Supported: txt, csv, pdf, doc/docx, json, md
          </p>

          <div
            onClick={() => knowledgeInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 rounded-2xl p-6 text-center cursor-pointer hover:border-[#d0a78b]/40 transition-colors"
          >
            {uploadingFile ? (
              <Loader2 className="w-8 h-8 animate-spin text-zinc-500 mx-auto mb-2" />
            ) : (
              <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
            )}
            <p className="text-sm text-zinc-400">{uploadingFile ? 'Uploading...' : 'Click to upload or drag & drop'}</p>
            <p className="text-[10px] text-zinc-600 mt-1">Max 10MB per file</p>
          </div>
          <input
            ref={knowledgeInputRef}
            type="file"
            accept=".txt,.csv,.pdf,.doc,.docx,.json,.md,text/plain,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleKnowledgeUpload}
            className="hidden"
          />

          {knowledgeFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {knowledgeFiles.map(f => (
                <div key={f.id} className="flex items-center gap-3 bg-zinc-900/60 rounded-xl px-3 py-2.5 border border-zinc-800">
                  <FileText className="w-4 h-4 text-[#d0a78b] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">{f.name}</p>
                    <p className="text-[10px] text-zinc-600">{formatSize(f.size)}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteFile(f.id)}
                    disabled={deletingFile === f.id}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    {deletingFile === f.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* URL Domains */}
        <section className="bg-white/5 border border-white/10 rounded-[24px] p-6">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">URL Domains</h2>
          <p className="text-[11px] text-zinc-600 mb-4">
            Add domain URLs for Beatrice and workers to access as personalized data sources.
          </p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
              placeholder="e.g. example.com"
              className="flex-1 bg-zinc-900/90 text-sm text-white px-4 py-2.5 rounded-xl border border-zinc-800 focus:outline-none focus:border-[#d0a78b]/50 placeholder-zinc-500"
            />
            <button
              onClick={addDomain}
              disabled={!domainInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-[#d0a78b]/15 border border-[#d0a78b]/20 text-[#d0a78b] text-sm font-medium hover:bg-[#d0a78b]/25 transition-colors disabled:opacity-30"
            >
              <Globe className="w-4 h-4" />
            </button>
          </div>

          {domains.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {domains.map(d => (
                <span key={d} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
                  <Link className="w-3 h-3 text-zinc-500" />
                  {d}
                  <button onClick={() => removeDomain(d)} className="text-zinc-600 hover:text-red-400 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <button
            onClick={saveDomains}
            disabled={savingDomains}
            className="w-full py-2.5 rounded-xl bg-[#d0a78b]/10 border border-[#d0a78b]/20 text-[#d0a78b] text-sm font-medium hover:bg-[#d0a78b]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {savingDomains ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {savingDomains ? 'Saving...' : 'Save Domains'}
          </button>
        </section>

        {/* Logout */}
        <section className="pb-8">
          <button
            onClick={() => { signOut(auth); onClose(); }}
            className="w-full py-3 rounded-xl bg-red-500/5 border border-red-500/15 text-red-400 text-sm font-medium hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </section>
      </div>
    </motion.div>
  );
}
