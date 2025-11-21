# AI Medical Analysis Backend

This repository is a minimal but robust demo backend for extracting and structuring information from medical documents (PDFs and images). It accepts uploads, runs OCR, optionally calls an AI extraction service (OpenAI) to produce structured JSON, and stores report metadata and results in MongoDB. A background worker (Agenda) processes reports asynchronously. A simple single-page demo UI in `public/` exercises the entire flow: register/login → upload → processing → view results.

**Quick start**

- Install dependencies:

```powershell
npm install
```

- Create a `.env` file with the required environment variables (see Environment section).

- For quick testing without OpenAI/system binaries (recommended for first run):

```powershell
# Run with mock AI and no system binaries required
$env:USE_MOCK_AI = "true"; npm run dev
```

- For production-like flow, ensure system binaries are installed for PDF→image conversion (e.g., `pdftoppm` from Poppler, `qpdf` or Ghostscript if you expect to repair PDFs) and set `USE_MOCK_AI=false`.

**Environment variables**

- `MONGO_URL` — MongoDB connection string.
- `PORT` — server port (default `3000`).
- `JWT_SECRET` — secret for signing access tokens.
- `REFRESH_TOKEN_SECRET` — secret for refresh tokens (if separate).
- `OPENAI_API_KEY` — OpenAI API key (optional if `USE_MOCK_AI=true`).
- `USE_MOCK_AI` — set to `true` to avoid calling OpenAI and heavy binaries (recommended for local testing).
- `COOKIE_SECURE` — `true`/`false` to set secure cookie flag (use `false` in local development over HTTP).
- `NODE_ENV` — `development` or `production` (affects secure cookie flag and logging).

**Sample .env**

Create a `.env` file at the project root with values appropriate for your environment. NEVER commit real secrets to source control.

Example `.env` (for local development / mock mode):

```env
# MongoDB connection (replace with your DB URI)
MONGO_URL=mongodb://localhost:27017/ai_med

# Server port
PORT=3000

# JWT secrets (use long random strings in production)
JWT_SECRET=your_jwt_secret_here
REFRESH_TOKEN_SECRET=your_refresh_secret_here

# OpenAI API key (optional when USE_MOCK_AI=true)
OPENAI_API_KEY=sk-REPLACE_WITH_YOUR_KEY

# When true, worker and AI helpers use deterministic mock responses (quick demo)
USE_MOCK_AI=true

# If running locally over HTTP, set this to false. In production (HTTPS) set to true.
COOKIE_SECURE=false

# Node environment
NODE_ENV=development
```

When moving to production, set `USE_MOCK_AI=false`, provide a valid `OPENAI_API_KEY`, secure the cookie (`COOKIE_SECURE=true`) and use strong random secrets for `JWT_SECRET` and `REFRESH_TOKEN_SECRET`.

**Project Folder Structure**

- `index.js` — application entry point, server + Agenda startup coordination.
- `config/` — configuration helpers (e.g., `db.js`).
- `controllers/` — Express controllers for auth, reports, users.
  - `authController.js`, `reportController.js`, `userController.js`.
- `routers/` — route definitions mounted on Express.
- `middleware/` — middleware (`jwtauth.js`, `upload.js`).
- `models/` — Mongoose models (`user.js`, `report.js`).
- `utils/` — helper utilities for OCR and AI (`ocr.js`, `ai.js`).
- `workers/` — background worker / Agenda job definitions (`reportWorker.js`).
- `public/` — minimal demo frontend (upload UI, login/register, reports list).
- `uploads/` — uploaded documents stored on disk (DO NOT delete unless you know what you are doing).
- `archive/` — (optional) safe location to move unreferenced files (used by maintainer actions).

Notes: we added a `.gitignore` that ignores `uploads/`, `.env` and other local files; `archive/` is used by maintainers for safe moves.

**Project Flow (high level)**

1. Client uploads a document via `POST /api/v1/reports` (authenticated) or the demo UI's upload button. The server stores the file in `uploads/` and creates a `Report` document with status `PENDING`.
2. The server schedules a background job (Agenda) to process the report asynchronously.
3. Agenda worker picks up the job and invokes the OCR pipeline in `utils/ocr.js`:
  - If the file is a PDF and contains embedded text, `pdf-parse` extracts the text quickly.
  - If the PDF is scanned (image-only), the worker attempts to convert PDF pages to images using `pdftoppm` (from Poppler). If conversion is successful, Tesseract extracts text from images.
  - The pipeline includes best-effort repair attempts (qpdf/ghostscript) for some corrupted PDFs.
  - When `USE_MOCK_AI=true` the OCR and AI steps are short-circuited and deterministic/mock results are used for fast local testing without system binaries or OpenAI.
