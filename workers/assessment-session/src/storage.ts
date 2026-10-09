/**
 * File storage interface for LMS uploads (Quran recitation recordings, homework pictures).
 *
 * Phase 1 has no file storage: `blobStore(env)` returns a disabled store and upload endpoints answer
 * 501 "storage_not_configured". To turn storage on later, bind an R2 bucket as FILES in wrangler.toml:
 *
 *   [[r2_buckets]]
 *   binding = "FILES"
 *   bucket_name = "school-lms-files"
 *
 * and the R2 implementation below is used automatically — no other code changes.
 */
export interface BlobStore {
  readonly enabled: boolean;
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream | ArrayBuffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export interface StorageEnv {
  FILES?: R2Bucket;
}

const disabled: BlobStore = {
  enabled: false,
  async put() {
    throw new Error("storage_not_configured");
  },
  async get() {
    return null;
  },
  async delete() {},
};

function r2Store(bucket: R2Bucket): BlobStore {
  return {
    enabled: true,
    async put(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } });
    },
    async get(key) {
      const o = await bucket.get(key);
      return o ? { body: o.body, contentType: o.httpMetadata?.contentType || "application/octet-stream" } : null;
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}

export function blobStore(env: StorageEnv): BlobStore {
  return env.FILES ? r2Store(env.FILES) : disabled;
}

/**
 * Default store while R2 is off: files kept inside the LMS Durable Object's SQLite as ≤100 KB chunks.
 * Same interface as R2, so binding FILES later switches new uploads to R2 without other changes.
 */
export function sqliteChunkStore(sql: SqlStorage, chunk = 100_000): BlobStore {
  sql.exec(`CREATE TABLE IF NOT EXISTS blob_chunks (key TEXT, idx INTEGER, mime TEXT, data BLOB, PRIMARY KEY (key, idx))`);
  return {
    enabled: true,
    async put(key, data, contentType) {
      sql.exec(`DELETE FROM blob_chunks WHERE key=?`, key);
      const bytes = new Uint8Array(data);
      for (let i = 0, n = 0; i < bytes.length || n === 0; i += chunk, n++) sql.exec(`INSERT INTO blob_chunks (key, idx, mime, data) VALUES (?, ?, ?, ?)`, key, n, contentType, bytes.slice(i, i + chunk));
    },
    async get(key) {
      const rows = sql.exec(`SELECT mime, data FROM blob_chunks WHERE key=? ORDER BY idx`, key).toArray();
      if (!rows.length) return null;
      const parts = rows.map((r) => new Uint8Array(r.data as ArrayBuffer));
      const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.length; }
      return { body: out.buffer, contentType: String(rows[0].mime) };
    },
    async delete(key) {
      sql.exec(`DELETE FROM blob_chunks WHERE key=?`, key);
    },
  };
}
