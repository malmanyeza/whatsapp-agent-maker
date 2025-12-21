-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

-- Create chatbots table
CREATE TABLE public.chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Company Info
  company_name TEXT NOT NULL,
  company_description TEXT NOT NULL,
  services_offered TEXT NOT NULL,
  
  -- WhatsApp Credentials (encrypted at rest by Supabase)
  whatsapp_phone_number_id TEXT NOT NULL,
  meta_app_id TEXT NOT NULL,
  meta_app_secret TEXT NOT NULL,
  access_token TEXT NOT NULL,
  
  -- OpenAI Configuration
  openai_api_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  
  -- Agent Configuration
  system_instructions TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'professional',
  allowed_actions JSONB NOT NULL DEFAULT '{"answerQuestions": true, "generateQuotations": false, "collectLeads": true}'::jsonb,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('connected', 'disconnected', 'pending')),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on chatbots
ALTER TABLE public.chatbots ENABLE ROW LEVEL SECURITY;

-- Chatbots policies - users can only manage their own chatbots
CREATE POLICY "Users can view their own chatbots"
ON public.chatbots FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chatbots"
ON public.chatbots FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chatbots"
ON public.chatbots FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chatbots"
ON public.chatbots FOR DELETE
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chatbots_updated_at
BEFORE UPDATE ON public.chatbots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();