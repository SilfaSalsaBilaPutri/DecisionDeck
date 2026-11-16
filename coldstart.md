# DecisionDeck — Cold Start Specification

Version: 1.2 — Lovable implementation adaptation
Owner: Silfa Salsabila Putri
Consolidation date: 3 November 2026
Implementation decision date: 7 November 2026 UTC
Category: Produktivitas Kolaboratif berbasis AI
Platform: Responsive Web (Lovable)
Language: Bahasa Indonesia; user content may be Indonesian or English.
Status: Planning specification; not a claim of completed implementation or passing tests.
Stack: TanStack Start, React, TypeScript, Tailwind CSS v4, PostgreSQL via Lovable Cloud / Supabase. Next.js is not supported by this Lovable project. Neon was not selected.
Auth baseline: Supabase Auth.

> This document consolidates the approved PRD, persona, flows, wireframes, schema and visual direction. Stage 1 is a private decision log for an individual working in a team, not a shared team workspace. Stage 2 is optional and must not block Stage 1 delivery.

## Implementation decisions and change log

- 7 November 2026: User approved continuing in Lovable. Use TanStack Start (the supported framework), TypeScript, Tailwind CSS v4, and Lovable Cloud / Supabase PostgreSQL. The DecisionDeck product scope remains Stage 1 MVP; optional Stage 2 stays deferred. No application code had been changed when this decision was recorded.
- 16 November 2026: Enabled Lovable Cloud's Password HIBP Check so new and changed passwords are rejected when present in known breach lists. This applies to the app's email/password signup and platform-managed password changes; existing passwords are not retroactively checked.
- Update this document whenever an implementation decision or product change is made; keep unfinished acceptance criteria explicitly unchecked.

## 1. Ide Produk

DecisionDeck helps people record important decisions and find their context and rationale later. Users can write decisions manually or paste meeting notes for an AI-generated draft that they review before saving.

Value proposition: Simpan keputusan. Temukan kembali alasannya.

Core loop:

```text
Login → write decision or paste notes → review draft → add metadata/tags/links
→ save → search/filter later → inspect decision, rationale and source
```

Scope principle: prioritize a simple end-to-end flow over integrations, real-time collaboration, or autonomous AI.

## 2. PRD

### 2.1 Problems

- Decisions are scattered across chats and meeting notes.
- New or absent teammates repeatedly request context.
- Old decisions are difficult to locate.
- Reasons and background behind decisions are not consistently documented.

Stage 1 goal: store decisions with rationale and sources, accelerate drafting with AI, and retrieve records using keywords and filters.
Stage 2 goal: optional source-backed AI Q&A over saved decisions.

### 2.2 Users and assumptions

- Primary: PMs, tech leads and team leads working in startups, agencies and remote teams, originally targeting teams of 5–30 people.
- Secondary audience: founders and team members who need decision context.
- Actual Stage 1 access model: one private account-owned dataset; no invitations or shared access.
- Notes are pasted manually, not imported automatically.
- AI assists summarization, not decision-making.
- UI is Indonesian; pasted content may be bilingual.
- Owner is a textual responsible-person name, not a permission-bearing team member.

### 2.3 Stage 1 features — required

| Priority | Feature | Acceptance criteria |
|---|---|---|
| P1 | Decision Record CRUD | Create/read/edit/delete title, context, decision, rationale, owner, date, status and tags. Filter by status/tag/date. |
| P2 | AI Context Summarizer | Paste up to 10,000 characters; produce editable draft; user can reject/save; source stored on save. |
| P3a | Keyword Search | Find records using title, content and tag names. |
| P4 | Tag & Filter | Create/select tags and filter by status, tag, decision date and owner. |
| P5 | External Links | Add/remove clickable references to Notion, Linear, Google Docs or other HTTP(S) URLs. No sync. |

### 2.4 Stage 2 — optional

P3b: AI Q&A semantic search with pgvector. Answer based only on accessible records, with clickable record references; state insufficient evidence when relevant information is missing. Do not present unsupported text as sourced.

Disclaimer: Jawaban dibuat dari decision records yang tersimpan; verifikasi sumber sebelum digunakan untuk keputusan penting.

Stage 2 is not part of Stage 1 schema/migration requirements. No chat history or multi-turn chatbot is required.

### 2.5 Out of scope

