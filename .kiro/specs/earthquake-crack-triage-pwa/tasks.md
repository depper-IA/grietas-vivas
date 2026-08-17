# Implementation Plan: Earthquake Crack Triage PWA

## Overview

Implementación de una PWA offline-first para triaje de grietas post-sismo en Cali, Colombia. La aplicación usa Next.js App Router con Supabase como backend, captura de fotos con metadatos de sensores (GPS, orientación, timestamps certificados), análisis AI modular (BYOK + Fallback), y generación de reportes PDF inmutables con hash de integridad. El stack de testing incluye Vitest con fast-check para property-based testing.

## Tasks

- [x] 1. Configurar estructura del proyecto y dependencias base
  - [x] 1.1 Inicializar proyecto Next.js con App Router y configurar dependencias
    - Crear proyecto Next.js 14+ con TypeScript usando `pnpm create next-app@latest`
    - Configurar `package.json` con `packageManager: "pnpm@9.x"` y scripts (`dev`, `build`, `test`, `lint`)
    - Instalar dependencias con versiones exactas via pnpm (npm PROHIBIDO):
      - `pnpm add tailwindcss@3.4.17 zod@3.23.8 idb@8.0.1 @supabase/supabase-js@2.49.1 @supabase/ssr@0.5.2`
      - `pnpm add -D vitest@3.0.4 fast-check@3.23.2 piexifjs@1.0.6 @vitejs/plugin-react@4.3.4`
    - Verificar que `pnpm-lock.yaml` se genera y agregar a git (npm-lock PROHIBIDO)
    - Configurar `tsconfig.json` con strict mode y path aliases (`@/` -> `src/`)
    - Configurar `tailwind.config.ts` con content paths para App Router
    - Configurar `next.config.js` (sin output: export, PWA se configura en 1.2)
    - Configurar Vitest en `vitest.config.ts` con soporte para TypeScript y path aliases
    - Crear `.npmrc` con `auto-install-peers=true` y `strict-peer-dependencies=false`
    - _Requisitos: 1.1_
    - _Reglas: 2.1, 2.2, 10 (pnpm obligatorio, versiones pinneadas)_

  - [x] 1.2 Configurar PWA con Service Worker y manifest
    - Instalar y configurar `next-pwa` o `serwist` para generación de Service Worker
    - Crear `src/app/manifest.ts` con metadatos de la PWA (nombre, iconos, colores, display: standalone)
    - Configurar estrategia Cache-First para shell y Network-First para datos
    - Registrar el Service Worker para cache de assets del shell (HTML, CSS, JS, iconos)
    - _Requisitos: 1.1, 1.2, 12.1_

  - [x] 1.3 Definir interfaces y tipos core del sistema
    - Crear `src/lib/capture/types.ts` con `CaptureMetadata`, `CaptureResult`
    - Crear `src/lib/ai/types.ts` con `RiskLevel`, `AnalysisResult`, `AIConfig`, `AnalysisPayload`, `IAIProvider`
    - Crear `src/lib/sync/types.ts` con `SyncStatus`, `SyncQueueItem`, `ISyncManager`, `QueueStatus`
    - Crear `src/lib/connectivity/types.ts` con `ConnectivityState`, `IConnectivityMonitor`
    - Crear `src/lib/errors/types.ts` con `SafeErrorResponse`
    - _Requisitos: 7.1, 9.4_

  - [x] 1.4 Configurar esquemas de validación Zod
    - Crear `src/lib/validation/schemas.ts` con todos los schemas: `riskLevelSchema`, `analysisResultSchema`, `captureMetadataSchema`, `fileNameSchema`, `syncPayloadSchema`
    - Crear `src/lib/validation/sanitize.ts` con funciones de sanitización de filenames y truncado de metadata
    - _Requisitos: 9.1, 9.3, 9.5_

  - [ ]* 1.5 Escribir tests de propiedad para sanitización de inputs
    - **Propiedad 17: Sanitización de Inputs**
    - Verificar que todo filename sanitizado contiene solo `[a-zA-Z0-9\-_.]`, max 255 chars, y que strings vacíos post-sanitización generan rechazo
    - **Valida: Requisitos 9.1, 9.3, 9.5**

  - [ ]* 1.6 Escribir tests de propiedad para validación de contraseña
    - **Propiedad 5: Límites de Validación de Contraseña**
    - Verificar que contraseñas < 8 o > 128 caracteres son rechazadas, y entre 8-128 son aceptadas
    - **Valida: Requisitos 3.1**

