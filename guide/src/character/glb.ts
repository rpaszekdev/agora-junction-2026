// From albertmajor/apartment-ps1 (src/retro/characters/friend.ts): only the GLB packer.
/** A glTF whose one buffer is a base64 `data:` URL, as a binary glTF (GLB): the JSON, then the decoded bytes. */
export function toGlb(json: { buffers?: { uri?: string; byteLength: number }[] }): ArrayBuffer {
  const buf = json.buffers?.[0];
  if (!buf?.uri?.startsWith('data:') || json.buffers!.length !== 1) throw new Error('expected one embedded buffer');
  const b64 = buf.uri.slice(buf.uri.indexOf(',') + 1);
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  delete buf.uri; // in a GLB, the first buffer without a uri is the BIN chunk
  const pad4 = (n: number) => (n + 3) & ~3;
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(text.length);
  const binLen = pad4(bin.length);
  const out = new ArrayBuffer(12 + 8 + jsonLen + 8 + binLen);
  const v = new DataView(out);
  const u8 = new Uint8Array(out);
  v.setUint32(0, 0x46546c67, true); // 'glTF'
  v.setUint32(4, 2, true);
  v.setUint32(8, out.byteLength, true);
  v.setUint32(12, jsonLen, true);
  v.setUint32(16, 0x4e4f534a, true); // 'JSON'
  u8.set(text, 20);
  u8.fill(0x20, 20 + text.length, 20 + jsonLen); // JSON padding: spaces
  const b = 20 + jsonLen;
  v.setUint32(b, binLen, true);
  v.setUint32(b + 4, 0x004e4942, true); // 'BIN\0'
  u8.set(bin, b + 8);
  return out;
}