- Zoom/Meet/Slack transcription and imports.
- Slack/Discord bots.
- Task synchronization with Linear/Notion/Jira.
- Workspace switching, team invitations, membership or complex RBAC.
- Autonomous decisions or recommendations without human input.
- Version history, recycle bin, comments, real-time coediting.
- Automatic Slack/email notifications for new records.
- Native mobile apps, multilingual UI.
- Export PDF/CSV inside the product.
- Custom decision templates and action-item task boards.

### 2.6 Success criteria and schedule

Stage 1 succeeds when a user can log in, save a manual or reviewed AI-assisted decision with source, tag/link it, find it using keywords/filters, edit it and delete it.
Stage 2 succeeds when a user can ask a question, inspect cited records and receive an explicit no-answer state when evidence is insufficient.

Prior planning target: Stage 1 about 5 working days; optional Stage 2 another 3–5 working days. These are estimates, not delivery guarantees; testing, setup and experience affect completion time.

## 3. User Persona

Rani Pramesti — fictional design persona, not interview evidence.

| Attribute | Detail |
|---|---|
| Age / location | 29 / Bandung |
| Role | Product Manager at a startup with 12 team members |
| Work pattern | Hybrid and asynchronous |
| Devices | Laptop for records; smartphone for reading |
| Skills | Familiar with Docs, Notion, Slack and task tools |
| Existing workflow | Meeting notes in documents; summaries shared through chat |

Goal: find the decision and its rationale without opening many conversations.

Needs:
1. Consistent title, context, conclusion, rationale, owner, date and status.
2. AI draft from lengthy meeting notes.
3. Review/edit before saving.
4. Keyword search and filters.
5. Links to existing documents and tasks.
6. Original source for verification.

Main pain: “Saya ingat tim pernah membahas masalah ini, tetapi sulit menemukan apa keputusan akhirnya dan kenapa kita memilih opsi tersebut.”

Frustrations: conclusions mixed with proposals; scattered notes; missing rationale; repetitive context requests; potentially inaccurate AI summaries.
Motivations: save administrative time, prepare context for future discussions, retrieve earlier decisions.
Scenario: paste pricing meeting notes → review AI draft → add Pricing tag, owner and reference → save → later search pricing and inspect rationale.

## 4. User Flow

### 4.1 Entry and authentication

| Step | Action | Page/state | Result |
|---|---|---|---|
| 1 | Open app | Landing | Value proposition, Start/Login |
| 2 | Register if new | Register | Account created through chosen provider |
| 3 | Finish registration | Dashboard empty | Private dataset, Create First Decision CTA |
| 4 | Return and log in | Login → Dashboard | Own decisions visible |

Active session goes directly to Dashboard. No workspace setup wizard is required.

### 4.2 AI-assisted creation

| Step | Action | Page/state | Result |
|---|---|---|---|
| 5 | Create Decision | Create page | Manual / From Notes choice |
| 6 | Choose From Notes | Input Notes | Textarea and character counter |
| 7 | Paste notes | Input Notes | Max 10,000 characters |
| 8 | Generate Draft | Processing | Input retained; duplicate submit blocked |
| 9 | Review generated draft | Review form | Title/context/decision/rationale editable |
| 10 | Compare with source | Source section | Correct incomplete/inaccurate details |
| 11 | Fill owner/date/status/tags | Metadata | User decides final status |
| 12 | Add optional references | Link section | Label and HTTP(S) URL |
| 13 | Save | Decision Detail | Record and original notes persisted |

AI must not invent a final decision when notes only contain discussion. Use Proposed until the human supplies a conclusion. Draft remains temporary until Save; discarding it does not require a database row.

### 4.3 Manual creation

Create Decision → Tulis Manual → fill decision fields → add tags/links → Save → Detail. Manual creation works even if AI provider is unavailable.

### 4.4 Retrieval

Dashboard → enter keyword → inspect results → add filters → open Detail → read decision/rationale → expand Source Notes → optionally open external reference in new tab. Goal achieved when context is recovered.

### 4.5 Edit/delete

Detail → Edit → update fields/tags/links → Save → Detail.
Detail → Delete confirmation → confirm → Dashboard. No historical version is retained.

### 4.6 Optional Stage 2

