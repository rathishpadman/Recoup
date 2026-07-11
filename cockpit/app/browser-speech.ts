export interface BrowserSpeechRuntime {
  cancel(): void;
  speak(text: string, onComplete: () => void, onError: () => void): void;
}

const activePlaybackSettlers = new WeakMap<BrowserSpeechRuntime, () => void>();
let defaultBrowserSpeechRuntime: BrowserSpeechRuntime | undefined;
export const browserSpeechPlaybackTimeoutMs = 5_000;

export function mayaGreetingForHour(hour: number): string {
  if (hour < 12) {
    return "Good morning, Maya. How can I help you?";
  }
  if (hour < 18) {
    return "Good afternoon, Maya. How can I help you?";
  }
  return "Good evening, Maya. How can I help you?";
}

export async function speakExactBrowserText(
  text: string,
  runtime: BrowserSpeechRuntime | undefined = readBrowserSpeechRuntime()
): Promise<void> {
  if (text.trim().length === 0 || runtime === undefined) {
    return;
  }

  try {
    cancelBrowserSpeech(runtime);
    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          if (activePlaybackSettlers.get(runtime) === settle) {
            activePlaybackSettlers.delete(runtime);
          }
          resolve();
        }
      };
      const timeoutId = setTimeout(settle, browserSpeechPlaybackTimeoutMs);
      activePlaybackSettlers.set(runtime, settle);
      try {
        runtime.speak(text, settle, settle);
      } catch {
        settle();
      }
    });
  } catch {
    // Speech is optional presentation; the governed text answer remains authoritative.
  }
}

export function cancelBrowserSpeech(runtime: BrowserSpeechRuntime | undefined = readBrowserSpeechRuntime()): void {
  if (runtime === undefined) {
    return;
  }

  const settleActivePlayback = activePlaybackSettlers.get(runtime);
  try {
    runtime.cancel();
  } catch {
    // Browser speech failures must not affect the query lifecycle.
  } finally {
    settleActivePlayback?.();
  }
}

function readBrowserSpeechRuntime(): BrowserSpeechRuntime | undefined {
  if (
    typeof window === "undefined" ||
    typeof window.speechSynthesis === "undefined" ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return undefined;
  }

  defaultBrowserSpeechRuntime ??= {
    cancel: () => {
      window.speechSynthesis.cancel();
    },
    speak: (text, onComplete, onError) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = onComplete;
      utterance.onerror = onError;
      window.speechSynthesis.speak(utterance);
    }
  };

  return defaultBrowserSpeechRuntime;
}
