<div align="center">

# Grietas Vivas

**Triaje estructural preliminar de grietas post-sismo, desde el celular**
Captura con metadatos certificados · Análisis asistido por IA · Motor de reglas NSR-10 · Reportes PDF con hash SHA-256 · Offline-first
Desarrollado en respuesta a la emergencia en Cali, Colombia · Por [Sam Wilkie](https://github.com/depper-IA)

[![Licencia](https://img.shields.io/badge/Licencia-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Demo](https://img.shields.io/badge/Demo-grietas--vivas.vercel.app-000000?style=flat-square&logo=vercel&logoColor=white)](https://grietas-vivas.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

</div>

---

## Qué Es

Grietas Vivas es una **Progressive Web App (PWA)** para el triaje preliminar de grietas después de un sismo. Permite que cualquier ciudadano documente daños estructurales con metadatos relevantes como evidencia (GPS, timestamp certificado por servidor, orientación del dispositivo) y obtenga una evaluación preliminar de riesgo asistida por inteligencia artificial, sin instalar nada desde una tienda de aplicaciones.

Los reportes generados son **inmutables y verificables** mediante un hash de integridad SHA-256, para servir como documentación de soporte ante autoridades de gestión del riesgo y aseguradoras.

**No es un reemplazo de una inspección profesional**: la app no emite diagnósticos, emite un triaje preliminar que ayuda a priorizar la atención de ingenieros estructurales cuando la demanda los desborda.

---

## El Problema

Después de un sismo significativo en Cali:

- Los ingenieros estructurales disponibles **colapsan ante la demanda** de inspecciones.
- Los ciudadanos no saben si su vivienda es segura y toman decisiones desinformadas: quedarse en una estructura peligrosa o abandonar una segura.
- La documentación fotográfica informal **no tiene validez probatoria** ante autoridades ni aseguradoras.
- La conectividad es **intermitente** en zonas de desastre, lo que impide usar apps convencionales.

---

## Arquitectura y Flujo del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CLIENTE (PWA · Next.js · Service Worker)                               │
│  - Captura de foto + GPS + orientación + timestamp                      │
│  - Eliminación de EXIF antes de enviar a la IA                          │
│  - Cuestionario estructural de 4 preguntas                              │
│  - IndexedDB: hasta 50 capturas pendientes sin conexión                 │
│  - Motor de emergencia offline (reglas NSR-10 / FEMA 306)               │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Cola de sincronización (backoff 1s/2s/4s)
┌────────────────────────────────────▼────────────────────────────────────┐
│  SERVER ACTIONS (Next.js)                                               │
│  - analyzeWithFallback() · syncCapture() · generateReport()             │
│  - Rate limiting + validación Zod + sanitización                        │
└──────────────┬─────────────────────────────────────────┬────────────────┘
               │                                         │
┌──────────────▼──────────────────────┐   ┌──────────────▼────────────────┐
│  SUPABASE (BaaS)                    │   │  PROVEEDORES DE IA            │
│  - Auth (email/password, magic link)│   │  - BYOK: Anthropic, OpenAI,   │
│  - PostgreSQL + RLS en toda tabla   │   │    Gemini, OpenRouter, MiniMax│
│  - Storage: captures / reports      │   │  - Fallback público:          │
│  - pgvector: banco de calibración   │   │    NVIDIA NIM → OpenRouter    │
│  - Edge Function: generate-report   │   │  - Embeddings: nv-embed-v1    │
└─────────────────────────────────────┘   └───────────────────────────────┘
```

### Pipeline de Análisis Estructural

1. El usuario captura la foto de la grieta.
2. Responde un cuestionario de contexto de 4 preguntas.
3. Se construye un prompt especializado en ingeniería estructural.
4. Se recuperan casos similares ya calibrados (RAG few-shot) y se inyectan en el prompt.
5. El proveedor de IA analiza la imagen.
6. La respuesta se valida contra un esquema Zod.
7. El **motor de reglas** ajusta el nivel de riesgo según el contexto estructural.
8. Se presenta el resultado y se puede generar el reporte PDF.

### Motor de Reglas de Nivel de Riesgo

La IA puede alucinar. Por eso el resultado final no depende solo del modelo: un motor de reglas determinista lo corrige según el contexto estructural reportado.

| Condición | Resultado |
|-----------|-----------|
| Columna / viga / cimiento + grieta diagonal + cruza de lado a lado | **CRÍTICO** |
| Refuerzo expuesto o desplazamiento | **CRÍTICO** siempre |
| Columna / viga + ancho > 2 mm | Mínimo **ALTO** |
| Muro de carga + horizontal/diagonal + cruza | Mínimo **ALTO** |
| Muro divisorio (cualquier grieta) | Máximo **MEDIO** |
| Fisura cosmética en muro divisorio | Máximo **BAJO** |
| Crecimiento reciente después del sismo | Sube un nivel |

### Cuestionario de Contexto Estructural

| # | Pregunta | Opciones |
|---|----------|----------|
| 1 | ¿En qué elemento está la grieta? | Columna, viga, muro de carga, muro divisorio, losa, cimiento |
| 2 | ¿La grieta cruza de lado a lado? | Sí / No |
| 3 | ¿Creció después del último sismo? | Sí / No |
| 4 | ¿Hay un objeto de referencia de escala? | Moneda, tarjeta, mano |

---

## Usuarios Objetivo

| Persona | Necesidad | Modo de Uso |
|---------|-----------|-------------|
| **Ciudadano afectado** | Saber si su vivienda es segura | Toma la foto, responde 4 preguntas y recibe la evaluación |
| **Ingeniero de campo** | Documentar y priorizar inspecciones | Usa su propia API key (BYOK) para un análisis detallado |
| **Autoridad municipal** | Recibir reportes estandarizados | Descarga PDFs con hash de integridad |
| **Aseguradora** | Evidencia verificable de daños | Valida la integridad del PDF con SHA-256 |

---

## Logros y Estado Actual del Proyecto

### 1. Captura con Metadatos (`src/lib/capture/`, `src/lib/exif/`)
- **GPS con validación de precisión**: una lectura de ≤ 50 m se marca como confiable.
- **Orientación del dispositivo** (alpha, beta, gamma) registrada en cada captura.
- **Timestamp certificado por servidor**, con fallback local cuando no hay conexión.
- **Eliminación automática de EXIF** antes de enviar la imagen a cualquier proveedor de IA.

### 2. Adaptador de IA Desacoplado (`src/lib/ai/`)
- **BYOK (Bring Your Own Key)**: Anthropic, OpenAI, Google Gemini, OpenRouter y MiniMax. La clave del usuario se guarda cifrada (AES-GCM) y se asocia a su cuenta.
- **Modo fallback público** con claves del sistema: NVIDIA NIM → OpenRouter, con failover automático.
- **RAG de calibración** (`rag.ts`): los casos confirmados o corregidos por usuarios se guardan como embeddings en pgvector y se recuperan como ejemplos few-shot para mejorar análisis futuros. Si falla, degrada sin bloquear la captura.
- **Taxonomía de grietas** (`crackTaxonomy.ts`): clasificación por patrón (capilar cosmética, diagonal, horizontal, etc.) y señales de peligro.

### 3. Motor de Emergencia Offline (`emergencyEngine.ts`)
- Triaje **100% determinista** basado en las normas **NSR-10 (Colombia)** y **FEMA 306** para cuando no hay red.
- Función pura, sin llamadas externas, con resultado marcado con su origen offline.
- Los resultados offline se sincronizan con el backend al recuperar la conexión para poder generar el PDF.

### 4. Sincronización Offline-First (`src/lib/sync/`, `src/lib/connectivity/`)
- **IndexedDB** para hasta 50 capturas pendientes; al llegar al límite se avisa y se bloquea una nueva captura.
- **Cola cronológica** con 3 reintentos y backoff exponencial (1s, 2s, 4s).
- **Detección automática de conectividad** (patrón Observer) y sincronización al restaurarse.
- **Resolución de conflictos** que preserva ambas versiones sin pérdida de datos.

### 5. Reportes y Visualización Pública
- **PDF inmutable** generado por una Edge Function de Supabase (Deno), con hash SHA-256 embebido y registrado en base de datos.
- **URL de descarga firmada**: solo el dueño del reporte puede descargarlo.
- **Mapa de calor público** (`/mapa`): zonas afectadas con Leaflet y OpenStreetMap, sin necesidad de cuenta.
- **Galería de reconocimiento** (`/reconocimiento`): guía visual de tipos de grietas para ayudar al ciudadano a identificar lo que ve.

### 6. Calidad y Pruebas
- **54 suites de prueba** con Vitest y **fast-check** (property-based testing).
- **19 propiedades formales de correctitud** definidas: invariante de capacidad del cache, cadena de failover de proveedores, enrutamiento por presencia de clave, aislamiento RLS, hash de integridad del reporte, orden cronológico de sincronización, entre otras.

---

## Consideraciones Éticas y Madurez del Sistema

> [!CAUTION]
> **Aviso de Responsabilidad**:
> Grietas Vivas emite un **triaje preliminar**, no un diagnóstico estructural. **No debe usarse como única base para decidir si una edificación es habitable.** Ante cualquier duda, se debe consultar a un ingeniero estructural o a la autoridad local de gestión del riesgo.
>
> Un **falso negativo** ("esta grieta es cosmética" cuando no lo es) puede llevar a alguien a quedarse en una estructura peligrosa. Un **falso positivo** genera pánico y satura aún más a los inspectores disponibles.

### Limitaciones Conocidas

1. **Sin segmentación pixel a pixel**: el análisis depende de un LLM multimodal, no de modelos especializados como DeepCrack o U-Net.
2. **Dimensiones estimadas**: sin LiDAR ni calibración real, las medidas son aproximaciones visuales.
3. **La IA puede alucinar**: el motor de reglas mitiga, pero no elimina, los errores de clasificación.
4. **Sin notificaciones push**: el usuario debe abrir la app para ver el estado de sincronización.
5. **Solo en español** en esta versión.

La app cumple con el régimen colombiano de habeas data (**Ley 1581 de 2012**) e incluye un disclaimer legal obligatorio.

---

## Roadmap

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│  v1.0 (COMPLETADA)      │     │  v1.1 (COMPLETADA)      │     │  v2.x (PLANIFICADA)     │     │  v3.0 (PLANIFICADA)     │
│  - Captura + metadatos  │────>│  - Cuestionario         │────>│  - Segmentación con     │────>│  - Dashboard para       │
│  - Análisis con IA      │     │    estructural          │     │    modelos especializ.  │     │    ingenieros           │
│  - Reportes PDF         │     │  - Motor de reglas      │     │  - Calibración real con │     │  - Webhook a CRM        │
│  - Offline-first        │     │  - Motor offline + RAG  │     │    referencia visual    │     │                         │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

---

## Guía de Inicio Rápido para Desarrolladores

### Requisitos
1. **Node.js 20+** y **pnpm 9** (el proyecto usa pnpm con versiones fijadas).
2. Un proyecto de **Supabase** con la extensión **pgvector** habilitada.
3. Al menos una API key de un proveedor de IA para el modo fallback (NVIDIA NIM u OpenRouter).

### Instalación

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar variables de entorno
# Crear .env.local con las variables de la tabla de abajo

# 3. Aplicar migraciones de base de datos
supabase db push --linked

# 4. Desplegar la Edge Function de reportes
supabase functions deploy generate-report

# 5. Iniciar en desarrollo
pnpm dev
```

### Variables de Entorno

| Variable | Alcance | Descripción |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente | Anon key (acceso público protegido por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Operaciones de administración y Edge Functions |
| `NVIDIA_NIM_API_KEY` | Servidor | Proveedor de IA fallback y embeddings |
| `OPENROUTER_API_KEY` | Servidor | Proveedor de IA fallback secundario |
| `AI_FALLBACK_PRIORITY` | Servidor | Orden de los proveedores fallback |

### Scripts

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm test` | Ejecuta la suite de pruebas |
| `pnpm test:coverage` | Pruebas con reporte de cobertura |
| `pnpm lint` | Linter |

### Estructura del Proyecto

```
grietas-vivas/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Login, registro, confirmación, recuperación de contraseña
│   │   ├── (protected)/         # Captura, reportes y ajustes (requieren sesión)
│   │   ├── actions/             # Server Actions: análisis, sync, reportes, heatmap
│   │   ├── mapa/                # Mapa de calor público
│   │   ├── reconocimiento/      # Galería de tipos de grietas
│   │   └── manifest.ts          # Manifest de la PWA
│   ├── components/              # capture, reports, heatmap, sync, settings, ui
│   ├── hooks/                   # useCapture, useSync, useConnectivity, useAIAnalysis
│   └── lib/
│       ├── ai/                  # Adaptador de IA, proveedores, prompt, reglas, RAG, motor offline
│       ├── capture/             # GPS, orientación, timestamp
│       ├── connectivity/        # Monitor de conectividad
│       ├── crypto/              # Cifrado de claves BYOK (AES-GCM)
│       ├── db/                  # Cliente Supabase + IndexedDB
│       ├── exif/                # Eliminación de metadatos EXIF
│       ├── security/            # Rate limiting
│       ├── sync/                # Cola de sincronización y resolución de conflictos
│       └── validation/          # Esquemas Zod, taxonomía de grietas, sanitización
├── supabase/
│   ├── functions/generate-report/   # Edge Function (Deno) para el PDF
│   └── migrations/                  # Migraciones SQL (tablas, RLS, storage, pgvector)
└── docs/                        # PRD, DESIGN y SPEC
```

La documentación de producto y diseño técnico está en [`docs/PRD.md`](docs/PRD.md), [`docs/DESIGN.md`](docs/DESIGN.md) y [`docs/SPEC.md`](docs/SPEC.md).

---

## Seguridad y Privacidad

- **Row Level Security**: toda tabla y bucket de storage restringe el acceso al dueño (`auth.uid()`).
- **Sin EXIF hacia terceros**: la imagen se limpia de metadatos antes de enviarse a cualquier proveedor de IA.
- **Claves BYOK cifradas**: las API keys de los usuarios se guardan cifradas con AES-GCM.
- **Rate limiting** en las Server Actions que consumen proveedores de IA.
- **Errores seguros**: los mensajes al usuario nunca exponen detalles internos, y el logger filtra datos sensibles.
- **Integridad verificable**: cada reporte PDF lleva un hash SHA-256 registrado en base de datos.

---

## Stack Tecnológico

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Deno](https://img.shields.io/badge/Deno-000000?style=flat-square&logo=deno&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat-square&logo=leaflet&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

</div>

---

## Licencia

Este proyecto se distribuye bajo la **Licencia Apache 2.0**. Esto significa que puedes usarlo, modificarlo y distribuirlo libremente, incluso en contextos institucionales o comerciales, siempre que mantengas el aviso de copyright original. Consulta el archivo [LICENSE](LICENSE) y el archivo [NOTICE](NOTICE) para más información.

---

<div align="center">

*Desarrollado desde Cali, Colombia — Herramienta abierta para ayudar a las personas a tomar decisiones más seguras después de un sismo.*

</div>
