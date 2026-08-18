# Documento de Diseño — SafeSpace

## 1. Visión General de Arquitectura

SafeSpace implementa una arquitectura **offline-first con sincronización eventual** usando Next.js App Router como capa de presentación y Supabase como Backend-as-a-Service completo.

### Principios de Diseño

1. **Offline-first**: El sistema funciona completamente sin red. La sincronización es un bonus, no un requisito.
2. **Zero trust en AI**: Toda respuesta de AI se valida con Zod schema antes de aceptarse. Respuestas inválidas se rechazan.
3. **Privacidad por diseño**: EXIF se elimina antes de enviar a AI. GPS nunca sale en payloads a proveedores. Claves BYOK nunca tocan el backend.
4. **Inmutabilidad probatoria**: Los reportes PDF llevan SHA-256 embebido y registrado en DB. Son verificables independientemente.

## 2. Componentes del Sistema

### 2.1 Photo Capture Module (`src/lib/capture/`)

Orquesta la captura de imagen con todos los metadatos de sensores.

```
captureService.capture(blob)
  ├── getCurrentPosition()      → GPS con validación de precisión
  ├── getDeviceOrientation()    → Alpha, Beta, Gamma del dispositivo
  ├── getServerTimestamp()      → Timestamp certificado (5s timeout)
  ├── generateUUID()            → ID único para la captura
  └── saveToIndexedDB()         → Persistencia local inmediata
```

**Decisiones clave:**
- GPS reliability threshold: 50m horizontal accuracy
- Orientation sampling: 500ms antes del evento de captura
- Timestamp fallback: local con `verified: false` si servidor no responde

### 2.2 AI Service Adapter (`src/lib/ai/`)

Patrón Strategy con router determinista.

```
AIServiceAdapter
  ├── selectProvider(config)
  │     ├── BYOK mode (key presente) → Provider directo
  │     └── Fallback mode (sin key) → Priority chain
  ├── analyze(image, config)
  │     ├── Strip EXIF
  │     ├── Build structural prompt
  │     ├── Call provider
  │     └── Validate response (Zod)
  └── registerProvider(provider)  → Extensible sin modificar routing
```

**Providers implementados:**

| Provider | Modo | Timeout | Notas |
|----------|------|---------|-------|
| Anthropic Claude | BYOK | 60s | Mejor análisis visual |
| OpenAI GPT-4V | BYOK | 60s | Strong multimodal |
| OpenRouter | BYOK | 60s | Multi-modelo con una key |
| Google Gemini | BYOK | 60s | Tier gratuito generoso |
| NVIDIA NIM | Fallback | 15s | Gratuito, servidor-side |
| OpenRouter | Fallback | 15s | Fallback secundario |

### 2.3 Structural Analysis Engine (`src/lib/ai/structuralPrompt.ts`)

Motor de análisis que combina:

1. **Prompt especializado** — Pide al LLM clasificar por tipo de grieta, estimar dimensiones, identificar indicadores de severidad, y aplicar reglas de ingeniería estructural.

2. **Cuestionario de contexto** — 4 preguntas visuales al usuario:
   - Tipo de elemento (columna/viga/muro carga/muro divisorio/placa/cimiento)
   - ¿Cruza de lado a lado?
   - ¿Creció post-sismo?
   - ¿Hay referencia de escala?

3. **Motor de reglas** — Ajusta el Risk Level del AI:

```
REGLAS DE PONDERACIÓN:
├── Columna/viga/cimiento + diagonal + cruza completa → CRÍTICO
├── Columna/viga + ancho > 2mm → mínimo ALTO
├── Muro de carga + horizontal/diagonal + cruza → mínimo ALTO
├── Muro divisorio → máximo MEDIO
├── Refuerzo expuesto o desplazamiento → CRÍTICO siempre
├── Crecimiento reciente → sube un nivel
└── Fisura cosmética en divisorio → LOW máximo
```

### 2.4 Sync Manager (`src/lib/sync/`)

Cola de sincronización offline-first con reintentos.

```
Estado de un item:
  pending → syncing → synced (eliminado de cola)
                   → failed (retención + reintento)
                   → conflict (ambas versiones preservadas)
```

