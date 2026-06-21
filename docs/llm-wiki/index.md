---
title: LLM Wiki Index
slug: llm-wiki-index
category: navigation
summary: Entry point and reading order for the 냉장고 재료 LLM wiki.
source: README.md, server.js, docs/
updated: 2026-06-21
tags: [llm, wiki, index, navigation]
---

# LLM Wiki Index

This wiki turns the existing 냉장고 재료 repository into a compact knowledge
base for LLM-assisted maintenance, search, summarization, and future RAG work.
It describes intent and architecture. Source files remain the authority for
exact runtime behavior.

## Recommended reading order

1. [Overview](overview.md): product purpose, users, and core demo flow.
2. [Features](features.md): user-facing capabilities and current limits.
3. [API](api.md): server routes and caller expectations.
4. [Data Model](data-model.md): local JSON and Supabase-backed storage.
5. [Deployment](deployment.md): static frontend and backend deployment shape.
6. [LLM Usage](llm-usage.md): how an assistant should use this wiki safely.

## Main source map

| Topic | Primary source |
| --- | --- |
| Product promise | `README.md` |
| API routing and validation | `server.js` |
| Browser UI | `public/` |
| Local persistence | `lib/local-db.js` |
| Supabase persistence | `lib/supabase-db.js`, `supabase/schema.sql` |
| Deployment setup | `docs/deployment.md`, `docs/limited-feature-recovery-plan.md` |

## Scope

The wiki covers the `naengteol-ai` app only. The earlier OneDrive Git repository
contains separate document and lecture materials and is not part of this initial
knowledge base.
