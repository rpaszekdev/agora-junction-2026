import {
  GoogleGenAI,
  Modality,
  type FunctionDeclaration,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

/**
 * The voice: one Gemini Live session. The microphone goes up as 16 kHz PCM, his speech comes back as 24 kHz PCM
 * and is played through an analyser, so the character can move with its loudness. The key stays on the server:
 * the page asks /api/live-token (../vite.config.ts) for a one-use token.
 */

const MODEL = "gemini-3.8-live";
const MIC_RATE = 16000;
const VOICE_RATE = 24000;
const MAX_TEXT = 500;
/** A turn that ended without a tool call is handed to the page this long after (ms): a late call still cancels it. */
const MISS_MS = 1200;
/** After the microphone heard words, the user is taken to be speaking for this long (ms). */
const QUIET_MS = 1200;
/** After something was sent to him, his reply is waited for this long before a note may follow (ms). */
const REPLY_MS = 6000;
/** Gemini now and then refuses a new session ("Resource has been exhausted") and takes the next one a moment later:
 * a refused connection is tried again this often, this much longer apart each time (ms). */
const CONNECT_TRIES = 4;
const RETRY_MS = 700;

export type Tool = (
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface LiveOptions {
  instruction: string;
  declarations: FunctionDeclaration[];
  tools: Record<string, Tool>;
  /** What was said: `who` 'you' or 'guide', the text so far of that turn. */
  onWords(who: "you" | "guide", text: string): void;
  onStatus(text: string): void;
  onClose(reason: string): void;
  /** The user said `text` and his turn ended without a tool call: the page may act on it itself. */
  onMissed(text: string): void;
}

export interface Live {
  /** His voice's loudness now (dB), or null while he is quiet. */
  level(): number | null;
  /** Say something to him in text (the typed fallback). */
  say(text: string): void;
  /** A note from the page, not from the user, for him to say aloud. */
  note(text: string): void;
  /** Somebody is speaking, he is thinking, or his reply is on its way: a note now would cut in. */
  busy(): boolean;
  close(): void;
}

/** The microphone's samples, handed over in blocks (an AudioWorklet: the page must not stall the audio thread). */
const MIC_WORKLET = `registerProcessor('mic', class extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
});`;

function pcmBase64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++)
    pcm[i] = Math.max(-1, Math.min(1, samples[i]!)) * 32767;
  const bytes = new Uint8Array(pcm.buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}

function pcmFloat(b64: string): Float32Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Float32Array(bin.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    out[i] = (v >= 32768 ? v - 65536 : v) / 32768;
  }
  return out;
}