- Procesamiento cronológico (oldest first)
- Backoff exponencial: 1s → 2s → 4s
- Máximo 3 reintentos por item
- Timeout 30s por operación
- Capacidad máxima: 50 items

### 2.5 Report Generator (`supabase/functions/generate-report/`)

Edge Function (Deno) que genera PDFs inmutables.

```
Input: captureId, userId, imageStoragePath, metadata, analysis
Process:
  1. Download image from Storage
  2. Build PDF content (all metadata + analysis)
  3. Compute SHA-256 of PDF binary
  4. Embed hash in footer
  5. Upload PDF to Storage
  6. Record hash in DB
  7. Generate signed URL (1hr)
Output: reportId, pdfStoragePath, integrityHash, downloadUrl
```

### 2.6 Connectivity Monitor (`src/lib/connectivity/`)

Observer pattern para estado de red.

- `navigator.onLine` + eventos `online`/`offline`
- Health check activo via HEAD request
- Estado `syncing` seteado por el Sync Manager
- Notificación a subscribers dentro de 3 segundos

## 3. Modelo de Datos

### PostgreSQL (Supabase)

```sql
users
├── id (UUID, PK, references auth.users)
├── email (TEXT, UNIQUE)
├── display_name (TEXT)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

reports
├── id (UUID, PK)
├── user_id (UUID, FK → users, NOT NULL)
├── gps_latitude (DOUBLE PRECISION, nullable)
├── gps_longitude (DOUBLE PRECISION, nullable)
├── gps_accuracy (DOUBLE PRECISION)
├── gps_reliable (BOOLEAN)
├── sensor_metadata (JSONB)
├── server_timestamp (TIMESTAMPTZ)
├── local_timestamp (TIMESTAMPTZ, NOT NULL)
├── timestamp_verified (BOOLEAN)
├── risk_level (TEXT, CHECK: low/medium/high/critical)
├── analysis_text (TEXT, max 2000)
├── analysis_confidence (DOUBLE PRECISION, 0-1)
├── analysis_provider (TEXT)
├── image_storage_path (TEXT, NOT NULL)
├── pdf_storage_path (TEXT, nullable)
├── integrity_hash (TEXT, nullable)
├── status (TEXT, CHECK: pending/analyzed/report_generated)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

### IndexedDB (Local)

```
safespace-captures
├── captures (key: UUID)
│   ├── imageBlob
│   ├── metadata (CaptureMetadata)
│   ├── analysisResult (nullable)
│   ├── syncStatus
│   └── createdAt
└── settings
    ├── aiConfig
    └── lastSyncAt

safespace-sync-queue
└── queue (key: UUID)
    ├── captureResult
    ├── status (pending/syncing/failed/conflict)
    ├── retryCount
    ├── lastAttempt
    ├── error
    ├── conflictData
    └── createdAt
```

## 4. Seguridad

### Row Level Security (RLS)

```
users: SELECT/UPDATE/INSERT solo own row (id = auth.uid())
reports: SELECT/INSERT/UPDATE/DELETE solo own rows (user_id = auth.uid())
storage: Solo acceso a carpeta {user_id}/ del usuario
```

### Protección de Credenciales

| Secret | Ubicación | Acceso |
|--------|-----------|--------|
| Supabase Anon Key | `NEXT_PUBLIC_*` env var | Client (read-only) |
| Service Role Key | Server env var | Solo Server Actions / Edge Functions |
| BYOK keys | sessionStorage (AES-GCM) | Solo browser del usuario |
| Fallback AI keys | Server env var | Solo Server Actions |

### Error Handling

Todas las respuestas de error siguen `SafeErrorResponse`:
- NUNCA exponen stack traces, rutas, IDs de DB, nombres de servicios
- Logging seguro: provider + resultado + duración, NUNCA keys/images/GPS/PII

## 5. Flujo de Datos Principal

```
Usuario toma foto
  → captureService graba GPS + orientación + timestamp
  → Imagen guardada en IndexedDB (offline-safe)
  → Usuario responde cuestionario estructural (4 preguntas)
  → buildStructuralPrompt() genera prompt especializado
  → AI analiza con contexto
  → applyStructuralRules() ajusta Risk Level
  → Resultado mostrado al usuario
  → Item encolado para sincronización
  → Sync Manager sube cuando hay red
  → Backend persiste metadata + imagen en Supabase
  → Usuario puede generar PDF inmutable
