# Reglas de Implementacion - SafeSpace (Earthquake Crack Triage PWA)
**RESPONDE SIEMPRE EN ESPANOL**

---

## 0. PROTOCOLO DE ARRANQUE (CRITICO)

**AL INICIAR CADA CONVERSACION:**
1. Leer SIEMPRE `REGLAS_IMPORTANTES.md` (este archivo)
2. Leer `.kiro/specs/earthquake-crack-triage-pwa/` para requirements, design y tasks
3. Solo despues proceder con la conversacion

**RAZON**: Evitar perder tiempo preguntando o sugiriendo cosas que ya estan establecidas o documentadas.

---

## 0b. Documentacion Viva (Regla de Sincronicidad)

**TODA VEZ que se realicen cambios estructurales en la arquitectura, componentes base, o diseno, es OBLIGATORIO:**
1. Mantener actualizado `REGLAS_IMPORTANTES.md` (este archivo).
2. Este documento debe reflejar inmediatamente la realidad del sistema. Nunca debe quedar obsoleto.

**REGLA DE ORO: NO ELIMINAR informacion tecnica que siga siendo valida o funcional. Solo se debe incluir la informacion que falta o se actualiza, manteniendo el historial y contexto previo.**

---

## 1. Reglas de Git

- **Auto-commit**: DESPUES de cada tarea significativa, hacer commit automaticamente con mensaje descriptivo (conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `chore:`, etc.)
- **Auto-push**: NO hacer push automatico. Hacer push solo cuando el codigo compila y tests pasan, o por autorizacion del usuario.
- **NO hacer deploy** sin autorizacion explicita del usuario.
- **NUNCA agregar Co-Authored-By** ni atribuciones de IA en los commits.

---

## 2. Gestion Segura de Dependencias (MANDATORIO)

**ALERTA DE SEGURIDAD:** Se han detectado multiples ataques de cadena de suministro (Supply Chain Attacks) masivos en el registro oficial de NPM. Estos ataques inyectan malware para robar credenciales, secretos de entorno (.env) y llaves SSH.

### 2.1 Prohibicion Absoluta de NPM
- **REGLA DE ORO**: Esta **ESTRICTAMENTE PROHIBIDO** ejecutar `npm install`, `npm update`, `npm run`, o cualquier comando `npm` en cualquier parte del proyecto (local, servidor o agentes).
- **Razon**: El cliente oficial de NPM es vulnerable a la ejecucion de scripts maliciosos en la fase de pre-instalacion.

### 2.2 Uso Obligatorio de PNPM
- Para toda gestion de paquetes, se debe usar unicamente **`pnpm`**.
- El lockfile `pnpm-lock.yaml` debe estar trackeado en git.
- **Comandos permitidos**:
  - `pnpm install`
  - `pnpm add [package]`
  - `pnpm add -D [package]` (dev dependencies)
  - `pnpm run [script]`
  - `pnpm build`
  - `pnpm test`
  - `pnpm dev` (desarrollo local)
- **Comandos PROHIBIDOS**:
  - `npm install` / `npm i`
  - `npm run`
  - `npm update`
  - `npx` (usar `pnpm dlx` en su lugar)

---

## 3. Arquitectura del Proyecto

### 3.1 Stack Tecnologico

| Capa | Tecnologia | Descripcion |
|------|-----------|-------------|
| Framework | Next.js 14+ (App Router) | SSR, Server Actions, Server Components |
| Estilos | Tailwind CSS | Utility-first CSS |
| Validacion | Zod | Schema validation en boundaries |
| Base de Datos | Supabase (PostgreSQL + RLS) | Backend-as-a-Service |
| Auth | Supabase Auth | Email/password + magic links |
| Storage | Supabase Storage | Imagenes y PDFs con politicas por usuario |
| Edge Functions | Supabase Edge Functions (Deno) | Generacion de reportes PDF |
| Cache Offline | IndexedDB (via `idb`) | Persistencia local offline-first |
| PWA | Serwist o next-pwa | Service Worker, manifest, cache strategies |
| AI Service | Adapter Pattern (Strategy) | BYOK (Anthropic / OpenAI / Gemini / MiniMax / OpenRouter con selección de modelos de visión) + Fallback (OpenRouter / NVIDIA NIM) |
| Testing | Vitest + fast-check | Unit tests + property-based testing |
| Lenguaje | TypeScript (estricto) | Todo el proyecto |