Tanya AI → question → retrieval in own records → answer plus references → open Detail to verify. No relevant evidence → explicit no-answer and keyword-search CTA. Do not show this menu before feature is enabled.

### 4.7 Alternatives

- Too-long notes: inline limit validation.
- AI failure: retain notes; Retry or Continue Manually.
- Unsaved changes: confirm before discard/mode switch.
- No search results: Reset Search/Filters CTA.
- Load/save failure: safe error, retry, retain form where possible.

## 5. Wireframe — Ordered Elements

Focus: structure and information hierarchy, not decorative styling.

### 5.1 Shared navigation

Public: logo → Cara Kerja → Login → Mulai.
Authenticated: logo → Keputusan → optional Tanya AI → Buat Keputusan → account name / Logout.
No workspace switcher, invitations or role-management screens.

### 5.2 Landing

1. Header/navigation.
2. Hero: “Simpan keputusan. Temukan kembali alasannya.”, description, Mulai Mencatat, Cara Kerja.
3. Problem cards: scattered decisions, missing context, missing rationale.
4. How it works: paste/manual → review/save → search later.
5. Stage 1 feature overview.
6. Final CTA: Buat Akun.
7. Footer; policy/terms links only if actual pages are supplied.

Do not advertise optional Q&A as already available.

### 5.3 Register

1. Logo/back to landing.
2. Title and private-account explanation.
3. Name, email, password and visibility toggle.
4. Inline validation.
5. Buat Akun.
6. Registration failure area.
7. Login link.

If provider requires verification, show verification instructions instead of assuming immediate session access. Baseline auth is Supabase Auth; do not add a second parallel auth system.

### 5.4 Login

1. Logo/back.
2. Title.
3. Email.
4. Password and visibility.
5. Login.
6. Failure area.
7. Register link.

Loading disables duplicate submits. Provider recovery screens may be reused if password recovery is configured; no custom auth dashboard required.

### 5.5 Dashboard / Decision List

1. App header.
2. “Keputusan Saya”, description and Create CTA.
3. Search field, Search button, clear action.
4. Filters: status / tag / owner / date range / Reset.
5. Result count and active filters.
6. Decision cards/list: title, excerpt, status, owner, date, tags, Detail.
7. Previous/Next pagination when needed.

Empty account: welcome → explanation → Create First Decision. Hide unnecessary search/filter UI until records exist.
Empty results: no-match message → current query/filter summary → Reset → Create.

### 5.6 Create Decision — Mode selection

1. App header.
2. Breadcrumb.
3. Title.
4. Manual / From Meeting Notes selector.
5. Selected input area.

Both modes reuse one decision form. Confirm before mode switch that would discard input.

### 5.7 Notes input

1. Header/mode.
2. Instructions and human-review notice.
3. Notes textarea.
4. Character counter /10,000.
5. Empty/over-limit inline validation.
6. Buat Draft AI.
7. Batal.

Processing retains notes. Error shows Retry / Continue Manually without clearing notes.

### 5.8 Manual / Review Draft form

1. Header.
2. AI draft review banner only when applicable.
3. Title.
4. Context textarea.
5. Decision textarea.
6. Rationale textarea.
7. Owner name, decision date, status selector.
8. Tag selection, new tag input, Add, removable selected tags.
9. Reference label/URL, Add Link, removable links.
10. Collapsible original source when AI-assisted.
11. Validation summary as needed.
12. Cancel / Save Decision.

No task board, automatic final approval, or autonomous decision creation.

### 5.9 Decision Detail

1. App header/breadcrumb.
2. Title, status, Edit, Delete.
3. Owner/date/tags.
4. Context.
5. Decision.
6. Rationale.
7. External links opening in new tab.
8. Collapsible source notes when available.
9. Back to list.

No comments, version history or share-access controls.

### 5.10 Edit Decision

1. App header/breadcrumb.
2. Edit title.
3. Existing title/context/decision/rationale.
4. Owner/date/status.
5. Tags.
6. References.
7. Read-only original source when present.
8. Notice: last version is replaced; no version history.
9. Cancel / Save Changes.

Do not silently replace original notes with a generated summary. Creation method remains original metadata.

### 5.11 Supporting dialogs/states

Delete: title → decision name → deletion explanation → Cancel / Delete.
Unsaved changes: title → warning → Continue Editing / Leave.
Save feedback: created/updated/deleted toast; errors preserve form input.
Not found/unauthorized: safe message → Dashboard; no private record details.