- [x] 2. Implementar capa de persistencia local (IndexedDB)
  - [x] 2.1 Crear wrapper de IndexedDB con esquema tipado
    - Crear `src/lib/db/localSchema.ts` con el schema de IndexedDB (stores: captures, settings)
    - Crear `src/lib/db/localDb.ts` usando la librería `idb` con soporte para migraciones e índices (`by-status`, `by-created`)
    - Implementar métodos CRUD: `add`, `get`, `getAll`, `update`, `delete`, `getByStatus`, `count`
    - _Requisitos: 1.3, 4.3, 12.2_

  - [ ]* 2.2 Escribir test de propiedad para capacidad del cache offline
    - **Propiedad 1: Invariante de Capacidad del Cache Offline**
    - Verificar que el sistema almacena hasta 50 items, rechaza nuevas capturas al alcanzar el límite, y no pierde datos previamente almacenados
    - **Valida: Requisitos 1.3, 4.3, 4.7, 12.2**

  - [ ]* 2.3 Escribir test de propiedad para limpieza de cache tras confirmación
    - **Propiedad 9: Limpieza de Cache tras Confirmación**
    - Verificar que items con confirmación de éxito del backend son eliminados del IndexedDB local
    - **Valida: Requisitos 4.4**

- [x] 3. Implementar módulo de captura de fotos con metadatos
  - [x] 3.1 Implementar servicio de captura de fotos
    - Crear `src/lib/capture/captureService.ts` implementando `ICaptureService`
    - Implementar `capture(imageBlob)` que orquesta lectura de GPS, orientación, y timestamp
    - Generar UUID v4 para cada captura
    - Ensamblar `CaptureMetadata` completo y guardar `CaptureResult` en IndexedDB
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Implementar lectura GPS con validación de precisión
    - Crear `src/lib/capture/gps.ts` con función `getCurrentPosition()`
    - Validar precision horizontal: si <= 50m marcar como `reliable: true`; si > 50m o no disponible marcar como no confiable
    - Almacenar coordenadas con mínimo 6 decimales de precisión
    - _Requisitos: 2.1, 2.5_

  - [x] 3.3 Escribir test de propiedad para integridad de metadatos GPS
    - **Propiedad 3: Integridad de Metadatos GPS**
    - Verificar reglas de precisión <= 50m → reliable: true, > 50m → reliable: false, y almacenamiento con 6 decimales
    - **Valida: Requisitos 2.1, 2.5**

  - [x] 3.4 Implementar lectura de orientación del dispositivo
    - Crear `src/lib/capture/orientation.ts` con función `getDeviceOrientation()`
    - Muestrear lectura dentro de 500ms antes del evento de captura
    - Manejar caso de API no disponible: marcar campos como `available: false`
    - _Requisitos: 2.2, 2.6_

  - [x] 3.5 Implementar servicio de timestamp certificado
    - Crear `src/lib/capture/timestamp.ts` con función `getServerTimestamp()`
    - Crear Server Action `src/app/actions/timestamp.ts` que retorna timestamp del servidor
    - Implementar timeout de 5 segundos; si falla o offline, registrar timestamp local con `verified: false`
    - _Requisitos: 2.3, 2.4_

  - [ ]* 3.6 Escribir test de propiedad para fallback de timestamp
    - **Propiedad 4: Fallback de Certificación de Timestamp**
    - Verificar que si el servidor no responde en 5s, se registra timestamp local con `verified: false` y se encola certificación
    - **Valida: Requisitos 2.4**

