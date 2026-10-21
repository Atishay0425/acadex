# Tech stack rule

Build Acadex **only** with the stack on slide 10 of the presentation ("Proposed Tech Stack": simple, widely used tools that a student team can build and maintain). Nothing else.

| Layer | Allowed (exactly what the slide lists) |
|---|---|
| Frontend | React or Next.js, Tailwind CSS, mobile-friendly web app, role-based dashboards |
| Backend and data | Node.js with Express, PostgreSQL database, Redis for alerts and caching, secure login with JWT |
| Smart integrations | OCR for image questions, vector search for Smart Notes, email and push notifications |

## Languages

JavaScript only (Node.js on the server, React/Next.js in the browser), plus SQL for PostgreSQL and CSS via Tailwind. No TypeScript, Python, Java, PHP, Go or any other language in the app. Python is allowed only for the offline machine-learning pipeline (risk model, SHAP), which stays outside the web runtime and reaches the app through the Express API.

## How to apply

- Server code is Node.js + Express. Data goes in PostgreSQL, alert queues and caching in Redis, authentication with JWT.
- UI is React/Next.js + Tailwind. No other UI kit or CSS framework (Bootstrap, MUI, Chakra, styled-components).
- Small helper libraries inside this stack are fine (validation, hashing, charts, icons, dates, test tools). A new framework, database, message broker, runtime or language is not. If a feature seems to need one, stop and ask first.
- Do not port or extend the legacy Django service in `../acadex-backend/`; it is reference only.
