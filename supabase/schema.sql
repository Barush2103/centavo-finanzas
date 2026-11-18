-- =========================================================
-- Finanzas familiares — esquema (todas las tablas con prefijo centavo_ (app Centavo))
-- =========================================================

-- ---------- Perfiles ----------
create table if not exists public.centavo_perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text not null,
  created_at timestamptz not null default now()
);

-- ---------- Contactos (familia con quien compartes) ----------
create table if not exists public.centavo_contactos (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contacto_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contacto_id),
  check (user_id <> contacto_id)
);

-- ---------- Cuentas (efectivo, débito, ahorro, inversión, tarjeta de crédito) ----------
create table if not exists public.centavo_cuentas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('efectivo','debito','ahorro','inversion','credito')),
  saldo_inicial numeric(14,2) not null default 0,
  limite_credito numeric(14,2),
  dia_corte smallint check (dia_corte between 1 and 31),
  dia_pago smallint check (dia_pago between 1 and 31),
  color text not null default '#10b981',
  archivada boolean not null default false,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists centavo_cuentas_user_idx on public.centavo_cuentas(user_id);

-- ---------- Categorías ----------
create table if not exists public.centavo_categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('ingreso','gasto')),
  icono text not null default '•',
  color text not null default '#64748b',
  orden int not null default 0,
  archivada boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists centavo_categorias_user_idx on public.centavo_categorias(user_id);

-- ---------- Préstamos y créditos ----------
create table if not exists public.centavo_prestamos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direccion text not null check (direccion in ('debo','me_deben')),
  contraparte_nombre text not null,
  contraparte_id uuid references auth.users(id) on delete set null,
  tipo text not null default 'personal' check (tipo in ('personal','credito')),
  monto numeric(14,2) not null check (monto > 0),
  tasa_anual numeric(8,4) not null default 0 check (tasa_anual >= 0),
  plazo int check (plazo is null or plazo > 0),
  frecuencia text not null default 'mensual' check (frecuencia in ('semanal','quincenal','mensual')),
  fecha_inicio date not null default current_date,
  nota text,
  cerrado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists centavo_prestamos_user_idx on public.centavo_prestamos(user_id);
create index if not exists centavo_prestamos_contra_idx on public.centavo_prestamos(contraparte_id);

