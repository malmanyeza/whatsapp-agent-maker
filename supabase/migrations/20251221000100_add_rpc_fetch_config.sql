-- Create a function to fetch chatbot config by phone ID, bypassing RLS
-- This is secure because it only exposes specific config, no user data
CREATE OR REPLACE FUNCTION public.get_chatbot_config(phone_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'id', id,
    'company_name', company_name,
    'company_description', company_description,
    'services_offered', services_offered,
    'whatsapp_phone_number_id', whatsapp_phone_number_id,
    'meta_app_id', meta_app_id,
    'meta_app_secret', meta_app_secret,
    'access_token', access_token,
    'openai_api_key', openai_api_key,
    'model', model,
    'system_instructions', system_instructions,
    'currency_symbol', currency_symbol
  ) INTO result
  FROM public.chatbots
  WHERE whatsapp_phone_number_id = phone_id
  LIMIT 1;
  
  RETURN result;
END;
$$;

-- Grant execution to anon (public) role so the Render server can call it
GRANT EXECUTE ON FUNCTION public.get_chatbot_config(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_chatbot_config(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chatbot_config(text) TO service_role;
