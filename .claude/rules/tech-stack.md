# Tech stack rule

Develop the project **only** with the stack on slide 10 of the presentation ("Proposed Tech Stack"). Do not introduce any other framework, database, cache or runtime.

| Layer | Allowed |
|---|---|
| Frontend | React or Next.js, Tailwind CSS, mobile-friendly web app, role-based dashboards |
| Backend and data | Node.js with Express, PostgreSQL, Redis (alerts and caching), JWT login |
| Smart integrations | OCR for image questions, vector search for Smart Notes, email and push notifications |

## How to apply

- New back-end code is Node.js + Express. Not Django, Flask, FastAPI, Spring or similar. Data goes in PostgreSQL (SQLite is acceptable only as a throwaway local dev fallback), caching and alert queues in Redis, authentication with JWT.
- New front-end code is React/Next.js with Tailwind. No other UI kit or CSS framework (Bootstrap, MUI, Chakra, styled-components).
- Small helper libraries inside that stack (charts, icons, date handling) are fine; a new database, message broker, framework or language is not. If a feature seems to need one, stop and ask first.
- Machine-learning work (the risk model, SHAP) is a separate offline pipeline described in the presentation; keep it out of the web runtime and expose results to the app through the Express API.

## Known exception

`acadex-backend/` is a Django service adapted from MU-CONNECT for the Student Community module. It predates this rule and does not follow the stack. Do not add new modules or features to it; when asked to work on the community back end, propose porting it to Express + PostgreSQL first.
