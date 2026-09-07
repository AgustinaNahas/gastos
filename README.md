# Gastos

App personal para importar resúmenes de Patagonia, Galicia y Mercado Pago, categorizar movimientos y llevar gastos compartidos.

Los datos **ya no viven en el navegador**. Se guardan en tu proyecto de [Supabase](https://supabase.com): si limpiás el sitio, cambiás de Chrome a Firefox o publicás en GitHub Pages, al entrar con la misma cuenta vas a ver lo mismo.

La sesión (JWT) sí se guarda en `localStorage`. Si se borra, solo tenés que volver a iniciar sesión: los gastos siguen en la nube.

## Requisitos

- Node 20 o 22 (`nvm use 22`)
- Una cuenta en [supabase.com](https://supabase.com)

## 1. Crear el proyecto en Supabase

1. Entrá a [https://supabase.com/dashboard](https://supabase.com/dashboard) y creá una organización si no tenés.
2. **New project**:
   - Nombre: el que quieras (`gastos` está bien).
   - Contraseña de la base: generá una fuerte y **guardala**. No se usa en esta app, pero la vas a necesitar si algún día abrís la base a mano.
   - Región: la más cerca (por ejemplo `South America (São Paulo)`).
3. Esperá a que el proyecto termine de provisionarse.

## 2. Crear las tablas

1. En el menú del proyecto: **SQL Editor** → **New query**.
2. Pegá **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql).
3. **Run**.

Eso crea `expenses` y `user_settings`, activa Row Level Security y deja políticas para que cada usuario autenticado solo vea y edite **sus** filas. La app usa la clave pública (`anon` / publishable): sin login no hay acceso a los datos.

## 3. Auth (email y contraseña)

Es una app personal: conviene poder entrar apenas te registrás, sin confirmar el correo.

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Dejá Email habilitado.
3. Desactivá **Confirm email** (a veces aparece como “Confirm email” / `Enable email confirmations`).
4. **Authentication** → **URL Configuration**:
   - **Site URL:** `https://agustinanahas.github.io/gastos`
   - **Redirect URLs**, agregá:
     - `http://localhost:5173/gastos`
     - `http://localhost:5173/gastos/**`
     - `https://agustinanahas.github.io/gastos`
     - `https://agustinanahas.github.io/gastos/**`

Si el repo o el dominio de GitHub Pages es otro, cambiá esas URLs.

## 4. Copiar las claves a `.env`

1. **Project Settings** → **API Keys** (o **Settings** → **API** en el dashboard viejo).
2. Copiá:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable** key. Si tu proyecto todavía muestra la clave JWT **anon**, usá esa.

En la raíz del repo:

```bash
cp .env.example .env
```

Completá:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Si solo tenés la anon JWT:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Nunca** pongas la clave `service_role` / secret en `.env` ni en GitHub. Esa clave saltea RLS.

`.env` no se commitea.

## 5. Correr en local

```bash
nvm use 22
npm install
npm run dev
```

Abrí [http://localhost:5173/gastos/](http://localhost:5173/gastos/).

Vite solo lee `.env` al arrancar: si cambiás las claves, cortá el servidor y volvé a `npm run dev`.

Creá una cuenta (email + contraseña) y listo. La primera vez que entres en un navegador que ya tenía gastos viejos, la app los **migra sola** desde IndexedDB / `localStorage` a tu usuario.

## 6. GitHub Pages

El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) inyecta las mismas variables en el build.

En el repo de GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | La Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | La publishable (o la anon JWT) |

Si usás la anon JWT en vez de publishable, el workflow también acepta el secret `VITE_SUPABASE_ANON_KEY` como respaldo.

Después de guardar los secrets, corré de nuevo el workflow (**Actions** → *Deploy to GitHub Pages* → *Run workflow*) o pusheá a `main`.

En Supabase, el **Site URL** tiene que coincidir con la URL pública (`https://agustinanahas.github.io/gastos`).

## Qué se guarda dónde

| Dato | Dónde |
| --- | --- |
| Movimientos, categorías, reglas, columnas visibles | Tablas `expenses` y `user_settings` (por usuario) |
| Sesión de login | `localStorage` (`gastos-auth`) |
| Pestaña activa / detalle de gráficos | `sessionStorage` (solo esa pestaña) |
| Copia local de settings | `localStorage` (caché; la fuente de verdad es Supabase) |

Si “se te borra todo” al cambiar de origen (`localhost` vs GitHub Pages) o al limpiar datos del sitio, es el navegador. Con Supabase, volvés a entrar y los gastos siguen ahí.
