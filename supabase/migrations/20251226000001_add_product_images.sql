-- Add image_url column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create product-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Public Read Access
CREATE POLICY "Public Access for Product Images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Storage Policy: Authenticated Upload
CREATE POLICY "Authenticated Upload for Product Images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Storage Policy: Authenticated Update
CREATE POLICY "Authenticated Update for Product Images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Storage Policy: Authenticated Delete
CREATE POLICY "Authenticated Delete for Product Images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
