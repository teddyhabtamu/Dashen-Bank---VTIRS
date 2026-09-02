import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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