```

## 6. Decisiones Técnicas Clave

| Decisión | Alternativa Descartada | Razón |
|----------|------------------------|-------|
| Next.js App Router | Pages Router | Server Components, streaming, Server Actions tipo-seguras |
| Supabase como BaaS | Firebase / Backend propio | Auth + DB + Storage + Edge Functions unificado |
| IndexedDB | localStorage | Soporta blobs binarios, > 50MB capacidad |
| Service Worker Cache-First | Network-First | Shell instantáneo offline |
| Prompt Engineering | Modelos de segmentación (U-Net) | Sin infraestructura GPU extra, más simple, suficiente para triaje |
| Motor de reglas local | Todo en AI | Determinista, auditable, no depende de hallucinations |
| pnpm | npm / yarn | Más rápido, strict, workspace-compatible |

## 7. Sistema Visual y Paleta

### 7.1 Origen y Filosofía

SafeSpace sera embebido dentro del **proyecto principal RutaDeAyuda** (`public/design.md`), una plataforma centralizada de ayuda humanitaria post-terremoto en Colombia (M7.4 San José del Palmar, Chocó, 10-ago-2026). El screenshot de su home muestra el patrón que SafeSpace debe seguir:

- **CTAs primarios**: ROJO (`destructive #ef4444`) con texto blanco, **`rounded-full`** (pill)
- **CTAs secundarios / outlines**: BLANCO con borde AZUL (`primary #3b82f6`), texto azul, pill
- **Acentos / iconos**: AMARILLO (`badge-yellow #eab308`)
- **Títulos**: AZUL (`foreground #0f172a` slate-900)
- **Bg**: BLANCO con gradiente sutil ámbar

**Decisión técnica:** Los hex del principal (`#3b82f6` blue-500 y `#ef4444` red-500) NO pasan WCAG AA strict sobre blanco como texto. Para mantener la identidad visual + accesibilidad simultaneamente, usamos los tonos inmediatamente más oscuros que sí pasan:
- `brand.accent` = `#1d4ed8` (blue-700, 6.70:1 AA) — derivado de `primary #3b82f6`
- `brand.cta` = `#dc2626` (red-600, 4.83:1 AA) — derivado de `destructive #ef4444`
- Diferencia visual mínima, accesibilidad garantizada.

### 7.2 Source of Truth

Tres lugares, una sola verdad. Si cambia un hex, se actualiza en los tres y se corre `tokens.test.ts` para validar WCAG.

1. **`src/lib/ui/tokens.ts`** — `SEMANTIC_TOKENS` con tipos `SemanticTokens` y `StatusTriple`. Tests `tokens.test.ts` validan contraste.
2. **`src/app/globals.css`** — Variables CSS consumidas por Tailwind vía `var(--*)` en `tailwind.config.ts`.
3. **`tailwind.config.ts`** — Hex directos para `status-*` y `triage-*`.

`src/app/manifest.ts` y `src/app/layout.tsx` (`viewport.themeColor`) deben coincidir con `--surface-0`.

### 7.3 Paleta Actual (Tema Claro, alineada a RutaDeAyuda)

#### Superficies (4 niveles)

| Token | Hex | Equivalente RutaDeAyuda |
|---|---|---|
| `surface-0` | `#ffffff` | `background` |
| `surface-1` | `#f1f5f9` | `muted` |
| `surface-2` | `#e2e8f0` | `border` |
| `surface-3` | `#cbd5e1` | slate-300 |

#### Bordes y Texto (AAA estricto)

| Token | Hex | Contraste vs surface-0 |
|---|---|---|
| `border.subtle` | `#e2e8f0` | — |
| `border.default` | `#cbd5e1` | — |
| `border.strong` | `#94a3b8` | — |
| `text.primary` | `#0f172a` | **17.85:1** ✓ (= `foreground` de RutaDeAyuda) |
| `text.secondary` | `#334155` | **10.35:1** ✓ (slate-700) |
| `text.muted` | `#334155` | **10.35:1** ✓ (pasa AAA en todas las surfaces) |

