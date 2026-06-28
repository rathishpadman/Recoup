# Governed Agent Memory and Maya Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add governed Maya short-term memory and polish the Recoup Agent query experience without changing deterministic decision behavior.

**Architecture:** Memory is explicit, scoped, cited, and visible through existing memory stores. Query/session memory is written as `session_state` only; it cannot feed dollars, verdicts, routing, approvals, or external actions. UI changes are presentation-only and keep backend/read-model data as the source of truth.

**Tech Stack:** Node 22, TypeScript, Express, Next.js App Router, React, Vitest, Playwright.

---

## Phases

- [x] **Phase 1: Governed short-term Maya query memory**
  - Add typed helpers in `src/memory/session.ts` for a selected Maya query scope.
  - Persist scope from `POST /forensics/query` using existing safe `x-recoup-session-id`.
  - Keep memory write additive and non-decision-making.
  - Tests: `tests/unit/memory.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/invariants/memory-contract.test.ts`.

- [x] **Phase 2: Maya chat and overview visual polish**
  - Move `RecoupAgentLauncher` to a fixed bottom-left floating chat affordance.
  - Give the launcher a distinct professional accent treatment.
  - Make the Case concentration title darker and larger than table/body content.
  - Modernize `QueryEvidenceDock` visual hierarchy without changing request/response semantics.
  - Tests: `tests/e2e/cockpit-premium-e2e.ts`, `tests/invariants/maya-shadcn-qa-contract.test.ts`.

- [x] **Phase 3: Local verification**
  - Run focused unit/invariant tests for memory.
  - Run focused Maya E2E for launcher/query/overview.
  - Run `npm run verify` before commit.

- [x] **Phase 4: Review**
  - Subagent spec review for memory/UI scope.
  - Subagent code-quality review for changed files.
  - Resolve all Critical/Important findings.

- [ ] **Phase 5: Commit, push, and production smoke**
  - Stage only intentional files.
  - Commit.
  - Push to the active deploy branch only after local verification.
  - Run read-only production smoke for health, login, Maya work item, RAG vector evidence, memory visibility, and query fail-closed behavior.

- [x] **Phase 6: Consolidated Maya journey test guide**
  - Create a Markdown test guide covering Maya login, eight-case journey, RAG vector evidence, governed memory, query chat, approval lifecycle, audit receipt, and production smoke.

## Non-Negotiables

- Memory records require cited `recordIds`.
- Memory payloads must not include direct PII, secrets, question free text, dollar amounts, verdicts, routing, or approval mutations.
- Missing memory must never block the query answer path unless a configured durable memory write is explicitly required by the existing backend.
- RAG remains additive/env-gated.
- No ERP writeback.
- No hidden prompt memory.