### 5.12 Optional AI Q&A

1. App header/title.
2. Scope explanation: own saved records only.
3. Verification disclaimer.
4. Question field and example questions.
5. Cari Jawaban.
6. Processing state.
7. Answer and source list (title/status/date/record link).
8. No-answer state with keyword-search CTA.
9. Retry on error.

Single question and active answer; no chat history or model picker.

### 5.13 Responsive behavior

Desktop: navigation → content → filters above list; metadata may sit side by side.
Mobile: compact header/menu → title/CTA → search → Filter panel button → stacked cards; forms single-column.
Shared: keyboard access, visible focus, labelled inputs, accessible dialogs, inline errors and understandable loading states.

## 6. Database Schema — Stage 1

### 6.1 Conventions

Five application tables: user_profiles, decisions, tags, decision_tags, decision_links.
- snake_case, plural table names.
- UUID keys; default gen_random_uuid() except auth-linked profile ID.
- date for decision date; timestamptz for timestamps.
- NN below means NOT NULL; NULL means optional.
- created_at/updated_at default now(). updated_at requires a trigger or explicit server update.
- No workspaces, membership, ai_summaries, embeddings or Q&A tables in Stage 1.

### 6.2 user_profiles

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK; FK auth.users(id) |
| full_name | text | NN; nonempty after trim |
| created_at | timestamptz | NN default now() |
| updated_at | timestamptz | NN default now() |

Email/password belong to Auth; do not duplicate credentials. Create profile through registration trigger/server flow. Supabase Auth chosen instead of the earlier optional NextAuth note.

### 6.3 decisions

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK default gen_random_uuid() |
| user_id | uuid | NN FK user_profiles(id) |
| title | text | NN; nonempty after trim |
| context | text | NN default '' |
| decision_text | text | NN default '' |
| rationale | text | NN default '' |
| owner_name | text | NN; nonempty after trim |
| decision_date | date | NN default CURRENT_DATE |
| status | text | NN default 'proposed'; proposed/decided/superseded |
| creation_method | text | NN default 'manual'; manual/ai_assisted |
| source_notes | text | NULL; maximum 10,000 characters |
| created_at | timestamptz | NN default now() |
| updated_at | timestamptz | NN default now() |

Additional constraints:
- UNIQUE(id, user_id) for composite ownership FKs.
- AI-assisted requires nonempty source_notes.
- Decided/Superseded require nonempty decision_text.
- Proposed may lack final conclusion.
- source_notes preserves original pasted text.
- superseded is a label only; no required replacement-record link.

### 6.4 tags

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK default gen_random_uuid() |
| user_id | uuid | NN FK user_profiles(id) |
| name | text | NN; trimmed, nonempty |
| created_at | timestamptz | NN default now() |

UNIQUE(id, user_id) for ownership FK.
Unique per user using lower(btrim(name)); Pricing and pricing are the same tag for that user. Different users can use the same name. No tag_type required.

### 6.5 decision_tags

| Column | Type | Constraints |
|---|---|---|
| decision_id | uuid | Composite PK component |
| tag_id | uuid | Composite PK component |
| user_id | uuid | NN FK user_profiles(id) |
| created_at | timestamptz | NN default now() |

```sql
PRIMARY KEY (decision_id, tag_id)
FOREIGN KEY (decision_id, user_id) REFERENCES decisions(id, user_id) ON DELETE CASCADE
FOREIGN KEY (tag_id, user_id) REFERENCES tags(id, user_id) ON DELETE CASCADE
```

Composite FKs prevent mixing users' tags and decisions. Removing a tag association does not delete the tag or decision. Deleting a tag deletes associations only.

### 6.6 decision_links

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK default gen_random_uuid() |
| decision_id | uuid | NN |
| user_id | uuid | NN FK user_profiles(id) |
| label | text | NULL |
| url | text | NN; HTTP(S) only |
| display_order | integer | NN default 0 CHECK >= 0 |
| created_at | timestamptz | NN default now() |

```sql
FOREIGN KEY (decision_id, user_id) REFERENCES decisions(id, user_id) ON DELETE CASCADE
```

Validate URL in server/application; reject javascript/data schemes. Do not fetch/index external content. Delete/add is sufficient to replace a reference in MVP.