### 3.2 Estructura de Directorios (Monorepo Unico)

```
SafeSpace/
  src/
    app/              # Next.js App Router (pages, layouts, actions)
      (auth)/         # Rutas de autenticacion
      (protected)/    # Rutas protegidas (capture, reports, settings)
      actions/        # Server Actions
    components/       # Componentes React reutilizables
    hooks/            # Custom hooks (useCapture, useSync, etc.)
    lib/              # Logica de negocio y servicios
      ai/             # AI Service Adapter + proveedores
      capture/        # Photo Capture Module
      connectivity/   # Connectivity Monitor
      crypto/         # Encriptacion BYOK (Web Crypto API)
      db/             # Supabase clients + IndexedDB wrapper
      errors/         # Error formatting seguro
      exif/           # EXIF stripping
      sync/           # Sync Manager + cola
      validation/     # Zod schemas + sanitizacion
  supabase/
    migrations/       # SQL migrations (RLS, tablas, storage)
    functions/        # Edge Functions (generate-report)
  public/             # Assets estaticos (iconos PWA)
```

### 3.3 Principios Arquitectonicos

- **Offline-First**: La app funciona sin red. Captura, almacena local, sincroniza cuando hay conectividad.
- **Zero-Friction**: Acceso inmediato via enlace web, sin app stores.
- **Validez Legal**: Metadatos certificados (GPS, timestamp servidor, orientacion) para reportes inmutables.
- **Modularidad AI**: Adapter desacoplado; nuevos proveedores se agregan sin modificar codigo existente.
- **Privacy by Design**: EXIF stripped, PII excluida de payloads AI, RLS en toda tabla.

### 3.4 Restricciones Tecnicas

- **Imagenes**: Maximo 10 MB por captura
- **Cache local**: Maximo 50 items pendientes en IndexedDB
- **Sync**: Reintentos con backoff exponencial (1s, 2s, 4s), maximo 3 intentos por item
- **AI Timeout**: BYOK 60s, Fallback 15s por proveedor
- **Report Generation**: Maximo 30s
- **Timestamps**: ISO 8601 siempre
- **UUIDs**: v4 generados en cliente

---

## 4. Blindaje de Ingenieria & Programacion Defensiva

### 4.1 Programacion Defensiva (TypeScript)
- **Optional Chaining (?.)**: Obligatorio en accesos a datos de APIs externas, respuestas AI, datos de sensores.
- **Fallbacks de Renderizado**: Siempre proveer valores por defecto en datos de entrada.
- **Validacion Zod en boundaries**: Todo payload de Server Actions y respuestas AI se valida con Zod ANTES de procesarlo.
- **Null safety**: Usar tipos estrictos; nunca asumir que un valor existe sin verificar.

### 4.2 Programacion Defensiva (PWA/Browser)
- **Graceful degradation**: Si GPS, DeviceOrientation, o Web Crypto no estan disponibles, marcar como no disponible y continuar.
- **IndexedDB checks**: Verificar disponibilidad y cuota antes de escribir.
- **Service Worker**: Manejar estados de cache corruptos sin crashear la app.

### 4.3 Gestion de Secretos — PROHIBIDO Hardcodear
- **REGLA ABSOLUTA**: NUNCA se escriben credenciales, API keys, tokens, claves privadas literales en el codigo, scripts, documentacion o tests.
- Variables de entorno del servidor:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Claves fallback AI (OpenRouter, NVIDIA NIM)
- Claves BYOK del usuario: Encriptadas en `sessionStorage` via Web Crypto API, nunca tocan el backend.
- Si falta una variable critica en el entorno, el sistema debe FALLAR explicitamente en lugar de continuar con valores por defecto inseguros.
- Los valores reales viven SOLO en `.env` y `.env.local` (gitignoreados). En el repositorio se mantiene unicamente `.env.example` con placeholders.

