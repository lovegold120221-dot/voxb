-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/inypxifrayeafrlhkulz/sql)

CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT 'default',
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  text TEXT NOT NULL CHECK (char_length(text) <= 5000),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_session ON messages(user_id, session_id);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY,
  persona_name TEXT DEFAULT 'Beatrice',
  custom_prompt TEXT DEFAULT '',
  selected_voice TEXT DEFAULT 'Charon',
  context_size INT DEFAULT 20,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime for both tables (so changes flow to the frontend)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
