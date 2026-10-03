# Aria : Aura Skincare Voice Support Agent
A browser voice agent for a fictional premium Indian skincare brand. Customers click **Start call**, speak, and hear Aria reply in a natural Indian-English neural voice. She answers policy questions, looks up and cancels orders through tool calling, and never promises anything outside policy. Each call's transcript, tool calls, structured outcome and mixed audio recording are stored for admins at `/admin`.

## Architecture
```
Browser (Chrome/Edge)
  Mic ─┬─ Web Speech API (en-IN) ─ debounce endpointing ─ unclear gate ─┐
       └─ AudioContext mix ─ analyser (waveform) + MediaRecorder        │
                                                                        ▼
                         POST /api/chat ── LLM (Groq, OpenAI-compatible) ⇄ tools
                                              get_order_details / cancel_order
                                              (lib/orders.ts policy engine)
  reply → splitSentences → parallel POST /api/tts (Azure? → msedge-tts) → ordered playback
                                              └─ 502 → speechSynthesis en-IN
  End call → POST /api/summary (JSON outcome + save) → PUT /api/calls/:id/recording
Admin: /admin (password) → /api/admin/calls[/id[/recording]] → Postgres (Neon) or in-memory
```

## Stack rationale
Next.js on Vercel gives HTTPS (needed for the mic), serverless routes and free hosting in one place. Browser STT costs nothing and has low latency in Chrome. Groq's free Llama 3.3 70B is fast and supports tool calling. `msedge-tts` gives a free neural `en-IN-NeerjaNeural` voice, with Azure F0 as an official upgrade. Neon Postgres has a free tier and an HTTP driver that suits serverless functions.

## How tool calls are decided
The model gets two tools and strict rules: no statement about an order without calling `get_order_details`; ask for the ID if it is missing; cancel only after eligibility is `yes` **and** the customer says yes. The server runs up to 4 tool iterations, and the last one forces a text answer.

## Guardrails
Eligibility is computed in code (`lib/orders.ts`); the model only phrases it. `cancel_order` re-checks existence, eligibility and confirmation itself, so even a wrong model call cannot cancel an ineligible order. The prompt restricts answers to the brand facts and the 40 Q&As, with a "don't have that information" rule and prompt-injection resistance. Replies are cleaned of markup and leaked tool syntax. Unclear audio never reaches the LLM. Inputs are truncated and rate-limited per IP.

## Customer vs admin
The customer sees no captions or transcript: just the recorder waveform, the illustrated agent and the call state. Everything is saved for admins: transcript with timestamps, tool calls with arguments and results, the JSON outcome, and the recording (customer mic plus Aria's neural voice, mixed in the browser).

## Local setup
```
npm install
cp .env.example .env.local   # set LLM_API_KEY (and ADMIN_PASSWORD to use /admin)
npm run dev                  # http://localhost:3000 in Chrome/Edge
npm test && npm run typecheck && npm run build
```

## Environment variables
| Var | Required | Purpose |
|---|---|---|
| LLM_API_KEY | yes | Groq (or other OpenAI-compatible) key |
| LLM_BASE_URL / LLM_MODEL | no | Defaults to Groq + llama-3.3-70b-versatile |
| TTS_VOICE | no | Default en-IN-NeerjaNeural |
| AZURE_SPEECH_KEY / AZURE_SPEECH_REGION | no | Official Azure TTS tried first |
| DATABASE_URL | no | Postgres for persistent calls; otherwise in-memory |
| ADMIN_PASSWORD | no | Enables /admin |
| ADMIN_SESSION_SECRET | no | Cookie signing secret |

## Known limitations (honest)
- STT relies on Chrome/Edge's Web Speech API, which sends audio to the browser vendor's servers and does not work in Firefox. Safari support is partial.
- `msedge-tts` uses an unofficial Microsoft endpoint that can change or rate-limit. That is why Azure and browser fallbacks exist.
- Turns that use the browser fallback voice are not captured in recordings.
- Without DATABASE_URL, stored calls disappear on cold starts and are not shared across instances. Rate limiting is per instance.
- Recordings are capped at about 4 MB (Vercel body limit) and stored as base64 in Postgres. Fine for a demo, not for scale.
- No latency numbers have been measured; speed depends on Groq, the TTS endpoint and the network.
- Barge-in needs headphones. Echo cancellation alone isn't reliable with open speakers.
- Aria answers honestly if asked whether she is a person (she's a virtual assistant). The UI states that calls are recorded.

## Q&A
**1. Why this architecture and stack?** I wanted everything on free tiers with no card, deployable as one Vercel project. That ruled out a long-lived WebSocket server, so I used browser STT and request/response serverless routes, and made up for the lack of streaming with sentence-level parallel TTS. Plain `fetch` against an OpenAI-compatible API keeps the LLM swappable.

**2. Most difficult part?** The client turn-taking state machine. Recognition restarts itself, debounce endpointing, echo avoidance, barge-in and async TTS all race each other. I fixed this by keeping all mutable state in refs and adding a generation counter: every interrupt bumps it, and stale fetches or playback check it and quietly exit.

**3. One more week?** Streaming: streaming LLM tokens into streaming TTS, plus a proper VAD- or streaming-based STT (for example Deepgram or Whisper over WebRTC). Latency is what most affects how human a voice agent feels. After that, an evaluation suite that replays the edge-case matrix against the real model.

**4. At 1,000 conversations a day?** I would move to a paid, SLA-backed TTS and STT. I'd store recordings in object storage (Vercel Blob or S3) with signed URLs and retention policies, and use Redis/Upstash for rate limits and sessions. I'd add a real order API with customer verification before showing order data, proper admin auth with roles and audit logs, consent and DPDP-compliant retention, observability (traces per turn, tool error rates) and LLM fallback providers.

## Approach note
I kept policy logic deterministic in code and used the LLM only for language and intent, so Aria can sound natural without being able to promise anything off-policy. The pipeline runs entirely in the browser plus three serverless routes. Each piece (LLM, TTS and storage) has a free default and a fallback.

## Demo video script (about 4 minutes)
1. (0:00) Open the Vercel URL. Show the minimal page, the test orders and the recording notice. Click Start call and allow the mic. Aria greets; point out the waveform and the speaking animation.
2. (0:40) Say "Where is my order one oh one?" Show the state chips moving Listening → Thinking → Speaking. Aria says it's out for delivery with BlueDart, by 6 PM today.
3. (1:20) Policy: "I bought this 20 days ago and opened it, can I return it?" She refuses politely. Then "Cancel ORD-103" → she asks for confirmation → "Yes" → the status pill turns to Cancelled.
4. (2:10) Say "Book me a flight to Goa" to show the scope refusal, then end the call.
5. (2:40) Open /admin, sign in, select the call: play the recording, scroll the transcript and tool rows, copy the JSON.
6. (3:20) Architecture: show the diagram, `lib/orders.ts` (policy in code), the chat tool loop, and the TTS fallback chain.
