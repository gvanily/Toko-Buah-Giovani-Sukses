create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  sku text unique,
  unit text not null default 'kg',
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(14, 2) not null default 0 check (selling_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  type text not null check (type in ('masuk', 'keluar', 'penyesuaian', 'retur')),
  quantity integer not null check (quantity > 0),
  note text,
  created_at timestamptz not null default now()
);

alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements add constraint stock_movements_type_check check (type in ('masuk', 'keluar', 'penyesuaian', 'retur'));

create table if not exists public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  total numeric(14, 2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('Cash', 'Transfer', 'QRIS')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_supplier_id_idx on public.products(supplier_id);
create index if not exists stock_movements_product_created_idx on public.stock_movements(product_id, created_at desc);
create index if not exists sales_transactions_created_idx on public.sales_transactions(created_at desc);

create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_type text,
  p_quantity integer,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_stock integer;
  movement_id uuid;
begin
  if p_type not in ('masuk', 'keluar', 'penyesuaian', 'retur') or p_quantity is null or p_quantity < 1 then
    raise exception 'Jenis mutasi atau jumlah tidak valid.' using errcode = '22023';
  end if;
  select stock into current_stock from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan.' using errcode = 'P0002';
  end if;
  if p_type in ('keluar', 'penyesuaian') and current_stock < p_quantity then
    raise exception 'Stok tidak mencukupi.' using errcode = '23514';
  end if;
  update public.products
  set stock = current_stock + case when p_type in ('masuk', 'retur') then p_quantity else -p_quantity end,
      updated_at = now()
  where id = p_product_id;
  insert into public.stock_movements (product_id, type, quantity, note)
  values (p_product_id, p_type, p_quantity, nullif(trim(p_note), ''))
  returning id into movement_id;
  return movement_id;
end;
$$;

create or replace function public.record_sale(
  p_product_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_payment_method text,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_stock integer;
  transaction_id uuid;
  movement_note text;
begin
  if p_quantity is null or p_quantity < 1 or p_unit_price is null or p_unit_price < 0
    or p_payment_method not in ('Cash', 'Transfer', 'QRIS') then
    raise exception 'Data transaksi tidak valid.' using errcode = '22023';
  end if;
  select stock into current_stock from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan.' using errcode = 'P0002';
  end if;
  if current_stock < p_quantity then
    raise exception 'Stok tidak mencukupi.' using errcode = '23514';
  end if;
  insert into public.sales_transactions (product_id, quantity, unit_price, total, payment_method, note)
  values (p_product_id, p_quantity, p_unit_price, round(p_unit_price * p_quantity, 2), p_payment_method, nullif(trim(p_note), ''))
  returning id into transaction_id;
  update public.products
  set stock = current_stock - p_quantity, updated_at = now()
  where id = p_product_id;
  movement_note := 'Penjualan ' || left(transaction_id::text, 8);
  if nullif(trim(p_note), '') is not null then
    movement_note := movement_note || ' · ' || trim(p_note);
  end if;
  insert into public.stock_movements (product_id, type, quantity, note)
  values (p_product_id, 'keluar', p_quantity, movement_note);
  return transaction_id;
end;
$$;

alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales_transactions enable row level security;

drop policy if exists "public access categories" on public.categories;
create policy "public access categories" on public.categories for all to anon, authenticated using (true) with check (true);
drop policy if exists "public access suppliers" on public.suppliers;
create policy "public access suppliers" on public.suppliers for all to anon, authenticated using (true) with check (true);
drop policy if exists "public access products" on public.products;
create policy "public access products" on public.products for all to anon, authenticated using (true) with check (true);
drop policy if exists "public access stock movements" on public.stock_movements;
create policy "public access stock movements" on public.stock_movements for all to anon, authenticated using (true) with check (true);
drop policy if exists "public access sales transactions" on public.sales_transactions;
create policy "public access sales transactions" on public.sales_transactions for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.categories, public.suppliers, public.products, public.stock_movements, public.sales_transactions to anon, authenticated;
grant execute on function public.record_stock_movement(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.record_sale(uuid, integer, numeric, text, text) to anon, authenticated;

insert into public.categories (name) values ('Buah tropis'), ('Buah impor'), ('Buah lokal'), ('Buah potong')
on conflict (name) do nothing;
insert into public.suppliers (name, phone, address)
select 'Pemasok Utama', null, null
where not exists (select 1 from public.suppliers where name = 'Pemasok Utama');