#### Marca (rojo CTA + azul accent)

| Token | Hex | Uso |
|---|---|---|
| `brand.accent` | **`#1d4ed8`** | Texto/iconos/links/outlines (blue-700, AA 6.70:1 sobre blanco). |
| `brand.cta` | **`#dc2626`** | **Fondo del CTA primario**. SIEMPRE con `text-white` (AA 4.83:1). Pill shape (`rounded-full`). |

#### Severidad (badges, 3 niveles)

| Nivel | bg | fg | border | Contraste fg/bg |
|---|---|---|---|---|
| `minor` | `#16a34a` | `#052e16` | `#14532d` | 4.52:1 ✓ AA |
| `moderate` | **`#eab308`** | `#1c1207` | `#854d0e` | **9.61:1 ✓ AAA** (= badge-yellow de RutaDeAyuda) |
| `critical` | `#b91c1c` | `#fef2f2` | `#7f1d1d` | 5.91:1 ✓ AA (= "evacuate" tones) |

#### Triage (banner post-evaluación, 4 niveles)

| Nivel | bg | fg | border | Contraste fg/bg |
|---|---|---|---|---|
| `habitable` | `#15803d` | `#f0fdf4` | `#14532d` | 4.79:1 ✓ AA |
| `monitoring` | `#b45309` | `#fef3c7` | `#7c2d12` | 4.51:1 ✓ AA |
| `unsafe` | `#c2410c` | `#ffedd5` | `#7c2d12` | 4.52:1 ✓ AA |
| `evacuate` | `#991b1b` | `#fee2e2` | `#7f1d1d` | 6.80:1 ✓ AA |

### 7.4 Sistema Unificado de Botones

**Shape canonico:** `rounded-full` (pill) para TODOS los botones. Sin excepciones.

| Tipo | Patrón | Uso |
|---|---|---|
| **Primary CTA** | `bg-brand-cta text-white rounded-full` (red pill, white text) | "Capturar Grieta", "Iniciar Sesión", "Enviar enlace", "Nueva Captura", "Ver detalles", etc. |
| **Secondary / outline** | `bg-white border border-brand-accent text-brand-accent rounded-full` (white pill, blue border + text) | "Mis Reportes", "Centros", "Albergues", etc. |
| **Tertiary / muted** | `bg-white border border-border-default text-text-muted rounded-full` | "Configuración", "Cancelar", links secundarios |
| **Segmented control** | `bg-surface-2/60 p-1 rounded-full` con items `rounded-full` | Mode toggle (Contraseña / Enlace Mágico) |

### 7.4.1 Animaciones (Framer Motion)

Todos los botones primarios/secundarios/tertiarios usan el componente **`MotionButton`** (`src/components/ui/MotionButton.tsx`) que aplica animaciones consistentes via Framer Motion:

- **Hover**: `scale: 1.04` + `y: -2` (lift sutil)
- **Tap**: `scale: 0.96` (press feedback)
- **Transition**: `spring { stiffness: 400, damping: 20 }` (snappy, smooth)
- **`prefers-reduced-motion`**: respetado automáticamente — sin animación si el usuario lo configuró en su SO.

API:
```tsx
<MotionButton href="/capture" aria-label="Capturar">
  Capturar
</MotionButton>

<MotionButton type="submit" disabled={loading} buttonProps={{ className: '...' }}>
  {loading ? 'Enviando...' : 'Enviar'}
</MotionButton>
```

- Si pasas `href`, renderiza Next.js `<Link>` (navigation client-side)
- Si NO pasas `href`, renderiza `<button>` nativo (forms, type="submit")

**Aplicado en:**
- `src/app/page.tsx` — home (Capturar/Mis Reportes/Configuración)
- `src/app/(auth)/login/page.tsx` — Iniciar Sesión, Enviar Enlace Mágico
- `src/app/(auth)/register/page.tsx` — Crear cuenta
- `src/app/(auth)/forgot-password/page.tsx` — Enviar enlace
- `src/app/(auth)/reset-password/page.tsx` — Confirmar token, Actualizar contraseña
- `src/app/(protected)/settings/page.tsx` — Guardar Clave API
- `src/app/(protected)/capture/CaptureSuccessPanel.tsx` — Nueva Captura
- `src/app/(protected)/reports/[id]/page.tsx` — Generar PDF
- `src/components/capture/DualCaptureFlow.tsx` — Continuar

