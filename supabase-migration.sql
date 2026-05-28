-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/inypxifrayeafrlhkulz/sql)

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT 'default',
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  text TEXT NOT NULL CHECK (char_length(text) <= 5000),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(user_id, session_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  persona_name TEXT DEFAULT 'Beatrice',
  custom_prompt TEXT DEFAULT '',
  selected_voice TEXT DEFAULT 'Aoede',
  context_size INT DEFAULT 20,
  avatar_url TEXT,
  knowledge_domains TEXT[] DEFAULT '{}',
  whatsapp_permissions JSONB DEFAULT '{"send_messages":false,"read_chats":false,"access_contacts":false,"manage_contacts":false,"access_groups":false,"send_group_messages":false,"read_group_chats":false,"manage_media":false,"view_message_history":false}'::jsonb,
  whatsapp_paired BOOLEAN DEFAULT false,
  whatsapp_phone TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_files_user_id ON knowledge_files(user_id);

-- Enable Realtime for tables (so changes flow to the frontend)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
  END IF;
END $$;

-- Create storage buckets (avatars + knowledge-base)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true),
       ('knowledge-base', 'knowledge-base', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on both buckets (getPublicUrl requires this)
DROP POLICY IF EXISTS "Public Read avatars" ON storage.objects;
CREATE POLICY "Public Read avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public Read knowledge-base" ON storage.objects;
CREATE POLICY "Public Read knowledge-base" ON storage.objects
  FOR SELECT USING (bucket_id = 'knowledge-base');

-- Allow authenticated users to upload to both buckets (auth handled by Firebase client-side)
DROP POLICY IF EXISTS "Upload avatars" ON storage.objects;
CREATE POLICY "Upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Upload knowledge-base" ON storage.objects;
CREATE POLICY "Upload knowledge-base" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'knowledge-base');

-- Allow authenticated users to delete their own knowledge files
DROP POLICY IF EXISTS "Delete own knowledge-base files" ON storage.objects;
CREATE POLICY "Delete own knowledge-base files" ON storage.objects
  FOR DELETE USING (bucket_id = 'knowledge-base');

-- Allow authenticated users to update their own avatar
DROP POLICY IF EXISTS "Update own avatar" ON storage.objects;
CREATE POLICY "Update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars');
