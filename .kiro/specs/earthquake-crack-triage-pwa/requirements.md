# Requirements Document

## Introduction

Earthquake Crack Triage PWA is a Progressive Web App designed for earthquake emergency response in Cali, Colombia. The system provides preliminary AI-driven crack triage for buildings to reduce citizen uncertainty and prioritize technical attention when expert engineer availability has collapsed. The app captures legally-relevant metadata (GPS, timestamps, device angles) so generated reports can serve as supporting documentation for local authorities (Risk Management) and insurance companies. It operates as a mobile-first, zero-friction experience accessible via direct web link without app stores.

## Glossary

- **PWA**: Progressive Web App — a web application installable on mobile devices that works offline and provides native-like experience without app store distribution.
- **Triage_App**: The earthquake crack triage PWA system as a whole.
- **Photo_Capture_Module**: The component responsible for capturing images of building cracks along with device sensor metadata (GPS, tilt angle, timestamp).
- **AI_Service**: The modular adapter component (`aiService.ts`) that routes crack analysis requests to either user-provided API keys or public fallback AI providers.
- **Report_Generator**: The Supabase Edge Function responsible for producing immutable PDF reports with integrity hashes.
- **Local_Cache**: The browser-based temporary storage layer (IndexedDB/Service Worker cache) that preserves data during network intermittencies.
- **BYOK**: Bring Your Own Key — a mode where advanced users supply their own AI provider API key for detailed forensic analysis.
- **Fallback_Mode**: The emergency/public mode that routes AI requests to free or low-cost multimodal models (OpenRouter, NVIDIA NIM) when no user API key is configured.
- **Integrity_Hash**: A cryptographic hash (SHA-256) computed over report content and metadata to prove the report has not been altered after generation.
- **Risk_Level**: A categorical classification of crack severity (e.g., Low, Medium, High, Critical) assigned by the AI analysis.
- **Sensor_Metadata**: Device orientation data (alpha, beta, gamma angles) captured at the moment of photograph to document the physical angle of the camera.
- **RLS**: Row Level Security — Supabase/PostgreSQL feature that restricts database row access based on authenticated user identity.

## Requirements

### Requirement 1: PWA Installation and Offline Access

**User Story:** As a citizen in an earthquake-affected area, I want to access the triage tool instantly from a web link on my phone, so that I can assess building damage without downloading from an app store.

#### Acceptance Criteria

1. THE Triage_App SHALL be installable as a PWA on mobile devices running Chrome (Android 8+) or Safari (iOS 14+) via the browser's "Add to Home Screen" prompt.
2. WHILE the application shell is cached by the Service Worker, THE Triage_App SHALL render an interactive interface (navigation, photo capture button, and connectivity status indicator) within 3 seconds on a 3G connection (1.6 Mbps download, 400ms RTT).
3. WHILE the device has no network connectivity, THE Triage_App SHALL display the full application shell (navigation, photo capture screen, and previously cached reports list) and allow photo capture with Local_Cache storage supporting a minimum of 50 captured photos before indicating storage is full.
4. WHEN network connectivity is restored, THE Triage_App SHALL initiate background synchronization of all locally cached data within 5 seconds and complete each item's upload to the Supabase backend within 30 seconds per item.
5. IF synchronization of a cached item fails after 3 retry attempts, THEN THE Triage_App SHALL retain the item in Local_Cache, display a notification indicating which items failed to sync, and reattempt synchronization on the next connectivity restoration event.

### Requirement 2: Photo Capture with Sensor Metadata

**User Story:** As a citizen documenting building damage, I want the app to automatically capture GPS location, timestamp, and device angle when I take a photo, so that my evidence has legal and insurance validity.

#### Acceptance Criteria

1. WHEN the user captures a photo, THE Photo_Capture_Module SHALL record the GPS coordinates (latitude and longitude) with a minimum storage precision of 6 decimal places and a maximum acceptable horizontal accuracy of 50 meters as reported by the Geolocation API.
2. WHEN the user captures a photo, THE Photo_Capture_Module SHALL record the device orientation (alpha, beta, gamma angles) from the most recent DeviceOrientation API reading sampled within 500 milliseconds before the capture event.
3. WHEN the user captures a photo and network is available, THE Photo_Capture_Module SHALL request a certified server timestamp from the Supabase backend within a timeout of 5 seconds and associate it with the captured image.
4. IF the server timestamp request fails or the device is offline at the moment of capture, THEN THE Photo_Capture_Module SHALL record the local device timestamp, mark it as unverified, and request a certified server timestamp upon next synchronization to associate with the image.
5. IF the device GPS is unavailable or the reported horizontal accuracy exceeds 50 meters, THEN THE Photo_Capture_Module SHALL display a persistent visual notification indicating that geolocation metadata is missing or unreliable and allow the capture to proceed without GPS data.
6. IF the DeviceOrientation API is unavailable, THEN THE Photo_Capture_Module SHALL proceed with capture and mark the Sensor_Metadata orientation fields as unavailable in the report.

