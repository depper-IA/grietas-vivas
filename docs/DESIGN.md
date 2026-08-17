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
