# Deepgram Accuracy Guide — GitConnect

## Current Configuration (as of v1.1.3)

All platforms (Windows, Linux, Web) now use:

| Setting | Value | Purpose |
|---|---|---|
| **model** | `nova-3` | Latest model, 53% lower WER than competitors |
| **language** | `en-US` | US English dialect for consistent vocabulary |
| **smart_format** | `true` | Auto-formats numbers, dates, currencies |
| **punctuate** | `true` | Automatic punctuation |
| **dictation** | `true` | Say "period", "comma", "new line" to insert punctuation |
| **interim_results** | `true` | Shows text as you speak (streaming only) |
| **utterance_end_ms** | `1000` | Detects end of utterance after 1s silence |
| **endpointing** | `300` | Finalizes speech after 300ms pause |
| **vad_events** | `true` | Voice Activity Detection events |

---

## Nova-3 vs Nova-2

Nova-3 is a major upgrade over Nova-2:

- **53.4% reduction** in word error rate (WER) for streaming
- **47.4% reduction** in WER for batch processing
- Enhanced domain-specific terminology comprehension
- First voice AI model with **self-serve customization** (instant vocabulary adaptation without retraining)
- Real-time multilingual conversation transcription
- Optional personal information redaction

Nova-3 model options:
- `nova-3` or `nova-3-general` — optimized for everyday audio
- `nova-3-medical` — optimized for medical vocabulary

---

## Dictation Mode (`dictation: true`)

When enabled, spoken punctuation commands are automatically converted:

| You Say | Output |
|---|---|
| "period" | `.` |
| "comma" | `,` |
| "colon" | `:` |
| "question mark" | `?` |
| "exclamation point" | `!` |
| "new line" | `\n` |
| "new paragraph" | `\n\n` |

**Requirement:** `punctuate: true` must also be enabled (it is by default).

Toggle this in **Settings → Voice Recognition → Dictation commands**.

---

## Keyword Boosting

Keywords boost recognition of uncommon words — proper nouns, product names, technical terms.

### How to Use
In **Settings → Voice Recognition → Keyword boosting**, enter comma-separated words:
```
GitConnect, OAuth, refactor, monorepo, Supabase
```

### How It Works
- Deepgram applies exponential boosting to recognize these words
- Up to **100 keywords** per request
- Spell words exactly as you want them in transcripts (capitalization matters)
- Works best for uncommon words the model hasn't seen often

### Best Practices
1. **Only boost uncommon words** — don't boost "the", "code", "function"
2. **Start with low intensifiers** — the default boost is usually enough
3. **Spell proper nouns correctly** — "GitConnect" not "git connect"
4. **Don't over-boost** — too many keywords or high intensifiers cause false positives
5. **Test incrementally** — add a few at a time and verify accuracy improves

### Technical Details
Keywords are sent as `keywords=WORD:INTENSIFIER` in the API request:
```
keywords=GitConnect:2&keywords=OAuth:1.5
```
- Intensifier `1` = default (no extra boost)
- Intensifier `2` = 2x exponential boost
- Intensifier `0` = no effect
- Negative intensifiers suppress words (Base models only)

---

## Custom Training for Atypical Speech Patterns

### Deepgram Custom Models (Enterprise Feature)

Deepgram offers custom model training through **MissionControl** for users with atypical speech patterns, accents, or specialized vocabulary:

1. **Record 50+ audio samples** of yourself saying phrases the model gets wrong
2. **Label each recording** with the correct transcript
3. **Upload to MissionControl** to create a training dataset
4. **Train a custom model** that learns your voice patterns
5. **Deploy** the model with a `custom_id` parameter

**Availability:** Custom training is currently an **Enterprise feature**. The free tier includes:
- 2 custom-trained models
- 1 deployed model
- 10 minutes of professional data labeling
- 2 training-ready datasets

