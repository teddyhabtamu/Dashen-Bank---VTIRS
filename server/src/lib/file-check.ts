import { createHash } from "node:crypto";

export type SniffedType = "application/pdf" | "image/jpeg" | "image/png" | null;

// Verify a file's declared MIME type against its magic bytes rather than
// trusting the client-supplied Content-Type.
export function sniffMimeType(buf: Uint8Array): SniffedType {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg"; // FF D8 FF
  }
  if (buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return "image/png"; // \x89PNG\r\n\x1a\n
  }
  return null;
}

export function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}