### 4.4 Seguridad de la Aplicacion
- Row Level Security (RLS) en TODAS las tablas de Supabase
- Storage policies por usuario (folder `{user_id}/`)
- EXIF stripping antes de enviar imagenes a proveedores AI
- Errores seguros: nunca exponer stack traces, rutas, IDs internos
- Sanitizacion de filenames: solo `[a-zA-Z0-9\-_.]`, max 255 chars
- Truncado de metadata: max 1024 chars antes de persistir

---

## 5. Regla de Refactorizacion por Tamano de Archivo (CRITICO)

### 5.1 Umbral de 600 Lineas
- Cuando cualquier archivo de codigo (`.ts`, `.tsx`) supere las **600 lineas**, DEBE comenzar a refactorizarse en modulos mas pequenos.
- Sin excepciones.

### 5.2 Protocolo de Refactorizacion
Cuando un archivo supere las 600 lineas:
1. **Identificar modulos extractables:**
   - Funciones de utilidad (helpers, validators)
   - Interfaces/tipos TypeScript
   - Configuraciones estaticas
   - Componentes React hijos
2. **Crear archivos separados** bajo rutas semanticas.
3. **Mantener cohesion logica:** No dividir de forma aleatoria; extraer solo lo que tenga sentido semantico e independiente.

### 5.3 Deteccion de Codigo Muerto
Al trabajar en cualquier archivo, se debe:
1. Identificar funciones, imports, variables que no se esten utilizando.
2. Notificar al usuario antes de proceder con su eliminacion con el formato:
   ```
   [CODIGO MUERTO DETECTADO]
   Archivo: X
   Lineas: Y-Z
   Tipo: [funcion/variable/import]
   Razon: [por que es codigo muerto]
   Recomendacion: [borrar/archivar]
   ```

---

## 6. Regla Anti-Duplicacion de Codigo (OBLIGATORIO)

- **Verificacion Obligatoria ANTES de Crear:**
  - ANTES de crear cualquier funcion, clase, modulo o servicio, buscar por nombre o funcionalidad similar en el codebase.
  - Si ya existe codigo identico o similar, reutilizarlo o unificarlo. No crear duplicados innecesarios.
  - Si la nueva implementacion es indudablemente mejor, reemplazar la anterior por completo y actualizar sus referencias.

---

## 7. Testing

### 7.1 Property-Based Testing (fast-check)
- Tests de propiedades para invariantes universales de correctitud
- 19 propiedades definidas en el documento de diseno
- Verifican comportamientos que deben ser verdaderos para CUALQUIER input valido
- Ejecutar con: `pnpm test`

### 7.2 Unit Tests (Vitest)
- Tests unitarios para edge cases y ejemplos especificos
- Mocking de APIs del navegador (Geolocation, DeviceOrientation, etc.)
- Tests de integracion para flujos end-to-end

### 7.3 Validacion Pre-Merge
```bash
pnpm build && pnpm test
```
Ambos deben pasar antes de declarar cualquier tarea como completada.

---

## 8. Convencion de Commits

Formato: `tipo(scope): descripcion breve en espanol`

Scopes validos:
- `pwa` — configuracion PWA, service worker, manifest
- `capture` — modulo de captura de fotos y metadatos
- `ai` — AI service adapter, proveedores BYOK/fallback
- `sync` — sync manager, connectivity monitor, cola offline
- `auth` — autenticacion, middleware, login/registro
- `db` — migraciones SQL, RLS, esquema PostgreSQL
- `storage` — Supabase Storage, buckets, politicas
- `report` — generacion de reportes PDF, edge functions
- `ui` — componentes React, paginas, layouts
- `validation` — schemas Zod, sanitizacion
- `privacy` — EXIF stripping, encriptacion BYOK
- `docs` — documentacion, specs
- `infra` — configuracion, CI, entorno

Ejemplos:
```
feat(capture): implementar lectura GPS con validacion de precision
fix(sync): manejar timeout en reintento de sincronizacion
feat(ai): agregar proveedor OpenRouter como fallback
docs: actualizar REGLAS_IMPORTANTES.md con nuevo stack
chore(infra): configurar Vitest con soporte TypeScript
refactor(validation): extraer schemas Zod a modulo separado
```

