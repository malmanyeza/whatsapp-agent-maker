-- Add products for Nash Paints
-- This script assumes a chatbot with company_name 'Nash Paints' exists. 
-- If not, it picks the most recently created chatbot.

DO $$
DECLARE
  target_chatbot_id uuid;
BEGIN
  -- specific lookup or fallback to latest
  SELECT id INTO target_chatbot_id 
  FROM public.chatbots 
  WHERE company_name ILIKE '%Nash Paints%' 
  LIMIT 1;

  -- Fallback if no exact match
  IF target_chatbot_id IS NULL THEN
    SELECT id INTO target_chatbot_id FROM public.chatbots ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF target_chatbot_id IS NOT NULL THEN
    INSERT INTO public.products (chatbot_id, name, unit_price, currency) VALUES
    (target_chatbot_id, 'MZ Spray Gun', 35.15, 'USD'),
    (target_chatbot_id, 'Sanding Block', 13.00, 'USD'),
    (target_chatbot_id, 'Sandpaper for wood PS33s', 0.50, 'USD'),
    (target_chatbot_id, 'Hook-it', 0.50, 'USD'),
    (target_chatbot_id, 'Grinding Discs', 3.01, 'USD'),
    (target_chatbot_id, '2K Black', 50.22, 'USD'),
    (target_chatbot_id, '2K Fast Hardener', 35.16, 'USD'),
    (target_chatbot_id, '2K Thinners', 15.07, 'USD'),
    (target_chatbot_id, 'Lacquer thinners', 9.00, 'USD'),
    (target_chatbot_id, 'Local Bodyfiller', 4.00, 'USD'),
    (target_chatbot_id, 'Undercoat', 30.00, 'USD');
  ELSE
    RAISE NOTICE 'No chatbot found to associate products with.';
  END IF;
END $$;
