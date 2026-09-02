import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

const BUCKET = process.env.STORAGE_BUCKET || "documents";

function localRoot() {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function s3Config(): S3Client | null {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    endpoint,
    region: process.env.AWS_REGION || "us-east-2",
    forcePathStyle: true,
  });
}

let client: S3Client | null | undefined;
function s3() {
  if (client === undefined) client = s3Config();
  return client;
}

export function storageEnabled() {
  return s3() !== null;
}

export async function putFile(key: string, body: Buffer, contentType: string): Promise<void> {
  const s3c = s3();
  if (s3c) {
    await s3c.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const full = path.join(localRoot(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function openFileStream(key: string): Promise<Readable | null> {
  const s3c = s3();
  if (s3c) {
    try {
      const { Body } = await s3c.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      return Body as Readable;
    } catch (err) {
      if (err && typeof err === "object" && "name" in err && err.name === "NoSuchKey") return null;
      throw err;
    }
  }
  const full = path.join(localRoot(), key);
  if (!existsSync(full)) return null;
  return createReadStream(full);
}

export async function deleteFile(key: string): Promise<void> {
  const s3c = s3();
  if (s3c) {
    try {
      await s3c.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      // object may not exist; ignore
    }
    return;
  }
  try {
    await unlink(path.join(localRoot(), key));
  } catch {
    // file may be missing; ignore
  }
}

// Deletes many stored objects in one request (ignores keys that don't exist).
export async function deleteFiles(keys: string[]): Promise<void> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) return;
  const s3c = s3();
  if (s3c) {
    // DeleteObjectsCommand accepts up to 1000 keys per request.
    for (let i = 0; i < uniqueKeys.length; i += 1000) {
      const batch = uniqueKeys.slice(i, i + 1000).map((Key) => ({ Key }));
      await s3c.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: batch } }));
    }
    return;
  }
  await Promise.all(uniqueKeys.map((key) => deleteFile(key)));
}

// Lists every object key currently stored in the bucket (or the local upload
// directory when storage is not configured). Used by the orphan sweep.
export async function listObjects(): Promise<{ objects: string[] }> {
  const s3c = s3();
  if (!s3c) {
    const keys: string[] = [];
    async function walk(dir: string, prefix: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full, rel);
        else keys.push(rel);
      }
    }
    await walk(localRoot(), "");
    return { objects: keys };
  }
  const objects: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3c.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token })
    );
    for (const o of res.Contents ?? []) if (o.Key) objects.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return { objects };
}

export async function copyFile(srcKey: string, destKey: string): Promise<void> {
  const s3c = s3();
  if (s3c) {
    await s3c.send(
      new CopyObjectCommand({
        Bucket: BUCKET,
        Key: destKey,
        CopySource: `${BUCKET}/${srcKey}`,
      })
    );
    return;
  }
  const full = path.join(localRoot(), destKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, await readFile(path.join(localRoot(), srcKey)));
}