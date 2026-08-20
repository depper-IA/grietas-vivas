# PRD — Grietas Vivas: Earthquake Crack Triage PWA

## 1. Resumen Ejecutivo

Grietas Vivas es una Progressive Web App (PWA) diseñada para triaje preliminar de grietas post-sismo en Cali, Colombia. Permite a ciudadanos documentar daños estructurales con metadatos legalmente relevantes (GPS, timestamps certificados, ángulos del dispositivo) y obtener un análisis preliminar de riesgo asistido por inteligencia artificial. Los reportes generados son inmutables y verificables mediante hash de integridad SHA-256, sirviendo como documentación de soporte para autoridades de gestión del riesgo y aseguradoras.

## 2. Problema

Después de un sismo significativo en Cali:
- Los ingenieros estructurales disponibles colapsan ante la demanda de inspecciones.
- Los ciudadanos no saben si su vivienda es segura y toman decisiones desinformadas (quedarse en una estructura peligrosa o abandonar una segura).
- La documentación fotográfica informal no tiene validez probatoria ante autoridades ni aseguradoras.
- La conectividad es intermitente en zonas de desastre, impidiendo el uso de apps convencionales.

## 3. Solución

Una aplicación web progresiva que:
1. **Zero-friction**: Acceso inmediato vía enlace web, sin tiendas de aplicaciones.
2. **Offline-first**: Captura y almacenamiento local completo sin red.
3. **Análisis AI multinivel**: Prompt engineering estructural + motor de reglas + cuestionario de contexto.
4. **Validez legal**: Metadatos certificados (GPS, timestamp servidor, orientación) y reportes inmutables con hash de integridad.
5. **Modularidad AI**: Adaptador desacoplado que soporta BYOK (Anthropic, OpenAI, OpenRouter, Gemini) y modo fallback público (NVIDIA NIM).

## 4. Usuarios Objetivo

| Persona | Necesidad | Modo de Uso |
|---------|-----------|-------------|
| **Ciudadano afectado** | Saber si su vivienda es segura | Toma foto, responde 4 preguntas, recibe evaluación |
| **Ingeniero de campo** | Documentar y priorizar inspecciones | Usa su propia API key (BYOK) para análisis detallado |
| **Autoridad municipal** | Recibir reportes estandarizados | Descarga PDFs con hash de integridad |
| **Aseguradora** | Evidencia verificable de daños | Valida integridad del PDF con SHA-256 |

## 5. Funcionalidades Core

### 5.1 Captura de Fotos con Metadatos
- GPS con validación de precisión (≤ 50m = confiable)
- Orientación del dispositivo (alpha, beta, gamma)
- Timestamp certificado del servidor (fallback local si offline)
- Eliminación automática de EXIF antes de enviar a AI

### 5.2 Cuestionario de Contexto Estructural
Preguntas rápidas pre-análisis:
1. ¿En qué elemento está la grieta? (columna, viga, muro de carga, muro divisorio, placa, cimiento)
2. ¿La grieta cruza de lado a lado?
3. ¿Creció después del último sismo?
4. ¿Hay objeto de referencia de escala? (moneda, tarjeta, mano)

### 5.3 Análisis AI con Motor de Reglas
- Prompt especializado en ingeniería estructural
- Clasificación detallada: tipo de grieta, dimensiones estimadas, indicadores de severidad
- Motor de reglas que ajusta el Risk Level basado en el contexto:
  - Columna + diagonal + cruza completa = CRÍTICO
  - Muro divisorio caps en MEDIO
  - Refuerzo expuesto o desplazamiento = CRÍTICO siempre
  - Crecimiento reciente = sube un nivel

### 5.4 Generación de Reportes PDF
- PDF inmutable con todos los metadatos
- Hash SHA-256 embebido y registrado en base de datos
- URL de descarga firmada (solo el dueño)

### 5.5 Sincronización Offline-First
- IndexedDB para hasta 50 capturas pendientes
- Cola con reintentos exponenciales (1s, 2s, 4s)
- Detección automática de conectividad
- Resolución de conflictos preservando ambas versiones

## 6. Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────┐
│           Cliente (PWA - Next.js)            │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Captura │ │ AI Svc   │ │ Sync Manager│  │
│  │ + GPS   │ │ Adapter  │ │ + Queue     │  │
│  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
│       │           │               │          │
│       └───────────┴───────┬───────┘          │
│                           │                  │
│                    ┌──────┴──────┐           │
│                    │  IndexedDB  │           │
│                    └─────────────┘           │
└───────────────────────┬─────────────────────┘
                        │
              ┌─────────┴─────────┐
              │   Supabase BaaS   │
              │ ┌───┐ ┌───┐ ┌───┐│
              │ │Auth│ │DB │ │Stg││
              │ └───┘ └───┘ └───┘│
              │     ┌────────┐   │
              │     │Edge Fn │   │
              │     │(Report)│   │
              │     └────────┘   │
              └──────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────┴────┐  ┌──────┴──────┐  ┌───┴───┐
    │Anthropic│  │ NVIDIA NIM  │  │Gemini │
    │OpenAI   │  │ OpenRouter  │  │       │
    └─────────┘  └─────────────┘  └───────┘
```

## 7. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| PWA | Service Worker (serwist/next-pwa), Cache-First shell |
| Base de Datos | Supabase PostgreSQL + RLS |
| Storage | Supabase Storage (buckets: captures, reports) |
| Auth | Supabase Auth (email/password, magic link) |
| Edge Functions | Deno (Supabase Edge Functions) |
| AI Providers | NVIDIA NIM, OpenRouter, Anthropic, OpenAI, Google Gemini |
| Testing | Vitest + fast-check (property-based testing) |
| Hosting | Vercel (frontend), Supabase (backend) |
| Package Manager | pnpm (obligatorio, versiones pinneadas) |

## 8. Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Tiempo de primer uso | < 30s desde abrir el link hasta tomar la primera foto |
| Carga offline | Shell interactivo en < 3s (3G) |
| Precisión del triaje | ≥ 80% concordancia con evaluación de ingeniero en categoría de riesgo |
| Adopción post-sismo | 1000+ reportes en las primeras 48h de un evento M5+ |

## 9. Restricciones y Fuera de Alcance

**Fuera de alcance (v1):**
- Modelos de segmentación pixel a pixel (DeepCrack, U-Net)
- Medición real de dimensiones de grieta (requiere LiDAR o calibración)
- Integración con CRM de ingenieros
- Notificaciones push
- Multi-idioma (solo español en v1)

**Restricciones:**
- No es un reemplazo de inspección profesional (disclaimer legal obligatorio)
- La app NO emite diagnósticos — emite triaje preliminar
- Cumple con habeas data colombiano (Ley 1581 de 2012)

## 10. Roadmap

| Fase | Alcance | Estado |
|------|---------|--------|
| v1.0 | MVP: captura + análisis AI + reportes + offline | ✅ Completado |
| v1.1 | Cuestionario estructural + motor de reglas | ✅ Completado |
| v2.0 | Segmentación con modelos especializados (HuggingFace) | Planificado |
| v2.1 | Calibración real con referencia visual | Planificado |
| v3.0 | Dashboard para ingenieros + webhook CRM | Planificado |