create table if not exists public.centavo_abonos (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references public.centavo_prestamos(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null default current_date,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists centavo_abonos_prestamo_idx on public.centavo_abonos(prestamo_id);

-- ---------- Gastos compartidos ----------
create table if not exists public.centavo_compartidos (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pagado_por uuid not null references auth.users(id) on delete cascade,
  descripcion text not null,
  monto_total numeric(14,2) not null check (monto_total > 0),
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.centavo_compartidos_partes (
  id uuid primary key default gen_random_uuid(),
  compartido_id uuid not null references public.centavo_compartidos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  monto numeric(14,2) not null check (monto >= 0),
  liquidado boolean not null default false,
  unique (compartido_id, user_id)
);
create index if not exists centavo_partes_comp_idx on public.centavo_compartidos_partes(compartido_id);
create index if not exists centavo_partes_user_idx on public.centavo_compartidos_partes(user_id);

-- ---------- Movimientos ----------
create table if not exists public.centavo_movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso','gasto','transferencia')),
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null default current_date,
  cuenta_id uuid not null references public.centavo_cuentas(id) on delete cascade,
  cuenta_destino_id uuid references public.centavo_cuentas(id) on delete cascade,
  categoria_id uuid references public.centavo_categorias(id) on delete set null,
  nota text,
  msi_meses smallint check (msi_meses is null or msi_meses between 2 and 48),
  prestamo_id uuid references public.centavo_prestamos(id) on delete set null,
  abono_id uuid references public.centavo_abonos(id) on delete cascade,
  compartido_id uuid references public.centavo_compartidos(id) on delete set null,
  created_at timestamptz not null default now(),
  check (tipo <> 'transferencia' or (cuenta_destino_id is not null and cuenta_destino_id <> cuenta_id))
);
create index if not exists centavo_mov_user_fecha_idx on public.centavo_movimientos(user_id, fecha desc);
create index if not exists centavo_mov_cuenta_idx on public.centavo_movimientos(cuenta_id);

-- ---------- Presupuestos (mensual por categoría) ----------
create table if not exists public.centavo_presupuestos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria_id uuid not null references public.centavo_categorias(id) on delete cascade,
  monto numeric(14,2) not null check (monto >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, categoria_id)
);

-- =========================================================
-- Funciones auxiliares (security definer, evitan recursión de RLS)
-- =========================================================
create or replace function public.centavo_es_contacto(otro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.centavo_contactos c
    where (c.user_id = auth.uid() and c.contacto_id = otro)
       or (c.contacto_id = auth.uid() and c.user_id = otro)
  );
$$;

create or replace function public.centavo_puede_ver_compartido(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.centavo_compartidos g
    where g.id = cid and (g.creado_por = auth.uid() or g.pagado_por = auth.uid()
      or exists (select 1 from public.centavo_compartidos_partes p where p.compartido_id = g.id and p.user_id = auth.uid()))
  );
$$;

create or replace function public.centavo_es_creador_compartido(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.centavo_compartidos g where g.id = cid and g.creado_por = auth.uid());
$$;

create or replace function public.centavo_es_pagador_compartido(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.centavo_compartidos g where g.id = cid and g.pagado_por = auth.uid());
$$;

create or replace function public.centavo_puede_ver_prestamo(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.centavo_prestamos p
    where p.id = pid and (p.user_id = auth.uid() or p.contraparte_id = auth.uid())
  );
$$;

create or replace function public.centavo_cuenta_propia(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cid is null or exists (select 1 from public.centavo_cuentas c where c.id = cid and c.user_id = auth.uid());
$$;

create or replace function public.centavo_categoria_propia(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cid is null or exists (select 1 from public.centavo_categorias c where c.id = cid and c.user_id = auth.uid());
$$;

-- Buscar a un familiar por correo exacto para agregarlo como contacto
create or replace function public.centavo_agregar_contacto(correo text)
returns table (id uuid, nombre text, email text)
language plpgsql security definer set search_path = public as $$
declare
  encontrado uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select p.id into encontrado from public.centavo_perfiles p where lower(p.email) = lower(trim(correo));
  if encontrado is null then raise exception 'No hay ningún usuario con ese correo. Pídele que se registre primero.'; end if;
  if encontrado = auth.uid() then raise exception 'Ese es tu propio correo.'; end if;
  insert into public.centavo_contactos(user_id, contacto_id) values (auth.uid(), encontrado) on conflict do nothing;
  insert into public.centavo_contactos(user_id, contacto_id) values (encontrado, auth.uid()) on conflict do nothing;
  return query select p.id, p.nombre, p.email from public.centavo_perfiles p where p.id = encontrado;
end;
$$;

-- Crear un gasto compartido con sus partes en una sola operación
create or replace function public.centavo_crear_compartido(
  p_descripcion text, p_monto numeric, p_fecha date, p_pagado_por uuid, p_partes jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nuevo uuid;
  parte jsonb;
  uid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_pagado_por <> auth.uid() and not public.centavo_es_contacto(p_pagado_por) then
    raise exception 'Quien pagó debe ser tú o uno de tus contactos';
  end if;
  insert into public.centavo_compartidos(creado_por, pagado_por, descripcion, monto_total, fecha)
  values (auth.uid(), p_pagado_por, p_descripcion, p_monto, coalesce(p_fecha, current_date))
  returning id into nuevo;
  for parte in select * from jsonb_array_elements(p_partes) loop
    uid := (parte->>'user_id')::uuid;
    if uid <> auth.uid() and not public.centavo_es_contacto(uid) then
      raise exception 'Solo puedes dividir con tus contactos';
    end if;
    insert into public.centavo_compartidos_partes(compartido_id, user_id, monto, liquidado)
    values (nuevo, uid, (parte->>'monto')::numeric, uid = p_pagado_por);
  end loop;
  return nuevo;
end;
$$;

revoke execute on function public.centavo_agregar_contacto(text) from public, anon;
revoke execute on function public.centavo_crear_compartido(text, numeric, date, uuid, jsonb) from public, anon;
grant execute on function public.centavo_agregar_contacto(text) to authenticated;
grant execute on function public.centavo_crear_compartido(text, numeric, date, uuid, jsonb) to authenticated;

-- =========================================================
-- Alta automática de perfil + categorías base
-- =========================================================
create or replace function public.centavo_sembrar(u uuid, correo text, nom text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.centavo_perfiles where id = u) then return; end if;
  insert into public.centavo_perfiles(id, nombre, email) values (u, coalesce(nullif(nom, ''), split_part(correo, '@', 1)), correo);

  insert into public.centavo_categorias(user_id, nombre, tipo, icono, color, orden) values
    (u, 'Comida',          'gasto', '🍔', '#f97316', 1),
    (u, 'Súper',           'gasto', '🛒', '#22c55e', 2),
    (u, 'Transporte',      'gasto', '🚌', '#3b82f6', 3),
    (u, 'Gasolina',        'gasto', '⛽', '#0ea5e9', 4),
    (u, 'Casa',            'gasto', '🏠', '#a855f7', 5),
    (u, 'Servicios',       'gasto', '💡', '#eab308', 6),
    (u, 'Salud',           'gasto', '💊', '#ef4444', 7),
    (u, 'Entretenimiento', 'gasto', '🎬', '#ec4899', 8),
    (u, 'Ropa',            'gasto', '👕', '#14b8a6', 9),
    (u, 'Educación',       'gasto', '📚', '#6366f1', 10),
    (u, 'Suscripciones',   'gasto', '📱', '#8b5cf6', 11),
    (u, 'Regalos',         'gasto', '🎁', '#f43f5e', 12),
    (u, 'Mascotas',        'gasto', '🐶', '#d97706', 13),
    (u, 'Otros gastos',    'gasto', '📦', '#64748b', 14),
    (u, 'Sueldo',          'ingreso', '💼', '#10b981', 1),
    (u, 'Negocio',         'ingreso', '🏪', '#059669', 2),
    (u, 'Ventas',          'ingreso', '🏷️', '#0d9488', 3),
    (u, 'Intereses',       'ingreso', '📈', '#0891b2', 4),
    (u, 'Regalo recibido', 'ingreso', '🎉', '#d946ef', 5),
    (u, 'Otros ingresos',  'ingreso', '💰', '#64748b', 6);

  insert into public.centavo_cuentas(user_id, nombre, tipo, color, orden)
  values (u, 'Efectivo', 'efectivo', '#10b981', 0);
end;
$$;

create or replace function public.centavo_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.centavo_sembrar(new.id, new.email, new.raw_user_meta_data->>'nombre');
  return new;
end;
$$;

revoke execute on function public.centavo_sembrar(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.centavo_nuevo_usuario() from public, anon, authenticated;

create trigger centavo_on_auth_user_created
  after insert on auth.users
  for each row execute function public.centavo_nuevo_usuario();

-- =========================================================
-- RLS
-- =========================================================
alter table public.centavo_perfiles enable row level security;
alter table public.centavo_contactos enable row level security;
alter table public.centavo_cuentas enable row level security;
alter table public.centavo_categorias enable row level security;
alter table public.centavo_movimientos enable row level security;
alter table public.centavo_presupuestos enable row level security;
alter table public.centavo_prestamos enable row level security;
alter table public.centavo_abonos enable row level security;
alter table public.centavo_compartidos enable row level security;
alter table public.centavo_compartidos_partes enable row level security;

-- Perfiles: el tuyo y el de tus contactos
create policy centavo_perfiles_sel on public.centavo_perfiles for select to authenticated
  using (id = (select auth.uid()) or public.centavo_es_contacto(id));
create policy centavo_perfiles_upd on public.centavo_perfiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Contactos
create policy centavo_contactos_sel on public.centavo_contactos for select to authenticated
  using (user_id = (select auth.uid()) or contacto_id = (select auth.uid()));
create policy centavo_contactos_del on public.centavo_contactos for delete to authenticated
  using (user_id = (select auth.uid()));

-- Tablas privadas del usuario
create policy centavo_cuentas_all on public.centavo_cuentas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy centavo_categorias_all on public.centavo_categorias for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy centavo_presupuestos_all on public.centavo_presupuestos for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.centavo_categoria_propia(categoria_id));
create policy centavo_movimientos_all on public.centavo_movimientos for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.centavo_cuenta_propia(cuenta_id)
    and public.centavo_cuenta_propia(cuenta_destino_id)
    and public.centavo_categoria_propia(categoria_id)
  );

-- Préstamos: los ves si los creaste o si eres la contraparte
create policy centavo_prestamos_sel on public.centavo_prestamos for select to authenticated
  using (user_id = (select auth.uid()) or contraparte_id = (select auth.uid()));
create policy centavo_prestamos_ins on public.centavo_prestamos for insert to authenticated
  with check (user_id = (select auth.uid()) and (contraparte_id is null or public.centavo_es_contacto(contraparte_id)));
create policy centavo_prestamos_upd on public.centavo_prestamos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (contraparte_id is null or public.centavo_es_contacto(contraparte_id)));
create policy centavo_prestamos_del on public.centavo_prestamos for delete to authenticated
  using (user_id = (select auth.uid()));

-- Abonos: cualquiera de las dos partes puede ver y registrar; solo quien lo registró lo borra
create policy centavo_abonos_sel on public.centavo_abonos for select to authenticated
  using (public.centavo_puede_ver_prestamo(prestamo_id));
create policy centavo_abonos_ins on public.centavo_abonos for insert to authenticated
  with check (user_id = (select auth.uid()) and public.centavo_puede_ver_prestamo(prestamo_id));
create policy centavo_abonos_del on public.centavo_abonos for delete to authenticated
  using (user_id = (select auth.uid()));

-- Compartidos
create policy centavo_compartidos_sel on public.centavo_compartidos for select to authenticated
  using (public.centavo_puede_ver_compartido(id));
create policy centavo_compartidos_del on public.centavo_compartidos for delete to authenticated
  using (creado_por = (select auth.uid()));

create policy centavo_partes_sel on public.centavo_compartidos_partes for select to authenticated
  using (public.centavo_puede_ver_compartido(compartido_id));
-- Solo quien pagó (el acreedor) marca las partes como liquidadas
create policy centavo_partes_upd on public.centavo_compartidos_partes for update to authenticated
  using (public.centavo_es_pagador_compartido(compartido_id))
  with check (public.centavo_es_pagador_compartido(compartido_id));

-- Usuarios que ya existían en el proyecto
select public.centavo_sembrar(u.id, u.email, u.raw_user_meta_data->>'nombre')
from auth.users u where u.email is not null and not exists (select 1 from public.centavo_perfiles p where p.id = u.id);