### 6.7 Relationships

```text
auth.users 1 ── 0..1 user_profiles
user_profiles 1 ── N decisions
user_profiles 1 ── N tags
decisions 1 ── N decision_links
decisions 1 ── N decision_tags
tags 1 ── N decision_tags
```

Both decision_tags and decision_links also have user_id → user_profiles.id. Composite keys additionally guarantee consistent ownership across linked rows.

### 6.8 Index plan

```sql
CREATE INDEX decisions_user_date_idx ON decisions(user_id, decision_date DESC);
CREATE INDEX decisions_user_status_idx ON decisions(user_id, status);
CREATE INDEX decisions_user_owner_idx ON decisions(user_id, owner_name);
CREATE UNIQUE INDEX tags_user_name_unique_idx ON tags(user_id, lower(btrim(name)));
CREATE INDEX decision_tags_user_tag_idx ON decision_tags(user_id, tag_id);
CREATE INDEX decision_links_decision_idx ON decision_links(decision_id, display_order);
```

These snippets are not full migrations. Define tables/PKs/unique constraints first. Avoid creating duplicate indexes already supplied by constraints.

### 6.9 Keyword search and filters

- Parameterized ILIKE on title, context, decision_text, rationale and tags.name.
- Search returns distinct decisions, not duplicate rows for multiple matching tags.
- Filter status, tag, decision_date range and owner_name.
- Apply user isolation before retrieving any result.
- No semantic embeddings required; optimize substring search later only if necessary.
- Recommended initial UI semantics: keyword matches any search field; active filters combine with AND; one tag filter at a time. This is an implementation default, not a new feature.

## 7. Security and Persistence Rules

- RLS on every application table.
- user_profiles access where id = auth.uid().
- Other rows accessed where user_id = auth.uid(); enforce USING and WITH CHECK appropriately.
- user_id derived from verified session, not trusted request payload.
- owner_name never grants access.
- No anonymous access to decision data.
- API/provider/service-role keys server-only; never expose in client bundles.
- Verify authorization on server actions, AI calls and object IDs.
- Save decision, tags/associations and links in a transaction. Avoid partial saves.
- Update existing records transactionally with related link/tag changes.
- Delete decision → cascade links/associations; source notes removed with record.
- Delete tag → associations removed, decisions retained.
- Account deletion behavior is not a requested UI feature; specify FK cleanup deliberately before enabling account deletion.

### AI-specific rules

- Validate 10,000-character limit server-side as well as client-side.
- Treat pasted notes as untrusted data, not system instructions.
- Use structured output and validate fields before rendering/editing.
- Never auto-save AI output or auto-mark Decided.
- Keep source text unchanged; allow manual fallback.
- Inform user that notes are sent to an external AI provider; avoid logging sensitive source text unnecessarily.
- Add basic per-account request limits to control cost. Exact limit is a deployment configuration decision.
- Provider/model configurable; earlier GPT-4o-mini was an example, not a required fixed model.

## 8. Approved Style and Mood

Mood: clean, calm & professional.
Purpose: quiet, readable decision content with a restrained modern accent. Avoid playful decoration, heavy gradients and unnecessary animation.

| Role | Hex | Use |
|---|---|---|
| Primary | #4F46E5 | CTA, links, selected navigation |
| Main text | #0F172A | Title, decision, rationale |
| Background | #F8FAFC | Page background |
| Surface | #FFFFFF | Cards, forms, dialogs |
| Secondary text | #475569 | Metadata, labels, descriptions |
| Primary hover | #4338CA | Hover state |
| Decorative border | #E2E8F0 | Dividers and nonessential card boundaries |

```css
:root {
  --color-primary: #4F46E5;
  --color-primary-hover: #4338CA;
  --color-text: #0F172A;
  --color-text-secondary: #475569;
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-border: #E2E8F0;
}
```

Typography: Tailwind font-sans / system stack is approved for MVP. Inter is optional later, not a required dependency.

```css
font-family: ui-sans-serif, system-ui, sans-serif;
```

| Element | Initial size | Weight |
|---|---|---|
| Page title | 24–28px | 600–700 |
| Decision title | 20–24px | 600 |
| Body / rationale | 16px | 400 |
| Form labels / buttons | 14–16px | 500–600 |
| Metadata | 14px | 400 |

