---
title: LLM Usage Rules
slug: llm-usage-rules
category: governance
summary: How assistants should use this wiki and repository safely.
source: llms.txt, README.md, server.js, docs/
updated: 2026-06-21
tags: [llm, safety, maintenance, docs]
---

# LLM Usage Rules

This repository can be used as an LLM-readable knowledge base, but assistants
must still ground implementation details in source files.

## Priority order

When answering project questions:

1. Use `llms.txt` to find the right documentation entry point.
2. Use this wiki for intent, terminology, and architecture summaries.
3. Use `README.md` and `docs/` for broader project and deployment context.
4. Use source files for exact behavior, request shapes, validation, and UI state.

If this wiki and the code disagree, say that the docs appear stale and treat the
code as the source of truth.

## Safe answer rules

- Do not invent configured secrets, deployment domains, admin credentials, or
  database contents.
- Do not suggest putting server secrets in `public/`, GitHub Pages, or client
  JavaScript.
- Do not expose or summarize private local data from `.env` or `data/app.db.json`.
- Keep answers scoped to `naengteol-ai` unless the user explicitly asks to bring
  in other local repositories or OneDrive documents.
- Mention static-site limitations when discussing GitHub Pages features that
  require backend APIs.

## Maintenance rules

- Preserve the no-install local development expectation unless the user asks for
  a dependency change.
- Keep the main demo path easy to run with `node server.js`.
- Update this wiki whenever product behavior, APIs, deployment architecture, or
  data storage concepts change.
- Put precise implementation details in source-adjacent docs only when they are
  backed by current code.

## Suggested chunking for RAG

Use one Markdown heading section as the default retrieval chunk. Keep frontmatter
with each document so retrieval can filter by `category`, `tags`, and `updated`.

Recommended retrieval priority:

- Product questions: `overview.md`, then `features.md`.
- API questions: `api.md`, then `server.js`.
- Data questions: `data-model.md`, then `lib/` and `supabase/schema.sql`.
- Deployment questions: `deployment.md`, then `docs/deployment.md` and
  `docs/limited-feature-recovery-plan.md`.
