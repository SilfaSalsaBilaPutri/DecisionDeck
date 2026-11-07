# DecisionDeck — Stage 1 MVP

## What to build
- Replace the placeholder at `/` with an Indonesian DecisionDeck experience aligned with the supplied product brief.
- Add account registration, login, logout, and protected private decision pages using Lovable Cloud Auth.
- Build the private decision-list workflow: manual create, AI-assisted draft from meeting notes, review/edit, save, detail, edit, delete, keyword search, filters, tags, and external links.
- Persist records in the five specified Stage 1 tables with per-user access policies; preserve original AI source notes and never auto-finalize AI output.
- Keep Stage 2 semantic Q&A and team sharing out of scope.
- Maintain `coldstart.md` as a living specification: log each approved stack/product decision and implementation milestone, and leave unverified checklist items unchecked.

## Implementation approach
1. Establish semantic design tokens and shared app/auth layout in the existing TanStack Start project; preserve the approved calm, professional Indonesian product direction.
2. Create the Stage 1 database schema and ownership protections through Lovable Cloud migrations, following the supplied table design and RLS rules.
3. Implement auth and profile creation using the configured Cloud Auth providers; protect private pages and all data operations.
4. Deliver the main vertical slice: create a decision manually, list/search/filter records, inspect details, edit, and delete.
5. Add AI meeting-note summarization as an editable draft with the 10,000-character limit, retained source, and manual fallback; then add tags and safe HTTP(S) references.
6. Verify the main flows, responsive views, tests/build signals, and update the living cold-start document and roadmap with actual outcomes.

## Technical details
- Framework: existing TanStack Start v1; TypeScript; Tailwind CSS v4; do not migrate to Next.js.
- Backend: Lovable Cloud PostgreSQL/Auth. Use generated clients, authenticated server functions, user-derived ownership, RLS, explicit table grants, and migrations; do not create Supabase Edge Functions.
- Routing: file-based routes under `src/routes/`; authenticated content under the managed `_authenticated` layout.
- AI calls must remain server-side through Lovable AI Gateway; pasted meeting notes are untrusted input and must not be logged unnecessarily.
- Stage 1 only: no workspace/membership model, embeddings, Q&A, or shared access.
