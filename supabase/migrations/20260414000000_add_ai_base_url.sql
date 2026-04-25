-- Add optional base URL column for OpenAI-compatible provider endpoints.
-- When null, the default OpenAI API endpoint is used.
ALTER TABLE profiles ADD COLUMN ai_base_url text;