- [x] 4. Checkpoint — Verificar que la captura funciona end-to-end
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 5. Implementar autenticación con Supabase Auth
  - [x] 5.1 Configurar cliente Supabase y auth middleware
    - Crear `src/lib/db/supabase.ts` con clients para browser y server (usando `@supabase/ssr`)
    - Configurar variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
    - Implementar middleware de Next.js para protección de rutas y refresh de sesión
    - _Requisitos: 3.2, 3.4, 3.7_

  - [x] 5.2 Implementar páginas de login y registro
    - Crear `src/app/(auth)/login/page.tsx` con formulario email/password y opción magic link
    - Crear `src/app/(auth)/register/page.tsx` con validación de contraseña (8-128 caracteres)
    - Crear `src/app/(auth)/layout.tsx` con layout compartido de auth
    - Preservar datos del formulario en caso de error (Requisito 3.5)
    - Implementar manejo de magic links expirados (60 min) con opción de reenvío
    - _Requisitos: 3.1, 3.5, 3.6_

  - [ ]* 5.3 Escribir tests unitarios para autenticación
    - Test de validación de contraseña (min 8, max 128 caracteres)
    - Test de redirección de usuarios no autenticados
    - Test de manejo de errores (email duplicado, magic link expirado)
    - _Requisitos: 3.1, 3.4, 3.5, 3.6_

- [x] 6. Implementar esquema de base de datos y políticas RLS
  - [x] 6.1 Crear migraciones SQL para tablas y políticas
    - Crear `supabase/migrations/001_create_users.sql` con tabla users referenciando auth.users
    - Crear `supabase/migrations/002_create_reports.sql` con tabla reports, CHECK constraints, e índices
    - Crear `supabase/migrations/003_enable_rls.sql` con políticas RLS para users y reports
    - Crear `supabase/migrations/004_create_storage_buckets.sql` con buckets `captures` y `reports` con políticas de acceso por usuario
    - _Requisitos: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 4.5, 10.2_

  - [ ]* 6.2 Escribir test de propiedad para aislamiento RLS
    - **Propiedad 6: Aislamiento a Nivel de Fila (RLS)**
    - Verificar que usuario A no puede leer/modificar/eliminar datos de usuario B, y que INSERT con user_id diferente a auth.uid() es rechazado
    - **Valida: Requisitos 3.3, 11.4, 11.5, 11.6**

- [x] 7. Implementar AI Service Adapter
  - [x] 7.1 Implementar adaptador AI con patrón Strategy
    - Crear `src/lib/ai/aiService.ts` implementando `IAIServiceAdapter`
    - Implementar router que selecciona proveedor según presencia de clave BYOK
    - Implementar `registerProvider()` para extensibilidad sin modificar lógica de enrutamiento
    - Implementar validación de respuesta con Zod schema antes de retornar resultados
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.6_

  - [x] 7.2 Implementar proveedores BYOK (Anthropic y OpenAI)
    - Crear `src/lib/ai/providers/anthropic.ts` implementando `IAIProvider`
    - Crear `src/lib/ai/providers/openai.ts` implementando `IAIProvider`
    - Implementar timeout de 60 segundos con abort
    - Implementar manejo de errores de autenticación con mensaje descriptivo
    - _Requisitos: 5.1, 5.2, 5.4, 5.5_

  - [x] 7.3 Implementar proveedores Fallback (OpenRouter y NVIDIA NIM)
    - Crear `src/lib/ai/providers/openrouter.ts` implementando `IAIProvider`
    - Crear `src/lib/ai/providers/nvidia-nim.ts` implementando `IAIProvider`
    - Implementar timeout de 15 segundos por proveedor fallback
    - Implementar cadena de failover: si un proveedor falla, intentar el siguiente en orden de prioridad
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

  - [x] 7.4 Implementar Server Action para análisis fallback
    - Crear `src/app/actions/analysis.ts` con `analyzeWithFallback()`
    - Las claves fallback se manejan exclusivamente del lado del servidor (variables de entorno)
    - Las llamadas BYOK se hacen directamente desde el cliente (nunca tocan el backend)
    - _Requisitos: 5.1, 6.1, 9.2_

  - [x] 7.5 Escribir test de propiedad para validación de schema de respuesta AI
    - **Propiedad 11: Validación de Schema de Respuesta AI**
    - Verificar que respuestas conformes producen `AnalysisResult` válido; respuestas no conformes son rechazadas con error estructurado
    - **Valida: Requisitos 5.3, 5.6, 6.5, 7.3, 7.4**

  - [x] 7.6 Escribir test de propiedad para cadena de failover
    - **Propiedad 12: Cadena de Failover de Proveedores**
    - Verificar que ante fallos, el sistema intenta el siguiente proveedor sin repetir uno ya fallido
    - **Valida: Requisitos 6.3**

  - [x] 7.7 Escribir test de propiedad para enrutamiento por presencia de clave
    - **Propiedad 13: Enrutamiento de Proveedor por Presencia de Clave**
    - Verificar que con clave → BYOK, sin clave → Fallback; decisión determinista
    - **Valida: Requisitos 7.2**

  - [x] 7.8 Escribir test de propiedad para contrato de interfaz del adaptador
    - **Propiedad 14: Contrato de Interfaz del Adaptador AI**
    - Verificar que `analyze()` siempre retorna Risk_Level (4 valores), descripción (max 2000), confianza numérica; imagen max 10 MB
    - **Valida: Requisitos 7.1**

