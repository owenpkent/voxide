# VoxIDE × Alexa — Integration Options

**Status**: Exploration / pre-decision
**Last updated**: 2026-04-25

## Vision

A conversational coding interface for blind and mobility-impaired developers. The user speaks to an Alexa device. An LLM-driven coding agent does the work (writes code, runs commands, fixes bugs). Alexa reads the result back. Each turn is a meaningful task, not a keystroke — so this is a voice interface to a *coding agent*, not voice dictation.

This is fundamentally different from existing voice-coding tools (Talon, Cursorless, Dragon), which translate voice into editor actions. The Alexa model treats the IDE like an LLM you converse with.

## Architecture Options

### Option A — Cloud-only

```
Alexa device  →  Alexa Skill  →  AWS Lambda  →  Claude API
                                       ↓
                                Sandboxed runtime
                                (E2B, Modal, Daytona)
                                       ↓
                                Result → Alexa TTS
```

- No desktop install required.
- Code runs in a cloud sandbox, not on the user's machine.
- Best for greenfield tasks: "write me a script that scrapes…", "build a small Flask app".
- Cannot operate on the user's existing local repos.

**Pros**: simpler infra, no daemon, faster to prototype, works from any Alexa device the user owns.
**Cons**: can't touch local code, sandbox state is ephemeral unless you add persistence, every API call is your cost.

### Option B — Cloud-relay to desktop

```
Alexa device  →  Alexa Skill  →  AWS Lambda  →  WebSocket / message queue
                                                          ↓
                                          Daemon on user's machine
                                                          ↓
                                          Drives Claude Code (or similar)
                                          against user's real codebase
                                                          ↓
                                          Result → queue → Lambda → Alexa TTS
```

- A small daemon runs on the user's computer, holding a persistent connection to the cloud relay.
- Agent operates on the user's actual repos with their actual file permissions.
- Closer to the existing VoxIDE-on-machine model.

**Pros**: works on real projects, leverages local tooling (git, language servers, tests), keeps code on the user's machine.
**Cons**: requires install + persistent daemon + auth pairing between Alexa account and machine, more failure modes.

### Option C (later) — Hybrid

A and B combined. Alexa invocation routes to cloud sandbox by default; if the user says "in my project" or has a paired machine, it routes to the desktop relay.

## Alexa-Specific Constraints

These are hard constraints baked into Alexa's platform — design must accommodate them.

### Latency / session timeout
- Skill responses must arrive within ~8 seconds or the session ends.
- Real agent work routinely takes 10s–several minutes.
- **Mitigations**:
  - Progressive responses ("Working on it, I'll let you know") + **Proactive Events API** to notify when done ("Alexa, VoxIDE has an update").
  - Or break tasks into short steps that each fit the budget.

### Free-form input is awkward
- Alexa's NLU is intent + slot. It does not natively accept arbitrary sentences.
- Workaround: define an `AMAZON.SearchQuery` slot that captures one free-form blob ("Alexa, ask VoxIDE *to add a login route to my flask app*").
- `SearchQuery` has placement rules — it must be the last slot, and you can't combine multiple `SearchQuery` slots in one utterance.

### Response size cap
- ~8 KB / 90 seconds of TTS per response.
- Code read aloud is painful regardless. Need a summarization layer:
  - "I changed three files. The main change is in auth.py — I added a login route. Want me to read it, or save it for review?"
- Long output → pagination by user request ("say more", "next file").

### Privacy
- All utterances are transcribed and logged by Amazon.
- All responses are TTS'd by Amazon, so anything spoken back (e.g. an API key the agent surfaced, a copied secret) goes through their pipeline.
- For users handling proprietary code: this is a real concern. Document it clearly. Consider a "redact secrets before TTS" pass.

### Wake-word ergonomics
- "Alexa, ask VoxIDE to…" is required for every turn unless the skill keeps the session open.
- Multi-turn sessions help, but Alexa closes them after silence.
- Acceptable for the conversational-agent model since each turn is substantive.

### Cost
- Lambda invocations are cheap; Claude API tokens are not.
- A long agent run can rack up $0.10–$1+ per task. Need cost guardrails per user / per session.

## Recommendation

**Start with Option A (cloud-only) as a prototype.** Reasons:
1. Validates the conversational UX without local-install overhead.
2. No daemon to debug — single deployable Lambda.
3. Can be built and demoed in a few days; tells us whether the interaction pattern is actually pleasant before committing to the harder architecture.

Once the UX is validated, layer Option B on top to unlock real-codebase work.

## Open Questions

1. **Repo access** — does the v1 user want to work on existing local repos, or is "build me something new" enough? (Affects A vs B choice.)
2. **Account model** — does the user need an Amazon developer account to install the skill, or do we publish it to the public Alexa Skill Store? Public store has review overhead but lowers user friction.
3. **Async notification UX** — is "Alexa, VoxIDE has an update" acceptable for long tasks, or does that break the conversational flow?
4. **Output review** — when the agent writes code, where does the user *see* it? Companion web view? Email? Sent to the paired desktop?
5. **Auth between Alexa skill and Anthropic API** — managed keys (VoxIDE pays, charges user) vs BYO key (user pastes their key into the skill's account-linking flow).
6. **Differentiation from "just use Claude on my phone"** — what does Alexa specifically unlock? (Hands-free, ambient, multi-room, no screen needed — but worth being honest about whether that's enough.)

## Non-goals (for first version)

- Live voice dictation of code character-by-character. Not what this is.
- Replacing Talon / Cursorless. Those serve a different workflow (active editing).
- Running offline. Alexa is cloud-only by design.
