import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** URL of a file in public/, relative to wherever the page is hosted. */
export const assetUrl = (path: string) => new URL(path, document.baseURI).href;

const loader = new GLTFLoader();

/** Fetch a file, reporting progress as 0..1 when the size is known. */
async function fetchText(url: string, onProgress?: (fraction: number) => void): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress || !total) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(Math.min(1, loaded / total));
  }
  const all = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return new TextDecoder().decode(all);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Load a model from public/. Models ship as `.glb.json` (a .glb wrapped in base64 JSON, see scripts/pack-glb.mjs),
 * because the artifact host does not serve .glb files.
 */
export async function loadGltf(path: string, onProgress?: (fraction: number) => void): Promise<GLTF> {
  const url = assetUrl(path);
  const text = await fetchText(url, onProgress);
  const { glb } = JSON.parse(text) as { glb?: string };
  if (!glb) throw new Error(`${path} has no "glb" field`);
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return loader.parseAsync(base64ToBuffer(glb), base);
}
