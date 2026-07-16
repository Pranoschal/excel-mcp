import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!supabase) {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

function getBucket() {
  return process.env.SUPABASE_BUCKET || "excel-files";
}

export function sanitizeStorageBasename(name: string): string {
  const base = path.basename(name);
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "file.bin";
}

function contentTypeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

export async function uploadLocalFileToStorage(
  localPath: string,
  storageKey: string
): Promise<{ storagePath: string; bucket: string }> {
  const client = getSupabase();
  if (!client) {
    throw new Error(
      "Supabase is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  const buffer = await fs.readFile(localPath);
  const bucket = getBucket();
  const contentType = contentTypeForExtension(path.extname(localPath));

  const { error } = await client.storage.from(bucket).upload(storageKey, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  return { storagePath: storageKey, bucket };
}

export async function createSignedDownloadUrl(
  storageKey: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getSupabase();
  if (!client) {
    throw new Error(
      "Supabase is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  const bucket = getBucket();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create download URL${error ? `: ${error.message}` : ""}`
    );
  }

  return data.signedUrl;
}

export async function publishGeneratedFile(
  localPath: string,
  preferredName?: string
): Promise<{
  storagePath: string;
  bucket: string;
  downloadUrl: string;
  fileName: string;
  expiresIn: number;
}> {
  const fileName = sanitizeStorageBasename(preferredName || path.basename(localPath));
  const storageKey = `generated/${Date.now()}-${fileName}`;
  const expiresIn = 3600;

  const { storagePath, bucket } = await uploadLocalFileToStorage(
    localPath,
    storageKey
  );
  const downloadUrl = await createSignedDownloadUrl(storageKey, expiresIn);

  return {
    storagePath,
    bucket,
    downloadUrl,
    fileName,
    expiresIn,
  };
}

/**
 * Resolve a tool filePath to a local absolute path.
 * - Absolute / existing local paths are used as-is
 * - Otherwise download from Supabase Storage to a temp file
 */
export async function resolveLocalFilePath(filePath: string): Promise<string> {
  if (path.isAbsolute(filePath)) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // fall through to storage
    }
  }

  const localCandidate = path.resolve(filePath);
  try {
    await fs.access(localCandidate);
    return localCandidate;
  } catch {
    // not local — try Supabase
  }

  const client = getSupabase();
  if (!client) {
    throw new Error(
      `File not found locally ("${filePath}") and Supabase is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).`
    );
  }

  // Normalize storage key (strip leading slash)
  const storageKey = filePath.replace(/^\/+/, "");
  const bucket = getBucket();

  const { data, error } = await client.storage.from(bucket).download(storageKey);
  if (error || !data) {
    throw new Error(
      `File not found or not accessible: ${filePath}` +
        (error ? ` (Supabase: ${error.message})` : "")
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const tempPath = path.join(
    os.tmpdir(),
    `excel-mcp-${Date.now()}-${path.basename(storageKey)}`
  );
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}
