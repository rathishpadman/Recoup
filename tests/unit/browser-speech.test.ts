import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserSpeechPlaybackTimeoutMs,
  cancelBrowserSpeech,
  mayaGreetingForHour,
  speakExactBrowserText,
  type BrowserSpeechRuntime
} from "../../cockpit/app/browser-speech.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser speech presentation adapter", () => {
  it.each([
    [0, "Good morning, Maya. How can I help you?"],
    [11, "Good morning, Maya. How can I help you?"],
    [12, "Good afternoon, Maya. How can I help you?"],
    [17, "Good afternoon, Maya. How can I help you?"],
    [18, "Good evening, Maya. How can I help you?"],
    [23, "Good evening, Maya. How can I help you?"]
  ])("selects the governed greeting for hour %i", (hour, expected) => {
    expect(mayaGreetingForHour(hour)).toBe(expected);
  });

  it("speaks the exact supplied cited answer without rewriting it", async () => {
    const spokenTexts: string[] = [];
    const cancel = vi.fn();
    const runtime: BrowserSpeechRuntime = {
      cancel,
      speak: (text, onComplete) => {
        spokenTexts.push(text);
        onComplete();
      }
    };
    const answer = "Harbor Foods requires review. Evidence: SAP-AR-17.";

    await speakExactBrowserText(answer, runtime);

    expect(cancel).toHaveBeenCalledOnce();
    expect(spokenTexts).toEqual([answer]);
  });

  it("cancels prior speech before playback and waits for completion", async () => {
    const events: string[] = [];
    let complete: (() => void) | undefined;
    const runtime: BrowserSpeechRuntime = {
      cancel: () => {
        events.push("cancel");
      },
      speak: (_text, onComplete) => {
        events.push("speak");
        complete = onComplete;
      }
    };
    let resolved = false;

    const playback = speakExactBrowserText("Exact cited answer.", runtime).then(() => {
      resolved = true;
    });
    await Promise.resolve();

    expect(events).toEqual(["cancel", "speak"]);
    expect(resolved).toBe(false);
    expect(complete).toBeTypeOf("function");
    complete?.();
    await playback;
    expect(resolved).toBe(true);
  });

  it("resolves after playback error and remains silent when browser speech is unsupported", async () => {
    const runtime: BrowserSpeechRuntime = {
      cancel: vi.fn(),
      speak: (_text, _onComplete, onError) => {
        onError();
      }
    };

    await expect(speakExactBrowserText("Cited answer.", runtime)).resolves.toBeUndefined();
    await expect(speakExactBrowserText("Cited answer.", undefined)).resolves.toBeUndefined();
  });

  it("cancels speech without surfacing browser failures", () => {
    const runtime: BrowserSpeechRuntime = {
      cancel: vi.fn(() => {
        throw new Error("browser speech unavailable");
      }),
      speak: vi.fn()
    };

    expect(() => {
      cancelBrowserSpeech(runtime);
    }).not.toThrow();
  });

  it("settles active playback when cancelled even if the browser emits no terminal callback", async () => {
    const runtime: BrowserSpeechRuntime = {
      cancel: vi.fn(),
      speak: vi.fn()
    };

    const playback = speakExactBrowserText("Exact cited answer.", runtime);
    await Promise.resolve();
    cancelBrowserSpeech(runtime);

    await expect(playback).resolves.toBeUndefined();
  });

  it("settles after the approved timeout when the browser emits no terminal callback", async () => {
    vi.useFakeTimers();
    const runtime: BrowserSpeechRuntime = {
      cancel: vi.fn(),
      speak: vi.fn()
    };
    let resolved = false;
    const playback = speakExactBrowserText("Good morning, Maya. How can I help you?", runtime).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(browserSpeechPlaybackTimeoutMs - 1);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(playback).resolves.toBeUndefined();
    expect(resolved).toBe(true);
  });

  it("settles replaced playback without letting its late callback cancel the replacement", async () => {
    const completions: Array<() => void> = [];
    const runtime: BrowserSpeechRuntime = {
      cancel: vi.fn(),
      speak: (_text, onComplete) => {
        completions.push(onComplete);
      }
    };

    const firstPlayback = speakExactBrowserText("First cited answer.", runtime);
    await Promise.resolve();
    const secondPlayback = speakExactBrowserText("Second cited answer.", runtime);
    await firstPlayback;
    completions[0]?.();
    let secondResolved = false;
    void secondPlayback.then(() => {
      secondResolved = true;
    });
    await Promise.resolve();

    expect(secondResolved).toBe(false);
    completions[1]?.();
    await expect(secondPlayback).resolves.toBeUndefined();
  });

  it("settles default browser playback when a later default cancellation emits no callback", async () => {
    class FakeSpeechSynthesisUtterance {
      readonly text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }
    const speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn()
    };
    vi.stubGlobal("window", { speechSynthesis });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);

    const playback = speakExactBrowserText("Good morning, Maya. How can I help you?");
    await Promise.resolve();
    cancelBrowserSpeech();

    await expect(playback).resolves.toBeUndefined();
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(2);
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
  });
});