4. The extracted text is optionally sent to `utils/ai.js` which calls OpenAI to structure/extract clinical fields into JSON (or uses the mock).
5. The worker saves the result to the `Report` document in MongoDB and updates status to `DONE` (or `FAILED` if errors occur).
6. The frontend polls for status and shows results when available. Reports can be soft-deleted by the user (flagged but not removed from disk) via DELETE endpoint.

**APIs**

Base path: `/api/v1`

- **Auth**
  - `POST /api/v1/auth/register` — Register new user
    - Request body (JSON):
      ```json
      {
        "name": "Alice",
        "email": "alice@example.com",
        "password": "your-password"
      }
      ```
    - Response: HTTP 201 with `{ message, token }`. Password is hashed with `bcryptjs` before storing. (Server validates email format and minimal password length.)

  - `POST /api/v1/auth/login` — Login
    - Request body (JSON):
      ```json
      {
        "email": "alice@example.com",
        "password": "your-password"
      }
      ```
    - Response: sets an HttpOnly refresh cookie and returns a short-lived access token plus `user` object (password hash is never returned). The server compares the supplied password to the stored `bcrypt` hash.

    - Rate limiting: for security, login attempts are limited to 5 requests per minute per IP address. When the limit is exceeded the server returns HTTP 429 with message: `Too many login attempts. Try again in a minute.`

Client-side: the demo UI performs email validation, requires inputs, and shows inline red error messages under the correct form (Register vs Sign in) when validation or backend errors occur.

  - `POST /api/v1/auth/refresh-token` — Rotate/refresh access token (uses HttpOnly cookie)
    - No body required. Use the browser to send the cookie. Response contains a new access token.

  - `POST /api/v1/auth/logout` — Logout
    - Invalidates refresh cookie and tokens server-side as implemented.

- **Reports** (authenticated; send `Authorization: Bearer <accessToken>` or rely on refresh cookie for browser file fetches)
  - `POST /api/v1/reports` — Upload a report (multipart/form-data)
    - Form fields:
      - `file` — file to upload (PDF or image)
      - `title` — optional
      - `patientId` — optional
    - Example curl:
      ```bash
      curl -X POST "http://localhost:3000/api/v1/reports" \
        -H "Authorization: Bearer <ACCESS_TOKEN>" \
        -F "file=@/path/to/report.pdf" \
        -F "title=Chest X-ray" \
        -F "patientId=12345"
      ```
    - Response: report metadata with `status: PENDING` and `id`.
    - Demo UI notes: the upload button is disabled during upload, the file input label resets after a successful upload, and the UI polls the server for status updates (every ~3s).

  - `GET /api/v1/reports` — List my reports
    - Auth required
    - Response: array of my reports (excluding soft-deleted).

  - `GET /api/v1/reports/:id` — Get report metadata (status, timestamps)
    - Auth required; owner-only access

  - `GET /api/v1/reports/result/:id` — Get report extraction result JSON
    - Return the AI-extracted JSON (if `status` is `DONE`).

  - `GET /api/v1/reports/file/:id` — Serve the uploaded file
    - This endpoint supports browser access (cookie or Authorization) and streams the stored file inline.
    - Useful for previewing PDF/image in the browser.

  - `DELETE /api/v1/reports/:id` — Soft-delete a report (marks `deleted=true`) — Auth required
    - The file remains on disk; the report will no longer appear in `GET /api/v1/reports`.

**Models**

- `User` — basic fields: `name`, `email`, `password` (hashed with `bcryptjs`), `refreshToken`, role and timestamps.
- `Report` — fields include `owner` (user id), `filePath`, `title`, `status` (`PENDING`, `PROCESSING`, `DONE`, `FAILED`, `DELETED`), `result` (JSON), timestamps, and `deleted` boolean.

**Key files**

- `utils/ocr.js` — OCR pipeline (pdf-parse, optional reparations, `pdftoppm` conversion, Tesseract OCR)
- `utils/ai.js` — OpenAI integration with retry/backoff and mock mode support
- `workers/reportWorker.js` — Agenda job definitions and scheduling helper
- `middleware/jwtauth.js` — checks `Authorization` header and validates access tokens
- `middleware/upload.js` — multer wrapper with file type checks
- `public/` — demo frontend (single-page UI for signup/login/upload/list/preview)

Frontend highlights (`public/`):
- `public/app.js` includes a safe response parser that falls back to text when the backend returns non-JSON error bodies so messages are shown correctly.
- Inline auth messages are shown in `#reg-msg` and `#login-msg` and styled with `.auth-error` when errors occur.
- Upload flow disables the upload button while uploading and clears the file input and label after success.
- The UI exposes toasts and a preview modal for viewing uploaded files via `GET /api/v1/reports/file/:id`.

