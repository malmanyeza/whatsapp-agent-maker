-- Add logo_url to chatbots table
ALTER TABLE public.chatbots ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create Storage Bucket for Logos if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('chatbot-logos', 'chatbot-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for chatbot-logos
-- Allow public access to view logos
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'chatbot-logos' );

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'chatbot-logos' AND auth.role() = 'authenticated' );

-- Allow users to update their own logos (optional but good practice)
CREATE POLICY "Users can update own logos"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'chatbot-logos' AND auth.uid() = owner );

-- Allow users to delete their own logos
CREATE POLICY "Users can delete own logos"
ON storage.objects FOR DELETE
USING ( bucket_id = 'chatbot-logos' AND auth.uid() = owner );
