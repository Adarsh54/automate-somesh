export const MAX_BODY_BYTES = 1024 * 1024;
export function reply(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(body);
}
export function allowMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  reply(res, 405, {error:"METHOD_NOT_ALLOWED"});
  return false;
}
export async function readJson(req) {
  if ((req.headers["content-type"] || "").split(";")[0].trim().toLowerCase() !== "application/json")
    throw Object.assign(new Error("JSON_REQUIRED"), {status:415});
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES)
    throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), {status:413});
  let raw = req.body;
  if (raw === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk); size += buffer.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), {status:413});
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks);
  }
  const serialized = Buffer.isBuffer(raw) ? raw.toString("utf8") : typeof raw === "string" ? raw : JSON.stringify(raw);
  if (Buffer.byteLength(serialized || "") > MAX_BODY_BYTES)
    throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), {status:413});
  try { return JSON.parse(serialized); }
  catch { throw Object.assign(new Error("INVALID_JSON"), {status:400}); }
}