### Requirement 3: User Authentication

**User Story:** As a citizen, I want to create an account quickly so that my reports are associated with my identity for legal purposes.

#### Acceptance Criteria

1. THE Triage_App SHALL provide authentication via Supabase Auth using email/password and magic link methods, enforcing a minimum password length of 8 characters and a maximum of 128 characters.
2. WHEN a user registers, THE Triage_App SHALL create a user profile linked to the authenticated identity within the Supabase database within 5 seconds of successful authentication.
3. THE Triage_App SHALL enforce Row Level Security policies so that each user can access only their own reports and images.
4. WHEN an unauthenticated user attempts to access protected resources, THE Triage_App SHALL redirect the user to the authentication screen within 1 second.
5. IF registration fails due to a duplicate email address or invalid input, THEN THE Triage_App SHALL display an error message indicating the reason for failure without exposing internal system details, and SHALL preserve any data the user entered in the registration form.
6. WHEN a magic link is sent, THE Triage_App SHALL expire the link after 60 minutes, and IF an expired or already-used magic link is accessed, THEN THE Triage_App SHALL display an error message indicating the link is no longer valid and offer to send a new one.
7. WHILE a user session is active, THE Triage_App SHALL maintain the authenticated state for a maximum of 7 days before requiring re-authentication.

### Requirement 4: Image Storage and Data Persistence

**User Story:** As a citizen, I want my photos and reports stored securely in the cloud, so that I do not lose evidence if my device is damaged or lost.

#### Acceptance Criteria

1. WHEN a photo is captured and network is available, THE Triage_App SHALL upload the image (maximum 10 MB per file) to Supabase Storage within 60 seconds of capture.
2. WHEN a photo is uploaded successfully or when synchronization of a locally cached photo completes, THE Triage_App SHALL store all associated report metadata (GPS coordinates, Sensor_Metadata, timestamps, Risk_Level) in the Supabase PostgreSQL database.
3. WHILE network is unavailable, THE Local_Cache SHALL retain captured images and metadata in IndexedDB until synchronization succeeds, up to a maximum of 50 pending items.
4. WHEN the Supabase backend returns a success acknowledgment for an uploaded item, THE Local_Cache SHALL remove that item from local storage.
5. THE Triage_App SHALL enforce Supabase Storage bucket policies so that uploaded images are accessible only to the owning user and authorized system processes (Supabase Edge Functions).
6. IF an image upload fails after 3 retry attempts, THEN THE Triage_App SHALL retain the image in Local_Cache, display an error indication to the user stating upload failed, and reattempt upload on next network availability change.
7. IF the Local_Cache reaches its maximum capacity of 50 pending items, THEN THE Triage_App SHALL display a warning to the user indicating local storage is full and prevent further captures until at least one item is synchronized.

### Requirement 5: AI-Powered Crack Analysis (BYOK Mode)

**User Story:** As a technical user or engineer, I want to use my own AI provider API key for detailed forensic crack analysis, so that I get higher-quality results from my preferred model.

#### Acceptance Criteria

1. WHERE the BYOK mode is selected, THE AI_Service SHALL accept and securely store the user's API key in encrypted form within the browser session (never transmitted to the application backend).
2. WHERE the BYOK mode is selected, WHEN a photo is submitted for analysis, THE AI_Service SHALL route the request directly to the user-configured AI provider (Anthropic Claude or OpenAI) with a maximum timeout of 60 seconds.
3. WHEN the AI provider returns a response, THE AI_Service SHALL parse the response and assign a Risk_Level classification (Low, Medium, High, or Critical) to the analyzed crack.
4. IF the user-provided API key is invalid or the provider returns an authentication error, THEN THE AI_Service SHALL notify the user with a descriptive error message and offer to retry or switch to Fallback_Mode.
5. IF the AI provider does not respond within 60 seconds, THEN THE AI_Service SHALL abort the request, notify the user of the timeout, and offer to retry or switch to Fallback_Mode.
6. IF the AI provider returns a response that cannot be parsed into the expected Risk_Level structure, THEN THE AI_Service SHALL reject the response, log the parsing failure, and return a structured error to the user.

