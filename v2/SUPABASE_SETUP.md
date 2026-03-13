# Setup Supabase para Modo Admin (V2)

## 1) Crear proyecto
- Crea un proyecto nuevo en Supabase.
- Copia:
  - `Project URL`
  - `anon public key`

## 2) Aplicar SQL
- Abre `SQL Editor`.
- Ejecuta completo:
  - `v2/supabase/schema.sql`

## 3) Crear usuario admin
- En `Authentication > Users`, crea usuario con email y clave.
- Copia el UUID del usuario.
- Ejecuta:

```sql
insert into public.profiles (user_id, role)
values ('UUID_DEL_USUARIO', 'admin');
```

## 4) Configurar frontend
- Edita `v2/supabase-config.js`:
  - `url`
  - `anonKey`

## 5) Verificar flujo
- Abre `v2/admin.html`.
- Inicia sesión y sube imagen o video.
- Revisa:
  - `v2/portafolio.html` (galería dinámica + filtros)
  - `v2/index.html` (top 3 dinámico en Resultados)

## 6) Reglas activas
- Orden público en Servicios:
  - `Manual`: `sort_order ASC, created_at DESC`
  - `Recientes`: `created_at DESC`
  - `Antiguos`: `created_at ASC`
- Borrado:
  - Normal: papelera (`is_deleted=true`)
  - Desde papelera: borrado permanente + borrado de storage
- Inicio:
  - `auto`: últimos 3
  - `manual`: destacados por `home_rank` (completa con recientes si faltan)

## 7) Seguridad recomendada
- No uses `service_role` en frontend.
- Mantener `anonKey` solo en cliente.
- Si publicas con hosting propio, agrega también cabeceras HTTP:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy` según necesidad
