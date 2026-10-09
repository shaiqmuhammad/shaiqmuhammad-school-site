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