### Requirement 6: AI-Powered Crack Analysis (Fallback Mode)

**User Story:** As a regular citizen without an API key, I want the app to analyze my crack photos for free using available public AI models, so that I can get a preliminary risk assessment without technical setup.

#### Acceptance Criteria

1. IF no user API key is configured, THEN THE AI_Service SHALL route analysis requests to the Fallback_Mode using free or low-cost multimodal providers (OpenRouter or NVIDIA NIM).
2. WHEN a photo is submitted in Fallback_Mode, THE AI_Service SHALL send the image to the configured fallback provider and return a Risk_Level classification (Low, Medium, High, or Critical) within 30 seconds of submission.
3. IF a fallback provider does not respond within 15 seconds or returns a rate-limit error, THEN THE AI_Service SHALL attempt the next configured fallback provider in priority order.
4. IF all fallback providers are unavailable, THEN THE AI_Service SHALL display a message to the user indicating that analysis is temporarily unavailable, store the photo in Local_Cache, and automatically retry analysis when network connectivity is restored or within 15 minutes, whichever comes first.
5. WHEN the Fallback_Mode analysis completes successfully, THE AI_Service SHALL validate the provider response against the expected schema before returning the Risk_Level to the user.

### Requirement 7: AI Service Adapter Architecture

**User Story:** As a developer maintaining the system, I want a modular AI service adapter, so that new AI providers can be added without modifying existing code paths.

#### Acceptance Criteria

1. THE AI_Service SHALL implement a provider adapter interface that accepts an image payload (maximum 10 MB) and returns a structured analysis result containing: Risk_Level (Low, Medium, High, or Critical), a textual description (maximum 2000 characters), and a confidence indicator.
2. THE AI_Service SHALL select between BYOK provider and Fallback_Mode provider based on whether a user API key is configured: if a key is present, route to BYOK; otherwise, route to Fallback_Mode.
3. THE AI_Service SHALL validate all AI provider responses against a Zod schema before returning results to the caller.
4. IF an AI provider response fails Zod schema validation, THEN THE AI_Service SHALL reject the response, return a structured error indicating the validation failure to the caller, and not pass the invalid data downstream.
5. THE AI_Service SHALL log provider selection and response outcome (success or failure with error category) for each analysis request, without logging sensitive API keys or image data.
6. THE AI_Service SHALL allow registration of a new provider adapter by implementing the provider interface without requiring modifications to the routing logic or existing adapter code.

### Requirement 8: Immutable PDF Report Generation

**User Story:** As a citizen filing claims with authorities or insurance, I want an official PDF report with all evidence and metadata, so that it can serve as legally-valid supporting documentation.

#### Acceptance Criteria

1. WHEN a user requests report generation, THE Report_Generator SHALL produce a PDF document within 30 seconds containing: the crack photo, GPS coordinates (if available), certified server timestamp, device Sensor_Metadata (if available), AI-assigned Risk_Level, and textual analysis.
2. THE Report_Generator SHALL compute an Integrity_Hash (SHA-256) over the complete PDF binary content and embed the hash as readable text in the PDF footer.
3. THE Report_Generator SHALL execute as a Supabase Edge Function to ensure server-side generation with trusted timestamps.
4. WHEN the report PDF is generated, THE Report_Generator SHALL store the PDF in Supabase Storage, record the Integrity_Hash in the reports database table, and return a download URL accessible only to the authenticated report owner.
5. IF report generation fails because the crack photo, certified server timestamp, AI-assigned Risk_Level, or textual analysis is missing, THEN THE Report_Generator SHALL return an error response listing each missing required field and not produce a partial report.
6. IF the Report_Generator successfully produces the PDF but fails to store it in Supabase Storage or record the Integrity_Hash in the database, THEN THE Report_Generator SHALL retry the storage operation once and, if still unsuccessful, return an error indicating storage failure without delivering the report to the user.
7. IF report generation exceeds 30 seconds, THEN THE Report_Generator SHALL abort the operation and return an error indicating a timeout.

### Requirement 9: Input Validation and Security

**User Story:** As a system administrator, I want all inputs validated and secrets protected, so that the system is resilient against injection attacks and credential exposure.

#### Acceptance Criteria