- [x] 8. Implementar privacidad y procesamiento de imágenes
  - [x] 8.1 Implementar eliminación de EXIF y encriptación BYOK
    - Crear `src/lib/exif/strip.ts` usando `piexifjs` para remover metadatos EXIF antes de enviar a AI
    - Crear `src/lib/crypto/byokEncryption.ts` con AES-GCM via Web Crypto API para encriptar claves BYOK en `sessionStorage`
    - _Requisitos: 5.1, 10.3, 10.5_

  - [ ]* 8.2 Escribir test de propiedad para exclusión de datos sensibles
    - **Propiedad 10: Exclusión de Datos Sensibles**
    - Verificar que payloads a AI no contienen: claves BYOK, PII, GPS, ni EXIF; logs no contienen claves ni imágenes
    - **Valida: Requisitos 5.1, 7.5, 10.1, 10.3, 10.5**

- [x] 9. Checkpoint — Verificar módulos AI y privacidad
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 10. Implementar Sync Manager y Connectivity Monitor
  - [x] 10.1 Implementar Connectivity Monitor
    - Crear `src/lib/connectivity/monitor.ts` implementando `IConnectivityMonitor`
    - Observar eventos `online`/`offline` del navegador
    - Implementar patrón Observer con `subscribe()` para notificar cambios de estado
    - Actualizar indicador dentro de 3 segundos del cambio de estado
    - _Requisitos: 12.4_

  - [x] 10.2 Implementar Sync Manager con cola y reintentos
    - Crear `src/lib/sync/syncManager.ts` implementando `ISyncManager`
    - Crear `src/lib/sync/queue.ts` para gestión de cola en IndexedDB
    - Implementar procesamiento en orden cronológico (oldest first)
    - Implementar reintentos con backoff exponencial (1s, 2s, 4s) hasta 3 intentos
    - Timeout de 30 segundos por item
    - Retener items fallidos en cola para reintento en próxima restauración de red
    - _Requisitos: 1.4, 1.5, 4.6, 12.3, 12.7_

  - [x] 10.3 Implementar Server Action de sincronización
    - Crear `src/app/actions/sync.ts` con `syncCapture()`
    - Upload de imagen a Supabase Storage (bucket `captures`, path `{user_id}/{filename}`)
    - Persistir metadata completa en tabla `reports` de PostgreSQL
    - Eliminar item de cache local tras confirmación exitosa
    - _Requisitos: 4.1, 4.2, 4.4_

  - [ ]* 10.4 Escribir test de propiedad para retención tras agotamiento de reintentos
    - **Propiedad 2: Retención tras Agotamiento de Reintentos**
    - Verificar que items con 3 reintentos fallidos son retenidos, marcados como fallidos, y reintentados en siguiente restauración de red
    - **Valida: Requisitos 1.5, 4.6, 12.7**

  - [ ]* 10.5 Escribir test de propiedad para orden cronológico de sincronización
    - **Propiedad 18: Orden Cronológico de Sincronización**
    - Verificar que items se procesan en orden ascendente de creación (más antiguo primero)
    - **Valida: Requisitos 12.3**

  - [ ]* 10.6 Escribir test de propiedad para preservación en conflictos
    - **Propiedad 19: Preservación en Resolución de Conflictos**
    - Verificar que ante conflictos, ambas versiones se preservan sin pérdida de datos
    - **Valida: Requisitos 12.5**

