# Especificación Técnica — SafeSpace v1.1

## 1. Información del Proyecto

| Campo | Valor |
|-------|-------|
| **Nombre** | SafeSpace — Earthquake Crack Triage PWA |
| **Versión** | 1.1 |
| **URL Producción** | https://safespace-pwa.vercel.app |
| **Backend** | https://kjkoyjcupljvqxeqvwba.supabase.co |
| **Repositorio** | (local: o:\Compartidas\SafeSpace) |
| **Stack** | Next.js 14 + TypeScript + Supabase + Tailwind CSS |
| **Tests** | 249 tests (Vitest + fast-check) |
| **Hosting** | Vercel (frontend) + Supabase (backend + Edge Functions) |

## 2. Estructura del Proyecto

```
SafeSpace/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Rutas de autenticación
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── confirm/route.ts
│   │   ├── (protected)/         # Rutas protegidas (requieren auth)
│   │   │   ├── capture/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── reports/[id]/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── layout.tsx       # Nav + ConnectivityIndicator + SyncStatus
│   │   ├── actions/             # Server Actions
│   │   │   ├── analysis.ts     # analyzeWithFallback()
│   │   │   ├── sync.ts         # syncCapture()
│   │   │   ├── report.ts       # generateReport()
│   │   │   └── timestamp.ts    # getServerTimestamp()
│   │   ├── page.tsx            # Landing page
│   │   ├── layout.tsx          # Root layout
│   │   ├── manifest.ts         # PWA manifest
│   │   └── globals.css
│   ├── components/
│   │   ├── capture/            # CameraViewfinder, CaptureButton, Preview, etc.
│   │   ├── reports/            # ReportCard, RiskBadge
│   │   ├── sync/              # ConnectivityIndicator, SyncStatus
│   │   └── navigation/        # BottomNav
│   ├── hooks/                  # useCapture, useSync, useConnectivity, useAIAnalysis
│   ├── lib/
│   │   ├── ai/               # AI Service Adapter + Providers
│   │   │   ├── aiService.ts
│   │   │   ├── structuralPrompt.ts  # Motor de reglas + prompt especializado
│   │   │   ├── types.ts
│   │   │   └── providers/    # anthropic, openai, openrouter, nvidia-nim, gemini
│   │   ├── capture/          # captureService, GPS, orientation, timestamp
│   │   ├── connectivity/     # ConnectivityMonitor (Observer pattern)
│   │   ├── crypto/           # BYOK encryption (AES-GCM)
│   │   ├── db/               # Supabase client + IndexedDB wrapper
│   │   ├── errors/           # formatError, secureLogger
│   │   ├── exif/             # EXIF stripping (piexifjs)
│   │   ├── sync/             # SyncManager, queue, conflictResolver
│   │   └── validation/       # Zod schemas, sanitization
│   ├── middleware.ts          # Auth protection + session refresh
│   └── test/                  # Test setup
├── supabase/
│   ├── functions/
│   │   └── generate-report/   # Edge Function (Deno) para PDF
│   └── migrations/            # 4 SQL migrations
├── public/
│   ├── sw.js                  # Service Worker
│   └── icons/                 # PWA icons
├── docs/
│   ├── PRD.md                 # Product Requirements Document
│   ├── DESIGN.md              # Technical Design Document
│   └── SPEC.md                # This file
└── .kiro/specs/               # Kiro spec files (requirements, design, tasks)
```

## 3. APIs y Endpoints

### Server Actions (Next.js)

| Action | Input | Output | Auth |
|--------|-------|--------|------|
| `syncCapture()` | imageBase64, metadata, analysisResult | {success, reportId, imageStoragePath} | Required |
| `generateReport()` | {captureId} | {success, report: ReportOutput} | Required |
| `analyzeWithFallback()` | {imageBase64} | AnalysisResult | Required |
| `getServerTimestamp()` | — | {timestamp, source} | None |

### Edge Functions

| Function | Endpoint | Auth | Timeout |
|----------|----------|------|---------|
| `generate-report` | POST /functions/v1/generate-report | Bearer service_role | 30s |

### Supabase Storage Buckets

| Bucket | Acceso | Path Pattern |
|--------|--------|--------------|
| `captures` | RLS (owner only) | `{user_id}/{filename}.jpg` |
| `reports` | RLS (owner only) | `{user_id}/{report_id}.pdf` |

## 4. Autenticación y Autorización

- **Método**: Supabase Auth (email/password + magic link)
- **Sesión**: 7 días máximo, refresh automático via middleware
- **Password**: 8-128 caracteres
- **Magic link**: Expira en 60 minutos
- **Redirect URL**: https://safespace-pwa.vercel.app/confirm
- **RLS**: Toda tabla y bucket tiene políticas que restringen a `auth.uid()`

## 5. AI Providers

### Routing Logic

```
if (user has BYOK key configured) {
  → Route directly to user's provider (client-side, key never hits backend)
} else {
  → Route to fallback (server-side, system keys in env vars)
  → Priority: NVIDIA NIM → OpenRouter
}
```

