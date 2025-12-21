
-- Create products table
create table public.products (
  id uuid not null default gen_random_uuid (),
  chatbot_id uuid not null references public.chatbots (id) on delete cascade,
  name text not null,
  description text null,
  unit_price numeric not null default 0,
  currency text not null default 'USD',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint products_pkey primary key (id)
);

-- Enable RLS for products
alter table public.products enable row level security;

create policy "Enable read access for all users"
  on public.products for select
  using (true);

create policy "Enable insert for authenticated users only"
  on public.products for insert
  with check (auth.role() = 'authenticated');
  
create policy "Enable update for authenticated users only"
    on public.products for update
    using (auth.role() = 'authenticated');
    
create policy "Enable delete for authenticated users only"
    on public.products for delete
    using (auth.role() = 'authenticated');


-- Create quotes table
create table public.quotes (
  id uuid not null default gen_random_uuid (),
  chatbot_id uuid not null references public.chatbots (id) on delete cascade,
  customer_name text null,
  customer_phone text null,
  total_amount numeric not null default 0,
  pdf_url text null,
  items jsonb default '[]'::jsonb, -- Store the line items snapshot
  created_at timestamp with time zone not null default now(),
  constraint quotes_pkey primary key (id)
);

-- Enable RLS for quotes
alter table public.quotes enable row level security;

create policy "Enable read access for all users"
  on public.quotes for select
  using (true);
  
create policy "Enable insert for all users" -- Needed for the public webhook (server) to write
    on public.quotes for insert
    with check (true);

-- Update chatbots table
alter table public.chatbots add column if not exists company_logo_url text;
alter table public.chatbots add column if not exists currency_symbol text default '$';

-- Create Storage bucket for quotes if not exists (handled via API/Dashboard typically, but can try SQL hack or just instruct)
insert into storage.buckets (id, name, public)
values ('quotes', 'quotes', true)
on conflict (id) do nothing;

-- Storage Policy
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'quotes' );

create policy "Service Role Write"
  on storage.objects for insert
  with check ( bucket_id = 'quotes' );
