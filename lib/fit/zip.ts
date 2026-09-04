import { unzipSync } from "fflate";

/** Per-run cap; typical COROS FIT files are well under this. */
export const MAX_FIT_BYTES = 8 * 1024 * 1024;
/** Zip upload cap. Fits compress poorly, so this is roughly "a season of runs". */
export const MAX_ZIP_BYTES = 40 * 1024 * 1024;
export const MAX_FIT_FILES = 400;
export const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;

export type FitPayload = {
  name: string;
  bytes: Uint8Array;
};

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

export function isFitName(name: string): boolean {
  const base = basename(name);
  return base.toLowerCase().endsWith(".fit") && !base.startsWith(".");
}

export function isZipName(name: string): boolean {
  return basename(name).toLowerCase().endsWith(".zip");
}

/**
 * Reject absolute paths, drive letters, and `..` so a zip cannot write outside
 * the intended extract set. Directories are skipped because they are not runs.
 */
export function isSafeZipPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized || normalized.endsWith("/")) return false;
  if (normalized.startsWith("/") || normalized.includes(":")) return false;
  if (normalized.split("/").some((part) => part === ".." || part === ".")) return false;
  return isFitName(normalized);
}

export function extractFitFilesFromZip(
  bytes: Uint8Array,
  limits: { remainingFiles: number; remainingBytes: number } = {
    remainingFiles: MAX_FIT_FILES,
    remainingBytes: MAX_UNCOMPRESSED_BYTES,
  },
): { payloads: FitPayload[]; truncated: boolean } {
  let remainingFiles = limits.remainingFiles;
  let remainingBytes = limits.remainingBytes;
  let truncated = false;

  const unzipped = unzipSync(bytes, {
    filter: (file) => {
      if (!isSafeZipPath(file.name)) return false;
      if (file.originalSize <= 0 || file.originalSize > MAX_FIT_BYTES) return false;
      // 0 = stored, 8 = deflate. Anything else makes fflate throw if we accept it.
      if (file.compression !== 0 && file.compression !== 8) return false;
      if (remainingFiles <= 0 || file.originalSize > remainingBytes) {
        truncated = true;
        return false;
      }
      remainingFiles -= 1;
      remainingBytes -= file.originalSize;
      return true;
    },
  });

  const payloads = Object.entries(unzipped)
    .filter(([, data]) => data.byteLength > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, data]) => ({ name, bytes: data }));

  return { payloads, truncated };
}

export type ExpandedUploads = {
  payloads: FitPayload[];
  truncated: boolean;
  failed: number;
};

/**
 * Turn loose .fit files and .zip archives into a flat list of FIT payloads.
 * Non-run files inside a zip are ignored; a corrupt or oversized zip counts as failed.
 */
export function expandUploads(uploads: FitPayload[]): ExpandedUploads {
  const payloads: FitPayload[] = [];
  let truncated = false;
  let failed = 0;
  let usedBytes = 0;

  const pushFit = (name: string, bytes: Uint8Array) => {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FIT_BYTES) {
      failed += 1;
      return;
    }
    if (payloads.length >= MAX_FIT_FILES || usedBytes + bytes.byteLength > MAX_UNCOMPRESSED_BYTES) {
      truncated = true;
      return;
    }
    usedBytes += bytes.byteLength;
    payloads.push({ name, bytes });
  };

  for (const upload of uploads) {
    if (truncated) break;

    if (isZipName(upload.name)) {
      if (upload.bytes.byteLength > MAX_ZIP_BYTES) {
        failed += 1;
        continue;
      }
      try {
        const extracted = extractFitFilesFromZip(upload.bytes, {
          remainingFiles: MAX_FIT_FILES - payloads.length,
          remainingBytes: MAX_UNCOMPRESSED_BYTES - usedBytes,
        });
        for (const entry of extracted.payloads) pushFit(entry.name, entry.bytes);
        if (extracted.truncated) truncated = true;
      } catch {
        failed += 1;
      }
      continue;
    }

    if (isFitName(upload.name)) {
      pushFit(upload.name, upload.bytes);
      continue;
    }

    failed += 1;
  }

  return { payloads, truncated, failed };
}