---

## 9. Reglas de Estilo y Presentacion

- **PROHIBIDO usar emojis** en cualquier interfaz, componente, documento, README, commits o comunicacion de este proyecto.
- Usar iconos SVG o Lucide React cuando se necesiten indicadores visuales en la UI.
- Los READMEs y documentos usan texto plano, listas y tablas. Sin emojis decorativos.

---

## 10. Dependencias Pinneadas (Seguridad)

- Al agregar cualquier dependencia con `pnpm add`, usar **versiones exactas** (no rangos):
  - CORRECTO: `pnpm add zod@3.23.8`
  - INCORRECTO: `pnpm add zod` (instala latest, potencialmente inseguro)
- Si no se conoce la version exacta, verificar en el registro oficial y usar la ultima estable.
- El lockfile `pnpm-lock.yaml` debe quedar trackeado en git.
- Preferir paquetes well-known y activamente mantenidos. Si un nombre de paquete parece sospechoso o podria ser typosquatting, reportar al usuario antes de instalar.

---

## 11. Validacion Pre-Push (MANDATORIO)

Antes de hacer `git push` o antes de declarar una tarea como completada:

```bash
pnpm build && pnpm test
```

Si hay errores de compilacion o tests fallidos, corregir ANTES de continuar con la siguiente tarea.

---

## 12. Regla de Idioma (CRITICO)

**Regla general: TODO en espanol, EXCEPTO el codigo fuente.**

| Elemento | Idioma | Ejemplo |
|----------|--------|---------|
| Variables, funciones, clases, interfaces | Ingles | `captureService`, `riskLevel`, `syncManager` |
| Keywords del lenguaje | Ingles (obligatorio por TypeScript) | `const`, `function`, `interface` |
| Comentarios en codigo | Espanol | `// Calcula el hash de integridad del PDF` |
| Commits | Espanol | `feat(capture): implementar lectura GPS` |
| Documentacion (README, specs) | Espanol | — |
| UI copy en la app | Espanol | "Capturar Foto", "Generar Reporte", "Sin conexion" |
| Comunicacion con el usuario | Espanol | — |
| Nombres de archivos/directorios | Ingles | `src/lib/capture/`, `syncManager.ts` |
| Mensajes de error al usuario final | Espanol | "No se pudo obtener la ubicacion" |

---

## 13. Entorno de Desarrollo

- **OS**: Windows
- **Shell**: cmd / PowerShell
- **Node.js**: v18+ requerido
- **pnpm**: gestor de paquetes obligatorio
- **Git**: control de versiones
- **Supabase CLI**: para migraciones locales y edge functions
- **Sin CI/CD** por ahora (herramienta de emergencia, velocidad > procesos)

---

## 14. Reglas Especificas de Next.js

- **App Router**: Usar exclusivamente App Router (NO Pages Router)
- **Server Components** por defecto; `'use client'` solo cuando sea necesario (interactividad, hooks de browser)
- **Server Actions** para mutaciones; nunca API routes cuando un Server Action es suficiente
- **Layouts**: Usar layouts anidados para compartir UI entre rutas
- **Metadata**: Exportar metadata estatica o generateMetadata en cada page
- **Loading states**: Usar `loading.tsx` y Suspense para UX durante carga
- **Error boundaries**: Usar `error.tsx` en cada segmento de ruta critico

---

## 15. Reglas Especificas de Supabase

- **Migraciones**: Todo cambio de schema va en `supabase/migrations/` con prefijo numerico secuencial
- **RLS**: TODA tabla debe tener RLS habilitado. No hay excepciones.
- **Service Role**: Solo en Server Actions y Edge Functions, NUNCA en el cliente
- **Storage Policies**: Todo bucket es privado; acceso via policies por `auth.uid()`
- **Edge Functions**: Deno runtime; usar para operaciones que requieren confianza del servidor (reportes)

---

**Ultima actualizacion:** 2026-08-18 - SafeSpace / Earthquake Crack Triage PWA / Next.js + Supabase + pnpm