1. THE Triage_App SHALL validate all user inputs and API payloads against corresponding Zod schemas at the service boundary before any further processing, and reject payloads that do not conform.
2. THE Triage_App SHALL store all sensitive configuration values (Supabase keys, fallback AI provider keys) exclusively in environment variables, never in client-side code.
3. THE Triage_App SHALL sanitize file names by allowing only alphanumeric characters, hyphens, underscores, and periods, stripping all other characters, and enforcing a maximum file name length of 255 characters. THE Triage_App SHALL truncate metadata strings to a maximum of 1024 characters before storage.
4. WHEN a validation error occurs, THE Triage_App SHALL return a structured error response with field-level error descriptions without exposing internal system details (stack traces, file paths, database identifiers, or internal service names).
5. IF a validated input contains characters outside the permitted set after sanitization results in an empty or invalid value, THEN THE Triage_App SHALL reject the request and return an error response indicating which field failed sanitization.

### Requirement 10: Privacy Protection

**User Story:** As a citizen in a vulnerable situation, I want my home location and personal data protected, so that my privacy is not compromised during the emergency.

#### Acceptance Criteria

1. THE Triage_App SHALL not expose GPS coordinates or home addresses in any publicly accessible endpoint or interface.
2. THE Triage_App SHALL restrict report and image access exclusively to the authenticated owner via RLS policies.
3. THE Triage_App SHALL not include personally identifiable information (name, email, phone) in the AI analysis request payload sent to external providers.
4. WHEN sharing a report externally (PDF download), THE Triage_App SHALL include only the data explicitly chosen by the user for inclusion.
5. THE Triage_App SHALL strip EXIF metadata from images before sending them to external AI providers to prevent leakage of device or location information beyond what is explicitly captured by the Photo_Capture_Module.

### Requirement 11: Database Schema and RLS Policies

**User Story:** As a developer, I want a well-structured database schema with proper security policies, so that data integrity and access control are enforced at the database level.

#### Acceptance Criteria

1. THE Triage_App SHALL maintain a `users` table linked to Supabase Auth (`auth.users`) via foreign key, containing at minimum: id (references auth.users.id), email, display_name, and created_at fields.
2. THE Triage_App SHALL maintain a `reports` table containing: user_id (foreign key referencing users.id, NOT NULL), GPS coordinates, Sensor_Metadata (JSON), server_timestamp, Risk_Level, AI analysis text, Integrity_Hash, and image storage path.
3. THE Triage_App SHALL enable Row Level Security on both the `users` and `reports` tables so that no row is accessible without an active RLS policy granting access.
4. THE Triage_App SHALL enforce RLS policies on the `reports` table so that SELECT, INSERT, UPDATE, and DELETE operations are restricted to rows where `user_id` matches the authenticated user's identity (`auth.uid()`).
5. THE Triage_App SHALL enforce RLS policies on the `users` table so that each authenticated user can SELECT and UPDATE only their own row (where `id = auth.uid()`), and INSERT is permitted only during initial profile creation for the authenticated user's own id.
6. WHEN a user performs an INSERT on the `reports` table, THE Triage_App SHALL enforce via RLS policy that the `user_id` column value equals the authenticated user's identity (`auth.uid()`), preventing insertion of reports attributed to other users.

### Requirement 12: Offline-First Synchronization

**User Story:** As a citizen in a disaster area with intermittent connectivity, I want the app to work reliably regardless of network status, so that I can document damage at any time.

#### Acceptance Criteria

1. THE Triage_App SHALL register a Service Worker that caches application shell assets (HTML, CSS, JavaScript, and icons required to render the app layout) for offline access.
2. WHILE the device is offline, WHEN the user captures a photo, THE Local_Cache SHALL store the image and all associated metadata (timestamp, geolocation, user-entered description, and assessment category) in IndexedDB within 2 seconds of capture.
3. WHEN network connectivity is detected after an offline period, THE Triage_App SHALL initiate background synchronization of all pending items in chronological order (oldest first), using the Background Sync API where supported, with a maximum of 3 retry attempts per item and a timeout of 30 seconds per item.
4. THE Triage_App SHALL display a connectivity status indicator (online, offline, or syncing) that updates within 3 seconds of a connectivity state change and remains visible on all screens without requiring user interaction to reveal.
5. IF a synchronization conflict occurs (server-side data newer than local), THEN THE Triage_App SHALL preserve both versions, display a notification indicating the number of conflicting items, and mark each conflicting item with a visual indicator distinguishing it from non-conflicting items.
6. IF the local storage quota is exceeded while the device is offline, THEN THE Triage_App SHALL display an error message indicating that storage is full, prevent the capture action, and retain all previously stored items without data loss.
7. IF a synchronization attempt fails after exhausting all 3 retry attempts for an item, THEN THE Triage_App SHALL retain the item in the local queue, mark it as failed, and display a notification indicating the number of items that could not be synchronized.