Long-form content: line-height around 1.6 and constrained reading width.
Accessibility targets: normal text 4.5:1; large text 3:1; meaningful UI boundaries/focus 3:1 as applicable. White text on primary; dark text on pale/white surfaces. Decorative light borders alone must not identify form controls. Always show status labels, not only colors.

Reference links (mood inspiration, not copied layouts):
- [Linear](https://linear.app/)
- [Notion](https://www.notion.com/)
- [Slite](https://slite.com/)

## 9. Suggested Routes and Components

| Route | Stage | Purpose |
|---|---|---|
| / | 1 | Landing |
| /register | 1 | Register |
| /login | 1 | Login |
| /dashboard | 1 | Combined decision list/search/filter |
| /decisions/new | 1 | Manual / AI creation modes |
| /decisions/[id] | 1 | Detail |
| /decisions/[id]/edit | 1 | Edit |
| /ask | 2 only | Optional source-backed Q&A |

Dashboard/decision routes require authentication and record ownership. Recovery/verification callback routes follow the chosen Supabase Auth setup.

Reusable components: AppShell, DecisionList, DecisionCard, SearchBar, FilterBar, DecisionForm, NotesInput, SourceNotesPanel, TagSelector, ExternalLinksEditor, DeleteDialog, UnsavedChangesDialog, EmptyState, LoadingState, ErrorState.

## 10. Implementation Sequence

1. Use the Lovable TanStack Start / TypeScript / Tailwind v4 project; configure Lovable Cloud Auth and protected routing.
2. Create five tables, constraints, RLS and profile registration flow.
3. Implement manual decision CRUD as one complete vertical slice.
4. Add tags, external links, keyword search and filters.
5. Add server-only AI draft endpoint, validation and manual fallback.
6. Complete detail/edit/source views and responsive states.
7. Test isolation, input handling, failed requests and production build.
8. Update this document to match the actual implementation.
9. Only after Stage 1 works, separately scope pgvector retrieval and Q&A.

Do not add shared-workspace memberships, workspaces or embeddings preemptively.

## 11. Acceptance Checklist / Definition of Done

### Functional
- [ ] New user can register, verify if required, log in and log out.
- [ ] Active session opens Dashboard.
- [ ] Manual create/read/edit/delete works.
- [ ] Notes max length enforced in browser and server.
- [ ] AI draft can be edited/rejected without saving.
- [ ] Saved AI-assisted record retains original source.
- [ ] No final conclusion is invented when source lacks one.
- [ ] Tag case-insensitive uniqueness works per user.
- [ ] Keyword search includes tag names without duplicate results.
- [ ] Status/tag/date/owner filters work together.
- [ ] Links add/remove and open safely; no content synchronization.
- [ ] Edit replaces current record; no version history implied.
- [ ] Cancel/mode-switch warns about unsaved work.
- [ ] AI failure retains notes and permits manual fallback.

### Security / quality
- [x] Known-leaked password protection enabled in Lovable Cloud Auth.
- [ ] User A cannot read/change User B records or attach B tags/links.
- [ ] Composite ownership constraints and RLS tested with real authenticated contexts.
- [ ] Transactions prevent partial saves.
- [ ] Secrets absent from client bundles and source control.
- [ ] Input validation and safe rendering tested; user notes are not executable instructions.
- [ ] Keyboard/mobile/loading/error/empty states tested.
- [ ] Lint, type-check, production build and fresh database migrations pass.

Definition of Done: approved Stage 1 flows work in the actual environment with persisted data, tested access isolation, documented configuration and known limitations. Do not label unchecked items completed.

## 12. Explicit Boundaries and Pending Configuration

Approved: private per-user data, five tables, Supabase Auth baseline, no team sharing, system font, indigo/slate palette, optional Q&A deferred.

Configuration to decide during implementation, without changing product scope:
- AI provider/model and per-user usage limit.
- Email verification and provider-supported password recovery behavior.
- Deployment environment and required environment variables.
- Exact pagination size and default date in the intended user timezone.

The project name/category refers to a team-productivity use case; Stage 1 itself is not a multi-user collaborative workspace. Adding shared access later requires a new membership/authorization design and approval.

---
End of Cold Start Specification — DecisionDeck v1.2
