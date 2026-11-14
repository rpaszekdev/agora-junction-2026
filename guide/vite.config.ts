import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { defineConfig, type Plugin } from "vite";
import { CRITERIA, MAX_SENTENCE, QUESTION } from "./src/gesture";

/** The wall (../wall.py): the search, the guide's brain and the product cutouts come from it. */
const WALL = "http://localhost:8001";
const TOKEN_MINUTES = 30;
/** Gemini's Decisions model: it chooses among options and says how surely, and writes nothing. */
const GESTURE_MODEL = "gemini-decision-1";
/** A request to /api/gesture is no longer than this (bytes). */
const MAX_GESTURE_BODY = 2048;

/** GEMINI_API_KEY from ../.env. Read here, in Node: it never reaches the page. */
function geminiKey(): string {
  const text = readFileSync(resolve(import.meta.dirname, "../.env"), "utf8");
  const line = text.split("\n").find((l) => l.startsWith("GEMINI_API_KEY="));
  const key = line
    ?.slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!key) throw new Error("GEMINI_API_KEY is not set in ../.env");
  return key;
}

/** GET /api/live-token → { token }: a one-use, short-lived token the page opens its Gemini Live session with. */
function liveToken(): Plugin {
  return {
    name: "live-token",
    configureServer(server) {
      server.middlewares.use("/api/live-token", (_req, res) => {
        const send = (code: number, body: object) => {
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        const ai = new GoogleGenAI({
          apiKey: geminiKey(),
          httpOptions: { apiVersion: "v1alpha" },
        });
        ai.authTokens
          .create({
            config: {
              uses: 1,
              expireTime: new Date(
                Date.now() + TOKEN_MINUTES * 60_000,
              ).toISOString(),
            },
          })
          .then((t) => send(200, { token: t.name }))
          .catch((e: unknown) => {
            console.error("[live-token]", e);
            send(502, { error: "Gemini did not give a session token" });
          });
      });
    },
  };
}

/**
 * POST /api/gesture { text } → { name, p }: which gesture goes with a sentence of hers (an option of
 * ./src/gesture.ts, chosen by Gemini's Decisions API), and how sure that is (0..1).
 */
function gesture(): Plugin {
  return {
    name: "gesture",
    configureServer(server) {
      server.middlewares.use("/api/gesture", (req, res) => {
        const send = (code: number, body: object) => {
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return send(405, { error: "POST only" });
        let body = "";
        let tooLong = false;
        req.on("data", (chunk: Buffer) => {
          if (body.length + chunk.length > MAX_GESTURE_BODY) tooLong = true;
          else body += chunk.toString("utf8");
        });
        req.on("end", () => {
          if (tooLong) return send(413, { error: "the sentence is too long" });
          let text = "";
          try {
            const sent = (JSON.parse(body) as { text?: unknown }).text;
            text =
              typeof sent === "string"
                ? sent.trim().slice(0, MAX_SENTENCE)
                : "";
          } catch {
            return send(400, { error: "the body is not JSON" });
          }
          if (!text) return send(400, { error: "no text" });
          // (the key is read inside the chain: without one this answers 502, instead of throwing in a listener)
          Promise.resolve()
            .then(() =>
              new GoogleGenAI({
                apiKey: geminiKey(),
                apiVersion: "v1beta",
              }).decisions.create({
                model: GESTURE_MODEL,
                input: text,
                questions: {
                  gesture: {
                    type: "choice",
                    instructions: QUESTION,
                    criteria: CRITERIA,
                  },
                },
              }),
            )
            .then((r) => {
              const a = r.answers?.["gesture"];
              if (a?.type !== "choice") throw new Error("no choice came back");
              send(200, { name: a.choice, p: a.confidence });
            })
            .catch((e: unknown) => {
              console.error("[gesture]", e);
              send(502, { error: "Gemini did not choose a gesture" });
            });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [liveToken(), gesture()],
  // The wall's address: the one page she listens to as a frame (src/search.ts).
  // Michelle is the guide where her files are (Mixamo's terms keep them out of the repo); elsewhere it is retro-m3
  define: {
    __WALL__: JSON.stringify(WALL),
    __HAS_MICHELLE__: existsSync(
      resolve(import.meta.dirname, "public/models/mixamo/michelle.fbx"),
    ),
  },
  // ponytail: dev server only (the token route lives in it); a real deploy needs this route on a server
  server: {
    port: 5174,
    strictPort: true,
    proxy: { "/search": WALL, "/brain": WALL, "/cut": WALL, "/shelf": WALL },
  },
});
