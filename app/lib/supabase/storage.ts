import type { SupabaseClient } from "@supabase/supabase-js"

import { compressImage, type ImagePreset } from "~/lib/image/compress"
import type { Database } from "~/lib/supabase/database.types"

type StorageReference = {
  storage_bucket: string
  storage_path: string
}

export type ImageBucket = "avatars" | "profile-covers" | "space-images" | "space-covers"

// 이미지 업로드의 저수준 프리미티브. 압축이 이 함수 안에 박혀 있어 "압축 없이 이미지 업로드"라는
// 조합이 호출부에 존재하지 않는다 — compressImage는 여기서만 불린다. raw
// supabase.storage.from().upload()는 이 파일 밖에서 eslint(no-restricted-syntax)로 금지되므로,
// 모든 이미지는 반드시 이 문을 지난다. 정책이 아니라 구조로 강제된다.
//
// 업로드만 하고 DB에는 잇지 않는다(그건 finalize). 지점별 래퍼(uploadAvatar 등)가 이 함수로 올린 뒤
// 반환된 path를 매칭되는 finalize RPC에 넘긴다 — 컴포넌트는 그 래퍼만 부른다.
//
// object 이름은 `pathPrefix + v4 uuid`로 여기서 조립한다. prefix는 버킷 insert policy가 요구하는
// 접두사다(identity 버킷은 `${auth_uid}/`, space 버킷은 `${space.pub_id}/`). uuid를 호출부가 아니라
// 이 함수가 붙여, storage의 has_uuid_object_suffix 계약을 by construction으로 만족시킨다. 확장자는
// 붙이지 않는다 — policy가 이름을 prefix+uuid와 정확히 대조하고, MIME은 이름이 아니라 metadata로 본다.
export async function uploadImage(
  supabase: SupabaseClient<Database>,
  params: { bucket: ImageBucket; pathPrefix: string; preset: ImagePreset; file: File }
): Promise<{ path: string }> {
  const { bucket, pathPrefix, preset, file } = params
  const compressed = await compressImage(file, preset)
  const path = `${pathPrefix}${crypto.randomUUID()}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, compressed, { contentType: compressed.type, upsert: false })
  if (error) throw error

  return { path }
}

// identity 버킷(avatars/profile-covers)의 경로 접두사. 업로드 policy와 finalize가 요구하는 값과
// 같아야 하므로 auth 사용자 id에서 만든다(profiles.id가 아니라 auth.uid()).
async function authPathPrefix(supabase: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error("not authenticated")
  return `${data.user.id}/`
}

// 지점별 얇은 래퍼. 각자 (업로드 → 매칭 finalize)를 한 번에 끝내, 컴포넌트가 압축/경로/finalize를
// 몰라도 되게 한다. finalize가 실패하면 object는 붙지 않은 채 남고 48시간 orphan sweep이 걷어간다.

/** 본인 프로필 사진을 올리고 profiles.avatar_url에 잇는다. */
export async function uploadAvatar(
  supabase: SupabaseClient<Database>,
  file: File
): Promise<{ path: string }> {
  const prefix = await authPathPrefix(supabase)
  const { path } = await uploadImage(supabase, {
    bucket: "avatars",
    pathPrefix: prefix,
    preset: "avatar",
    file,
  })
  const { error } = await supabase.rpc("finalize_avatar", { p_storage_path: path })
  if (error) throw error
  return { path }
}

/** 본인 프로필 커버를 올리고 profiles.cover_image_url에 잇는다. */
export async function uploadProfileCover(
  supabase: SupabaseClient<Database>,
  file: File
): Promise<{ path: string }> {
  const prefix = await authPathPrefix(supabase)
  const { path } = await uploadImage(supabase, {
    bucket: "profile-covers",
    pathPrefix: prefix,
    preset: "profileCover",
    file,
  })
  const { error } = await supabase.rpc("finalize_cover_image", { p_storage_path: path })
  if (error) throw error
  return { path }
}

/** 스페이스 아이콘을 올리고 spaces.image_url에 잇는다. 경로는 pub_id, finalize는 bigint id를 쓴다. */
export async function uploadSpaceImage(
  supabase: SupabaseClient<Database>,
  params: { spaceId: number; spacePubId: string; file: File }
): Promise<{ path: string }> {
  const { spaceId, spacePubId, file } = params
  const { path } = await uploadImage(supabase, {
    bucket: "space-images",
    pathPrefix: `${spacePubId}/`,
    preset: "spaceImage",
    file,
  })
  const { error } = await supabase.rpc("finalize_space_image", {
    p_space_id: spaceId,
    p_storage_path: path,
  })
  if (error) throw error
  return { path }
}

/** 스페이스 커버(배너)를 올리고 spaces.cover_image_url에 잇는다. */
export async function uploadSpaceCover(
  supabase: SupabaseClient<Database>,
  params: { spaceId: number; spacePubId: string; file: File }
): Promise<{ path: string }> {
  const { spaceId, spacePubId, file } = params
  const { path } = await uploadImage(supabase, {
    bucket: "space-covers",
    pathPrefix: `${spacePubId}/`,
    preset: "spaceCover",
    file,
  })
  const { error } = await supabase.rpc("finalize_space_cover", {
    p_space_id: spaceId,
    p_storage_path: path,
  })
  if (error) throw error
  return { path }
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