**To explore:** Visit [console.deepgram.com](https://console.deepgram.com) and look for MissionControl.

### Nova-3 Self-Serve Customization

Nova-3 introduced a lighter alternative: **instant vocabulary adaptation** without full model retraining. This lets you add specialized terms that the model will recognize in context, similar to keyword boosting but more deeply integrated into the model's understanding.

### Practical Tips for Atypical Speech

While waiting for custom training access, these settings help:

1. **Use batch mode** (record then transcribe) — gives Nova-3 more context to work with vs. streaming
2. **Speak at a steady pace** — consistent rhythm helps the model
3. **Use keyword boosting** — for words that consistently get misheard
4. **Try longer `utterance_end_ms`** — gives more time between phrases (currently 1000ms)
5. **Consider increasing `endpointing`** — from 300ms to 500-800ms if words get cut off

---

## How SuperWhisper Achieves High Accuracy

SuperWhisper is a macOS/iOS dictation app built on **whisper.cpp** (OpenAI's Whisper model running locally). Here's why it feels more accurate:

### Architecture Differences
| Feature | SuperWhisper | GitConnect (Deepgram) |
|---|---|---|
| **Engine** | OpenAI Whisper (local) | Deepgram Nova-3 (cloud) |
| **Processing** | Batch (records, then transcribes) | Streaming + Batch |
| **Latency** | Higher (processes after recording) | Lower (real-time) |
| **Privacy** | Fully offline | Cloud-based |
| **Model sizes** | Nano → Ultra (user picks accuracy/speed tradeoff) | Nova-3 (one model) |

### Key Accuracy Techniques
1. **"Use your own words" dictionary** — Users enter names, abbreviations, and specialized terms once. The model remembers them permanently. This is similar to our keyword boosting.

2. **Predefined modes** — Optimizes tone, structure, and formatting per use case (email, code, notes). Different contexts = different post-processing rules.

3. **LLM post-processing** — After Whisper transcribes, SuperWhisper can run the text through GPT/Claude/Llama to clean up, reformat, and fix errors. This is their biggest accuracy advantage — an LLM corrects what the STT model got wrong.

4. **Larger model = better accuracy** — Their "Ultra" model is the largest Whisper variant. It's slower but significantly more accurate. Users choose the tradeoff.

5. **Batch-only processing** — By recording first and transcribing after, the model sees the full audio context, which produces better results than real-time streaming.

### What We've Implemented
- **LLM post-processing** ✅ — Settings → AI Post-Processing. After Deepgram transcribes, Claude cleans up errors. Includes an accessibility context field where users describe their speech patterns so Claude can better correct errors. See `usePostProcessing.ts`.
- **Streaming vs Batch toggle** ✅ — Settings → Voice Recognition → Transcription mode. Users choose real-time streaming (lower latency) or batch (higher accuracy). Both fully wired in DictationMode.
- **Mode-based optimization** ✅ — Agent mode (AI interprets) vs Dictation mode (raw text)
- **Batch mode** ✅ — Default mode. Records full audio, sends to Nova-3 after stop for maximum accuracy.
- **Dictation commands** ✅ — "period", "comma", "new line" etc. via `dictation: true`

### Still Planned
- [ ] Add user word dictionary (stored keywords that persist across sessions)
- [ ] Keyword boosting UI in Settings (boost uncommon words)
- [ ] Explore Deepgram custom model training when available at lower tiers
- [ ] Consider hybrid approach: Deepgram for streaming, Whisper for batch accuracy
- [ ] Adaptive speech model — learn from user corrections over time

---

## Deepgram Flux Model (Voice Agents)

For conversational voice agent flows (user talks to AI bot), Deepgram's **Flux** model is purpose-built:

- First-of-its-kind **model-integrated end-of-turn detection**
- Configurable turn-taking dynamics
- Ultra-low latency optimized for voice agent pipelines
- Nova-3 level accuracy

Usage: `model=flux-general-en` (uses v2 API endpoint)

This could be relevant if GitConnect adds a conversational AI voice assistant mode.

---

## References

- [Deepgram Model Options](https://developers.deepgram.com/docs/model)
- [Deepgram Keywords](https://developers.deepgram.com/docs/keywords)
- [Deepgram Dictation](https://developers.deepgram.com/docs/dictation)
- [Deepgram Smart Format](https://developers.deepgram.com/docs/smart-format)
- [Deepgram Endpointing](https://developers.deepgram.com/docs/endpointing)
- [Deepgram Utterance End](https://developers.deepgram.com/docs/utterance-end)
- [Deepgram Custom Training](https://deepgram.com/learn/train-a-deep-learning-speech-recognition-model-to-understand-your-voice)
- [SuperWhisper](https://superwhisper.com/)