export async function connectLive(
  o: LiveOptions,
  withMic: boolean,
): Promise<Live> {
  o.onStatus("GETTING A SESSION");
  /** A token opens one session only: every try needs its own. */
  const freshToken = async (): Promise<string> => {
    const r = await fetch("/api/live-token");
    const { token, error } = (await r.json()) as {
      token?: string;
      error?: string;
    };
    if (!r.ok || !token)
      throw new Error(error ?? `the token route said ${r.status}`);
    return token;
  };

  // ---- his voice: queued buffers, through an analyser
  const out = new AudioContext({ sampleRate: VOICE_RATE });
  await out.resume();
  const analyser = out.createAnalyser();
  analyser.fftSize = 1024;
  analyser.connect(out.destination);
  const wave = new Float32Array(analyser.fftSize);
  let playing: AudioBufferSourceNode[] = [];
  let nextAt = 0;
  const play = (b64: string) => {
    const data = pcmFloat(b64);
    if (!data.length) return;
    const buf = out.createBuffer(1, data.length, VOICE_RATE);
    buf.copyToChannel(data, 0);
    const src = out.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    nextAt = Math.max(nextAt, out.currentTime + 0.03);
    src.start(nextAt);
    nextAt += buf.duration;
    playing = [...playing, src];
    src.addEventListener(
      "ended",
      () => (playing = playing.filter((p) => p !== src)),
    );
  };
  const hush = () => {
    for (const p of playing) {
      try {
        p.stop();
      } catch {
        /* already stopped */
      }
    }
    playing = [];
    nextAt = 0;
  };

  // ---- the session
  let closed = false;
  let open = false; // the session is set up: before that, a close is a refused try, not the end
  let words: { you: string; guide: string } = { you: "", guide: "" };
  let session: Session | null = null;
  let heard = ""; // what the user said this turn (the transcript of his speech, or what he typed)
  let heardAt = -Infinity; // when the microphone last heard words (ms)
  let generating = false; // his reply is coming in
  let calls = 0; // tool calls not answered yet
  let cancelled: ReadonlySet<string> = new Set(); // tool calls the user talked over: their answers are not sent
  let replyUntil = 0; // something was sent to him: his reply is expected until then (ms)
  let missed: ReturnType<typeof setTimeout> | undefined;
  const onMessage = (m: LiveServerMessage) => {
    const c = m.serverContent;
    if (c?.interrupted) {
      hush();
      generating = false;
    }
    if (c?.modelTurn?.parts?.length) {
      generating = true;
      replyUntil = 0;
    }
    for (const part of c?.modelTurn?.parts ?? [])
      if (part.inlineData?.data) play(part.inlineData.data);
    if (c?.inputTranscription?.text) {
      heard += c.inputTranscription.text;
      heardAt = performance.now();
      words = { you: words.you + c.inputTranscription.text, guide: "" };
      o.onWords("you", words.you);
    }
    if (c?.outputTranscription?.text) {
      words = { you: "", guide: words.guide + c.outputTranscription.text };
      o.onWords("guide", words.guide);
    }
    if (c?.turnComplete) {
      words = { you: "", guide: "" };
      generating = false;
      replyUntil = 0;
      // the backup: he answered the user without his tool, so the page gets the sentence itself
      const text = heard.trim();
      heard = "";
      clearTimeout(missed);
      if (text) missed = setTimeout(() => !closed && o.onMissed(text), MISS_MS);
    }
    for (const id of m.toolCallCancellation?.ids ?? [])
      cancelled = new Set([...cancelled, id]);
    for (const call of m.toolCall?.functionCalls ?? []) {
      heard = ""; // the sentence reached the tool
      clearTimeout(missed);
      calls += 1;
      const tool = call.name ? o.tools[call.name] : undefined;
      const done = tool
        ? tool(call.args ?? {})
        : Promise.resolve({ error: `no such tool: ${call.name}` });
      void done
        .catch((e: unknown) => ({
          error: e instanceof Error ? e.message : String(e),
        }))
        .then((response) => {
          calls -= 1;
          if (closed || (call.id && cancelled.has(call.id))) return;
          session?.sendToolResponse({
            functionResponses: [{ id: call.id, name: call.name, response }],
          });
          replyUntil = performance.now() + REPLY_MS;
        });
    }
  };
  const connect = async (): Promise<Session> => {
    const ai = new GoogleGenAI({
      apiKey: await freshToken(),
      httpOptions: { apiVersion: "v1alpha" },
    });
    return ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: o.instruction,
        tools: [{ functionDeclarations: o.declarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: onMessage,
        onerror: (e) => {
          if (open)
            o.onStatus(`ERROR: ${e.message || "the connection failed"}`);
        },
        onclose: (e) => {
          if (!open) return; // a refused try: connect() throws and the next try follows
          closed = true;
          o.onClose(e.reason || "the session ended");
        },
      },
    });
  };
  for (let n = 1; !session; n++) {
    o.onStatus(
      n === 1 ? "CONNECTING" : `CONNECTING (TRY ${n} OF ${CONNECT_TRIES})`,
    );
    try {
      session = await connect();
    } catch (e) {
      if (n === CONNECT_TRIES) {
        void out.close();
        throw e;
      }
      await new Promise((r) => setTimeout(r, RETRY_MS * n));
    }
  }
  open = true;

  // ---- the microphone
  let mic: { ctx: AudioContext; stream: MediaStream } | null = null;
  if (withMic) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });
    const ctx = new AudioContext({ sampleRate: MIC_RATE });
    await ctx.audioWorklet.addModule(
      URL.createObjectURL(new Blob([MIC_WORKLET], { type: "text/javascript" })),
    );
    const node = new AudioWorkletNode(ctx, "mic");
    node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      if (!closed)
        session?.sendRealtimeInput({
          audio: {
            data: pcmBase64(ev.data),
            mimeType: `audio/pcm;rate=${MIC_RATE}`,
          },
        });
    };
    ctx.createMediaStreamSource(stream).connect(node);
    mic = { ctx, stream };
  }
  o.onStatus(withMic ? "LISTENING" : "CONNECTED (TYPE TO TALK)");

  return {
    level() {
      if (!playing.length || out.currentTime > nextAt) return null;
      analyser.getFloatTimeDomainData(wave);
      let sum = 0;
      for (const v of wave) sum += v * v;
      return 20 * Math.log10(Math.sqrt(sum / wave.length) + 1e-6);
    },
    say(text) {
      const t = text.trim().slice(0, MAX_TEXT);
      if (!t || closed) return;
      heard = t;
      session?.sendRealtimeInput({ text: t });
      replyUntil = performance.now() + REPLY_MS;
    },
    note(text) {
      const t = text.trim();
      if (!t || closed) return;
      session?.sendRealtimeInput({ text: t });
      replyUntil = performance.now() + REPLY_MS;
    },
    busy() {
      const now = performance.now();
      return (
        generating ||
        calls > 0 ||
        now < replyUntil ||
        now - heardAt < QUIET_MS ||
        (playing.length > 0 && out.currentTime <= nextAt)
      );
    },
    close() {
      closed = true;
      clearTimeout(missed);
      hush();
      mic?.stream.getTracks().forEach((t) => t.stop());
      void mic?.ctx.close();
      void out.close();
      session?.close();
    },
  };
}
