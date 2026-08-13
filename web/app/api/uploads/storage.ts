import { Buffer } from "node:buffer";
import { env } from "cloudflare:workers";

export async function paperFileData(storageKey: string) {
  const object = await env.BUCKET.get(storageKey);
  if (!object || object.size === 0) return null;
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength === 0) return null;
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}
