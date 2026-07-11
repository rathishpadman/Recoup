# Maya Verbatim Voice Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore spoken Maya Voice answers and add a time-based greeting without changing the governed transcription, query, citation, or decision path.

**Architecture:** Browser speech synthesis is a presentation-only adapter. The greeting completes before microphone capture begins, OpenAI Realtime remains transcription-only, `/api/forensics/query` remains the authoritative live-agent answer path, and only the exact visible cited answer is spoken.

**Tech Stack:** TypeScript, React, Web Speech API, Vitest, Playwright browser QA.

---

### Task 1: Browser speech adapter

**Files:**
- Create: `cockpit/app/browser-speech.ts`
- Create: `tests/unit/browser-speech.test.ts`

- [ ] **Step 1: Write the failing greeting and verbatim-playback tests**

```ts
expect(mayaGreetingForHour(9)).toBe("Good morning, Maya. How can I help you?");
expect(mayaGreetingForHour(14)).toBe("Good afternoon, Maya. How can I help you?");
expect(mayaGreetingForHour(20)).toBe("Good evening, Maya. How can I help you?");
await speakExactBrowserText("Cited answer.", fakeSpeech);
expect(fakeSpeech.spokenTexts).toEqual(["Cited answer."]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run tests/unit/browser-speech.test.ts`

Expected: FAIL because `browser-speech.ts` does not exist.

- [ ] **Step 3: Implement the browser-only adapter**

```ts
export function mayaGreetingForHour(hour: number): string;
export async function speakExactBrowserText(text: string, runtime?: BrowserSpeechRuntime): Promise<void>;
export function cancelBrowserSpeech(runtime?: BrowserSpeechRuntime): void;
```

The adapter cancels prior speech, resolves on `onend` or `onerror`, returns immediately when unsupported, and never changes the supplied text.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run tests/unit/browser-speech.test.ts`

Expected: all adapter tests pass.

### Task 2: Maya query dock integration

**Files:**
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Modify: `tests/invariants/maya-shadcn-boundary.test.ts`
- Modify: `tests/unit/realtime-browser-session.test.ts` only if the existing session contract needs an assertion update; no Realtime behavior change is permitted.

- [ ] **Step 1: Write failing integration-contract tests**

Assert that the dock:

```ts
await speakExactBrowserText(mayaGreetingForHour(new Date().getHours()));
const realtimeSession = await startRealtimeBrowserSession({ mode: "transcription_only", ... });
```

and, after `nextSnapshot.status === "answered"`, speaks:

```ts
displayAnswerWithoutInlineRecordIds(nextSnapshot.answer, [
  ...nextSnapshot.recordIds,
  ...nextSnapshot.citations.map((citation) => citation.recordId)
]);
```

The test also asserts Stop, close, new query, and unmount call `cancelBrowserSpeech()`.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npx vitest run tests/invariants/maya-shadcn-boundary.test.ts`

Expected: FAIL because the dock has no speech adapter calls.

- [ ] **Step 3: Implement minimal dock wiring**

Cancel prior speech at session reset. Await the greeting before starting microphone capture. Speak only an answered snapshot with a non-empty, citation-approved answer. Keep blocked/error/uncited states silent.

- [ ] **Step 4: Run focused Voice tests and verify GREEN**

Run: `npx vitest run tests/unit/browser-speech.test.ts tests/unit/realtime-browser-session.test.ts tests/invariants/maya-shadcn-boundary.test.ts`

Expected: all Voice tests pass with Realtime still in `transcription_only` mode.

### Task 3: Regression and browser verification

**Files:**
- Modify: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Add browser speech spies for overview and selected evidence**

```ts
await page.addInitScript(() => {
  window.__speechLog = [];
  window.speechSynthesis = {
    cancel: () => window.__speechLog.push("cancel"),
    speak: (utterance) => {
      window.__speechLog.push(utterance.text);
      utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
    }
  } as SpeechSynthesis;
});
```

Assert the greeting precedes the Realtime request, the spoken answer equals visible `maya-query-assistant-answer` text, and Stop/close records cancellation.

- [ ] **Step 2: Run browser and repository gates**

Run:

```text
npm run lint
npm run typecheck
npm run test
npm run verify
```

Expected: all checks pass; no existing Maya/David journey regression.

- [ ] **Step 3: Run local human-visible verification**

Verify `http://localhost:3100/forensics/shadcn` for overview and selected evidence: greeting, microphone transcription, exact cited spoken answer, visible text parity, and Stop cancellation.

- [ ] **Step 4: Senior review and production gate**

Run a read-only senior critique over the diff. Production movement requires the existing owner approval plus green local browser evidence; after deployment, repeat both Voice paths on `https://recoup-self-eta.vercel.app/forensics/shadcn`.