**Packages and why they are used**

- `express` — HTTP server and routing.
`mongoose` — MongoDB ORM for schema and model management.
`agenda` — Background job scheduling and processing.
`multer` — Handles multipart/form-data file uploads.
`tesseract.js` — JavaScript wrapper for Tesseract OCR (runs Node bindings where supported).
`pdf-parse` — Extract embedded text from PDFs quickly if present.
`openai` — official OpenAI Node SDK used for structuring/extracting fields when `USE_MOCK_AI=false`.
`dotenv` — load environment variables from `.env` during development.
`cookie-parser` — read and set cookies (refresh token cookie flow).
`jsonwebtoken` — create and verify JWT access tokens.
`bcryptjs` — hash and verify user passwords. (Uses a pure-JS implementation to avoid native build requirements.)
`express-rate-limit` — simple IP-based request rate limiting middleware used to protect the `/auth/login` endpoint from brute-force attacks (configured to 5 attempts/minute by default).
`cors` — enable cross-origin resource sharing for local frontend + API development.
`nodemon` (devDependency) — development tool to auto-restart the server when files change (used via `npm run dev`).
 - `nodemon` (devDependency) — development tool to auto-restart the server when files change (used via `npm run dev`).
- `cors` — enable cross-origin resource sharing for local frontend + API development.

Optional/system tools (not npm packages)

- `pdftoppm` (from Poppler) — converts PDF pages to images for Tesseract when PDFs are scanned images.
- `qpdf` or Ghostscript (`gs`) — used in the repo for repairing some broken PDFs prior to conversion (best-effort). These are optional but recommended if you process many PDFs.

**Why not Redis?**

This project currently uses MongoDB (via `mongoose`) as the primary data store and Agenda for background jobs, which stores job state in MongoDB. Choosing not to introduce Redis was deliberate for these reasons:

- **Single data-store simplicity**: Using MongoDB for both application data and job persistence reduces operational complexity (one datastore to configure, backup, and secure).
- **Agenda compatibility**: Agenda natively persists jobs in MongoDB and fits well with the existing models and workflows in this repo.
- **Persistence guarantees**: MongoDB-backed jobs remain durable across restarts without needing an additional service; this is helpful for long-running or retryable background work.
- **Avoid extra infra**: Redis would add another runtime dependency to install, monitor and secure. For a small-to-medium deployment or for local testing, keeping the stack minimal speeds setup.

When to consider Redis (or a Redis-based queue) in the future:

- If you need very high throughput/low-latency job processing, or complex rate-limiting and priority queues, a Redis-backed system (Bull / BullMQ / Bee-Queue) can be a better fit.
- If you want separate scaling characteristics for your job system (scale workers independently from the MongoDB cluster), introducing Redis may make sense.

If you'd like, I can sketch a migration plan to move job processing from Agenda/MongoDB to a Redis-backed queue (BullMQ) including data migration and minimal code changes.

**Common troubleshooting and notes**

- If you see OCR failures on PDFs, confirm that `pdftoppm` is installed and on `PATH`. When running without these binaries, set `USE_MOCK_AI=true` to run a fast demo without heavy dependencies.
- If Agenda fails to connect, ensure `MONGO_URL` is set and the database is reachable; Agenda startup was moved to run after DB connect to avoid early failures.
- Access tokens are short-lived; the frontend uses an HttpOnly refresh cookie to obtain new access tokens automatically (see `public/app.js`).

**Example: Full upload + check (using mock AI)**

1. Start server in mock mode:

```powershell
$env:USE_MOCK_AI = "true"; npm run dev
```

2. Register and login with the demo frontend at `http://localhost:3006/` or call the auth endpoints.

3. Upload a PDF using the `POST /api/v1/reports` endpoint (multipart/form-data). The response will contain the `id`.

4. Poll `GET /api/v1/reports/:id` for status; when `DONE`, call `GET /api/v1/reports/result/:id` to retrieve the extracted JSON.

**Reverting any archive/move actions**

If the maintainer moves files into `archive/`, they can be returned by moving from `archive/` back to the project root. Example PowerShell revert:

```powershell
Move-Item -Path "e:\AI Medical Analysis Backend\archive\eng.traineddata" -Destination "e:\AI Medical Analysis Backend\" -Force
```

**Further improvements / TODOs**

- Add tests for the OCR pipeline and worker flows.
- Add server-sent events (SSE) or WebSocket push for real-time job status updates instead of polling.
- Add role-based access and admin endpoints for job monitoring.

---

If you'd like, I can also:
- Add a small example `.env.example` file.
- Add curl-ready examples for each endpoint including expected responses.