### Structural Analysis Pipeline

```
1. User captures photo
2. User answers 4-question structural questionnaire
3. buildStructuralPrompt(context) → specialized prompt
4. AI provider analyzes image with structural prompt
5. Response validated with Zod schema
6. applyStructuralRules(aiResult, context) → adjusted Risk Level
7. Final result presented to user
```

### Risk Level Rules Engine

| Condición | Resultado |
|-----------|-----------|
| Columna/viga/cimiento + diagonal + cruza completa | CRITICAL |
| Columna/viga + ancho > 2mm | Mínimo HIGH |
| Muro de carga + horizontal/diagonal + cruza | Mínimo HIGH |
| Muro divisorio (cualquier grieta) | Máximo MEDIUM |
| Refuerzo expuesto o desplazamiento | CRITICAL siempre |
| Crecimiento reciente post-sismo | Sube un nivel |
| Fisura cosmética en divisorio | Máximo LOW |

## 6. Offline Behavior

### Service Worker Strategy
- **Shell (HTML, CSS, JS, icons)**: Cache-First
- **Data (API calls)**: Network-First with fallback to cache

### IndexedDB Capacity
- Máximo 50 capturas pendientes
- Al llegar a 50: mostrar warning y bloquear nueva captura
- Items se eliminan solo tras confirmación del servidor

### Sync Queue Behavior
- Trigger automático cuando se restaura conectividad
- Background Sync API donde está soportada
- Reintentos: 3 intentos con backoff exponencial (1s, 2s, 4s)
- Items fallidos retenidos y reintentados en próxima restauración
- Conflictos: ambas versiones preservadas sin pérdida de datos

## 7. Variables de Entorno

### Client-side (NEXT_PUBLIC_*)

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (acceso público con RLS) |

### Server-side only

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypassa RLS (Edge Functions, admin ops) |
| `NVIDIA_NIM_API_KEY` | Fallback AI provider |
| `OPENROUTER_API_KEY` | Fallback AI provider (secundario) |
| `AI_FALLBACK_PRIORITY` | Orden de proveedores fallback |

## 8. Testing

### Framework
- **Vitest** para unit tests y property tests
- **fast-check** para property-based testing

### Cobertura (249 tests)
- AI Service Adapter: 4 property test suites (schema, failover, routing, contract)
- Sync Manager: queue CRUD, chronological order, backoff, retries, conflict detection
- Connectivity Monitor: observer pattern, browser events, state management
- Capture: GPS validation, orientation, timestamp fallback
- Crypto: BYOK encryption/decryption (AES-GCM)
- EXIF: stripping metadata
- Errors: safe formatting, secure logging
- IndexedDB: CRUD operations

### Propiedades Formales de Correctitud (19 definidas)
1. Invariante de capacidad del cache (50 items)
2. Retención tras agotamiento de reintentos
3. Integridad de metadatos GPS
4. Fallback de certificación de timestamp
5. Límites de validación de contraseña
6. Aislamiento a nivel de fila (RLS)
7. Respuestas de error seguras
8. Completitud de persistencia de metadatos
9. Limpieza de cache tras confirmación
10. Exclusión de datos sensibles
11. Validación de schema de respuesta AI
12. Cadena de failover de proveedores
13. Enrutamiento por presencia de clave
14. Contrato de interfaz del adaptador AI
15. Completitud de contenido del reporte
16. Hash de integridad del reporte
17. Sanitización de inputs
18. Orden cronológico de sincronización
19. Preservación en resolución de conflictos

## 9. Deployment

### Frontend (Vercel)
- Deploy automático: `npx vercel --prod`
- Build command: `next build`
- Env vars configuradas en Vercel project settings

### Backend (Supabase)
- Migraciones: `supabase db push --linked`
- Edge Functions: `supabase functions deploy generate-report`
- Auth URL config: Site URL = https://safespace-pwa.vercel.app

### Checklist de Deploy
- [ ] Migraciones SQL aplicadas (4 archivos)
- [ ] Buckets de storage creados (captures, reports)
- [ ] Edge Function desplegada (generate-report)
- [ ] Variables de entorno en Vercel (4 secrets)
- [ ] Site URL de Supabase Auth actualizada
- [ ] Redirect URLs de Supabase Auth configuradas
- [ ] Build exitoso (`pnpm build`)
- [ ] Tests pasan (`pnpm test`)

## 10. Limitaciones Conocidas (v1.1)

1. **No hay segmentación pixel a pixel** — El análisis depende del LLM, no de modelos especializados.
2. **Dimensiones son estimadas** — Sin calibración real, las medidas son aproximaciones visuales.
3. **No hay notificaciones push** — El usuario debe abrir la app para ver estado de sincronización.
4. **Single-page PDF** — Reportes muy largos pueden cortarse en una página.
5. **No hay dashboard de administración** — Cada usuario ve solo sus propios reportes.
6. **AI puede alucinar** — El motor de reglas mitiga pero no elimina errores de clasificación.