### 7.5 Uso de Logo y Acentos

- **Header / hero**: Logo PNG en un cuadrado de 24×24 con fondo `bg-brand-cta/10` (rojo al 10%) y borde `border-brand-cta/30`. Da identidad visual sin gritar.
- **Pills de features**: `bg-surface-1 border-border-default text-text-primary` con íconos `text-brand-accent` (azul) o `text-status-minor-bg` (verde). Sin colores de marca fuertes.
- **Links inline**: `text-brand-accent hover:underline` para texto secundario importante ("¿Olvidaste tu contraseña?", "Registrarse", "Volver a iniciar sesión").
- **Glow decorativo del hero / auth**: `bg-brand-cta/10` con `blur-3xl` — muy sutil, no compite con el contenido.

### 7.6 Capture Mode — Legibilidad sobre Video

El HUD del viewfinder (`CaptureViewfinderHUD.tsx`) está SOBRE el stream de video de la cámara, cuyo brillo/color varía según la escena. Para legibilidad consistente:

- **Botón de linterna, escala "5 cm"**: `bg-black/60 backdrop-blur-md text-white border-white/40 rounded-md`. Alto contraste contra cualquier video.
- **Status indicator ("Nivelado" / "X° / Y°")**: usa los colores semánticos de status (`bg-status-minor/80` o `bg-status-moderate/80`) — funcionan porque el contraste es interno al badge.
- **Crosshair SVG**: `stroke="white"` con `opacity-40` — visible sobre video claro u oscuro.

NO usar `bg-surface-1/80 text-text-primary` en overlays del HUD — el gris claro se mezcla con escenas brillantes del video.

### 7.7 Reglas de Uso Generales

1. **Nunca** hardcodear hex fuera de los tres archivos mirror. Usar siempre tokens (`bg-brand-cta`, `text-brand-accent`, `border-border-default`).
2. **Nunca** mezclar tokens y hex arbitrarios (`bg-[#ef4444]`). Si necesitas el rojo exacto, usa `bg-brand-cta`. Color one-off → crear token primero.
3. **Todos los botones** deben ser `rounded-full` (pill) según el sistema del principal.
4. Los badges de severidad y el banner de triage **deben** incluir `fg` + `bg` del par correspondiente — no usar solo `bg` sin texto.
5. El rojo y el verde de status **no son libremente intercambiables** con clases de color literales — siempre a través de `status.minor` / `status.critical`.
6. Para animaciones de foco o pulso (e.g. `ring-pulse`), el color base debe ser `brand.accent` (`rgb(29 78 216 / …)` = blue-700).

### 7.8 Accesibilidad y Modo de Alto Contraste

`@media (prefers-contrast: more)` en `globals.css` eleva el contraste para condiciones outdoor:

- `surface-1` → `#ffffff` puro
- `text-primary` → `#000000`
- `text-muted` → `#1e293b`
- `border.strong` → `#475569`

Cualquier hex nuevo debe mantener la paridad con este modo.

### 7.9 Validación

`src/lib/ui/tokens.test.ts` ejecuta tres tipos de assertions:

1. **Estructura** — Cada token expone un hex válido.
2. **Contraste WCAG** — `REQUIRED_TEXT_PAIRS` ≥ 7:1 (AAA estricto), `REQUIRED_SEVERITY_PAIRS` y `REQUIRED_TRIAGE_PAIRS` ≥ 4.5:1 (AA), `REQUIRED_BRAND_PAIR` ≥ 4.5:1, `REQUIRED_CTA_PAIR` (text-white/brand-cta) ≥ 4.5:1.
3. **Propiedad** — fast-check itera sobre todos los pares y verifica el invariante.

Al cambiar cualquier hex, correr `pnpm test src/lib/ui/tokens.test.ts` antes de commitear.
