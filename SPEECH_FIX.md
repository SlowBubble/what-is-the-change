# Chrome Web Speech API Fix

## The Problem

`window.speechSynthesis.speak()` silently stalls in Chrome. The utterance is queued
(`pending=true`) but never starts — `onstart` and `onend` never fire, and no audio plays.
This happens on both `file://` and `http://` origins and affects Chrome on macOS.

Symptoms in the test page:
- `paused=false`, `speaking=false`, `pending=false` right after calling `speak()` — the
  utterance vanished without a trace.
- No `onstart`, no `onend`, no `onerror`.

## What Doesn't Work

| Approach | Result |
|---|---|
| Plain `speak()` | Utterance silently dropped |
| `cancel()` then `speak()` | `onerror: canceled` — cancel kills the new utterance too |
| `speak()` inside `setTimeout(0)` | Still silently dropped |
| Serving over HTTP instead of `file://` | No difference |

## The Fix

Call `speechSynthesis.resume()` on a repeating interval while the utterance is speaking.
Chrome's TTS engine silently pauses itself; `resume()` kicks it back awake.

```js
function speak(text, onEnd) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1;

  let keepAlive;
  const startKeepAlive = () => {
    keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
      window.speechSynthesis.resume(); // resume() alone — no pause() to avoid static
    }, 250);
  };

  utt.onstart = startKeepAlive;
  utt.onend = () => {
    clearInterval(keepAlive);
    if (onEnd) onEnd();
  };
  utt.onerror = (e) => {
    clearInterval(keepAlive);
    // 'canceled' fires when cancel() clears a queued utterance — not a real error
    if (e.error !== 'canceled' && onEnd) onEnd();
  };

  window.speechSynthesis.speak(utt);
}
```

## Why `pause()` + `resume()` Causes Static

An earlier attempt used `pause()` followed by `resume()` every 250ms. This does work
(Chrome resumes), but the `pause()` call interrupts the audio stream and creates an
audible click/static artifact on each cycle. Using `resume()` alone avoids touching the
audio stream when it isn't actually paused, so the speech plays cleanly.

## Why `cancel()` at the Top

`cancel()` before `speak()` ensures that if a new utterance is triggered while one is
already playing (e.g. the user types a new answer mid-sentence), the old speech stops
immediately. The `onerror: canceled` event that fires on the interrupted utterance is
expected and ignored.