- [x] 11. Implementar generación de reportes PDF
  - [x] 11.1 Implementar Edge Function para generación de reportes
    - Crear `supabase/functions/generate-report/index.ts` (Deno runtime)
    - Crear `supabase/functions/generate-report/types.ts` con `ReportInput` y `ReportOutput`
    - Generar PDF con: foto, GPS (si disponible), timestamp certificado, sensor metadata, Risk_Level, y texto de análisis
    - Calcular SHA-256 sobre contenido binario del PDF y embeber en footer
    - Almacenar PDF en Supabase Storage (bucket `reports`, path `{user_id}/{report_id}.pdf`)
    - Registrar `integrity_hash` en tabla reports
    - Retornar URL de descarga firmada (accesible solo al owner)
    - Implementar timeout de 30 segundos; abortar si se excede
    - Validar campos requeridos; rechazar con listado de campos faltantes si incompleto
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 11.2 Crear Server Action para solicitud de reporte
    - Crear `src/app/actions/report.ts` con `generateReport()`
    - Invocar Edge Function con `service_role_key`
    - Retornar `ReportOutput` al cliente
    - _Requisitos: 8.4_

  - [ ]* 11.3 Escribir test de propiedad para completitud de contenido del reporte
    - **Propiedad 15: Completitud de Contenido del Reporte**
    - Verificar que con todos los campos presentes se genera PDF completo; con campos faltantes se retorna error listando los campos faltantes
    - **Valida: Requisitos 8.1, 8.5**

  - [ ]* 11.4 Escribir test de propiedad para hash de integridad
    - **Propiedad 16: Hash de Integridad del Reporte**
    - Verificar que el SHA-256 embebido en el footer es reproducible independientemente
    - **Valida: Requisitos 8.2**

  - [ ]* 11.5 Escribir test de propiedad para completitud de persistencia de metadatos
    - **Propiedad 8: Completitud de Persistencia de Metadatos**
    - Verificar que toda foto subida exitosamente tiene TODOS los campos de metadatos persistidos en PostgreSQL
    - **Valida: Requisitos 4.2**

- [x] 12. Implementar interfaz de usuario
  - [x] 12.1 Crear componentes de captura y UI principal
    - Crear `src/app/(protected)/capture/page.tsx` con interfaz de captura de fotos
    - Crear `src/components/capture/` con componentes de cámara y preview
    - Implementar botón de captura que invoca `captureService.capture()`
    - Mostrar indicadores de estado de GPS y orientación
    - Mostrar notificación visual persistente si GPS no disponible o no confiable
    - _Requisitos: 1.2, 2.5_

  - [x] 12.2 Crear componentes de reportes y listado
    - Crear `src/app/(protected)/reports/page.tsx` con listado de reportes del usuario
    - Crear `src/app/(protected)/reports/[id]/page.tsx` con detalle y descarga de PDF
    - Implementar visualización de reportes cacheados localmente mientras offline
    - _Requisitos: 1.3, 8.4, 10.4_

  - [x] 12.3 Crear indicador de conectividad y componentes de sincronización
    - Crear `src/components/sync/ConnectivityIndicator.tsx` visible en todas las pantallas (online, offline, syncing)
    - Crear `src/components/sync/SyncStatus.tsx` con contadores de items pendientes/fallidos
    - Implementar notificaciones de items fallidos y almacenamiento lleno
    - _Requisitos: 12.4, 12.6, 12.7, 4.7_

  - [x] 12.4 Crear página de configuración AI
    - Crear `src/app/(protected)/settings/page.tsx` con configuración de proveedor AI
    - Implementar formulario BYOK para ingresar clave API (Anthropic o OpenAI)
    - Mostrar estado del modo actual (BYOK/Fallback)
    - _Requisitos: 5.1, 5.4_

