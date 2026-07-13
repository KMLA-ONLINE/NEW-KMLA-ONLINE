import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "~/lib/supabase/database.types"

type StorageReference = {
  storage_bucket: string
  storage_path: string
}

/** 비공개 첨부를 버킷별로 묶어 한 번씩만 서명한다. */
export async function createSignedUrlMap(
  supabase: SupabaseClient<Database>,
  references: StorageReference[]
) {
  const pathsByBucket = new Map<string, string[]>()

  for (const reference of references) {
    const paths = pathsByBucket.get(reference.storage_bucket) ?? []
    paths.push(reference.storage_path)
    pathsByBucket.set(reference.storage_bucket, paths)
  }

  const urls = new Map<string, string>()
  for (const [bucket, paths] of pathsByBucket) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60)
    if (error) throw error
    for (const item of data) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
    }
  }

  return urls
}
