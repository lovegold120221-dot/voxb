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
  selected_voice TEXT DEFAULT 'Charon',
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

-- Enable Realtime for both tables (so changes flow to the frontend)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