- [x] 13. Implementar manejo de errores y respuestas seguras
  - [x] 13.1 Implementar formateo de errores seguros
    - Crear `src/lib/errors/formatError.ts` con función que transforma errores internos a `SafeErrorResponse`
    - Asegurar que nunca se exponen: stack traces, rutas de servidor, IDs de DB, nombres de servicios internos
    - Implementar logging seguro (proveedor, resultado, duración; nunca claves, imágenes, GPS, PII)
    - _Requisitos: 3.5, 9.4_

  - [ ]* 13.2 Escribir test de propiedad para respuestas de error seguras
    - **Propiedad 7: Respuestas de Error Seguras**
    - Verificar que ningún error expone stack traces, rutas, IDs internos, ni nombres de servicios
    - **Valida: Requisitos 3.5, 9.4**

- [x] 14. Integrar componentes y flujos end-to-end
  - [x] 14.1 Conectar flujo completo: Captura → Análisis → Sincronización → Reporte
    - Crear hooks de React: `src/hooks/useCapture.ts`, `src/hooks/useSync.ts`, `src/hooks/useConnectivity.ts`, `src/hooks/useAIAnalysis.ts`
    - Wiring de Connectivity Monitor con Sync Manager (trigger sync al restaurar red)
    - Integrar Background Sync API donde esté soportada
    - Implementar retry automático de análisis AI cuando los fallback fallan (retry en 15 min o al restaurar red)
    - _Requisitos: 1.4, 6.4, 12.3_

  - [x] 14.2 Implementar manejo de conflictos de sincronización
    - Detectar conflictos (datos del servidor más nuevos que locales)
    - Preservar ambas versiones sin pérdida de datos
    - Mostrar notificación con conteo de items en conflicto
    - Marcar visualmente items en conflicto vs no-conflicto
    - _Requisitos: 12.5_

  - [ ]* 14.3 Escribir tests de integración para flujo completo
    - Test de flujo Captura → almacenamiento local → sincronización → confirmación → limpieza
    - Test de flujo offline → restaurar red → sync automático
    - Test de flujo análisis BYOK y fallback con validación de respuesta
    - _Requisitos: 1.4, 4.1, 4.2, 4.4, 12.3_

- [x] 15. Checkpoint final — Verificar integración completa
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental del progreso
- Los tests de propiedades validan invariantes universales de correctitud (19 propiedades definidas en el diseño)
- Los tests unitarios validan ejemplos específicos y edge cases
- El lenguaje de implementación es TypeScript (definido explícitamente en el diseño)
- La estructura de archivos sigue la organización definida en el documento de diseño

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1", "5.1", "6.1"] },
    { "id": 4, "tasks": ["3.2", "3.4", "3.5", "5.2", "6.2"] },
    { "id": 5, "tasks": ["3.3", "3.6", "5.3", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "8.1"] },
    { "id": 7, "tasks": ["7.5", "7.6", "7.7", "7.8", "8.2"] },
    { "id": 8, "tasks": ["10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3", "10.4", "10.5", "10.6"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3", "11.4", "11.5"] },
    { "id": 12, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 13, "tasks": ["13.1"] },
    { "id": 14, "tasks": ["13.2", "14.1"] },
    { "id": 15, "tasks": ["14.2"] },
    { "id": 16, "tasks": ["14.3"] }
  ]
}
```
