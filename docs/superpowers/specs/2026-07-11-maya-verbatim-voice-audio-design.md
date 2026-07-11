# Maya Verbatim Voice Audio Design

## Owner decision

Use browser speech synthesis for Maya's greeting and cited-answer playback. The spoken answer must be the exact visible answer returned by the governed forensics query route. No model paraphrase is permitted.

## Scope

- Applies to Maya overview and selected-evidence Voice queries.
- On Voice click, speak the time-appropriate greeting before microphone capture starts: "Good morning, Maya. How can I help you?", "Good afternoon, Maya. How can I help you?", or "Good evening, Maya. How can I help you?" Waiting for the greeting prevents Maya's own audio from being transcribed as the user's question.
- Continue using OpenAI Realtime only for microphone transcription.
- Continue using `/api/forensics/query` for the cited, scoped, live-agent answer.
- After an answered response passes existing citation and scope checks, speak that exact visible answer text.
- Stop, close, new query, and component teardown must cancel current speech.

## Safety and failure behavior

- Text remains the authoritative result and is always visible.
- Speech synthesis must never modify dollars, verdicts, routes, citations, or deterministic basis.
- Unsupported speech synthesis or playback failure must not fail or retry the query.
- Error, blocked, and uncited responses must not be spoken.
- Starting a new greeting or answer cancels any prior utterance.
- Greeting playback resolves on completion or audio error; unsupported speech proceeds directly to microphone capture.

## Implementation boundary

Add a small browser-only speech helper with injectable browser primitives for unit tests. The Maya query dock invokes it after microphone access is confirmed and after a governed answer is accepted. Do not add an API route, dependency, OpenAI TTS call, or Realtime answer-generation step.

## Verification

- Unit tests pin morning, afternoon, and evening greeting selection.
- Unit tests prove exact answer text is passed unchanged to speech synthesis.
- Unit tests prove unsupported browsers fail silently and cancellation is invoked.
- Browser tests cover overview and selected-evidence Voice, visible text parity, greeting invocation, answer invocation, and Stop/close cancellation.
- Existing live Voice citation, scope, and model-execution tests remain green.
