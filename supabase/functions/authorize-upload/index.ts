import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

type UploadRequest = {
  kind: "avatar" | "space-image" | "post-file" | "message-file"
  parentId?: number
  contentType: string
  sizeBytes: number
}

function exposeSignedUrl(req: Request, value: string) {
  const signedUrl = new URL(value)
  const forwardedHost = req.headers.get("x-forwarded-host")
  const forwardedPort = req.headers.get("x-forwarded-port")
  const forwardedProto = req.headers.get("x-forwarded-proto")
  const host = forwardedHost && forwardedPort && !forwardedHost.includes(":")
    ? `${forwardedHost}:${forwardedPort}`
    : forwardedHost
  const publicUrl = host
    ? new URL(`${forwardedProto ?? "https"}://${host}`)
    : new URL(req.url)
  signedUrl.protocol = publicUrl.protocol
  signedUrl.host = publicUrl.host
  return signedUrl.toString()
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    let body: UploadRequest
    try {
      body = await req.json() as UploadRequest
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 })
    }
    const authUserId = ctx.userClaims?.id
    if (
      !authUserId
      || !body
      || typeof body !== "object"
      || typeof body.contentType !== "string"
      || !Number.isSafeInteger(body.sizeBytes)
      || body.sizeBytes <= 0
    ) {
      return Response.json({ error: "invalid request" }, { status: 400 })
    }

    const { data: profile } = await ctx.supabaseAdmin.from("profiles")
      .select("id,status,deleted_at")
      .eq("auth_user_id", authUserId)
      .eq("status", "accepted")
      .is("deleted_at", null)
      .maybeSingle()
    if (!profile) return Response.json({ error: "accepted profile required" }, { status: 403 })

    const imageTypes = ["image/jpeg", "image/png", "image/webp"]
    const fileTypes = [
      ...imageTypes,
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/rtf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/x-hwp",
      "application/haansofthwp",
      "application/haansofthwpx",
      "application/vnd.hancom.hwp",
      "application/vnd.hancom.hwpx",
      "application/x-hwpx",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.oasis.opendocument.presentation",
    ]
    let bucket: string
    let prefix: string
    let maxSize: number
    let allowedTypes: string[]

    if (body.kind === "avatar") {
      bucket = "avatars"; prefix = `${authUserId}/`; maxSize = 5_000_000; allowedTypes = imageTypes
    } else if (body.kind === "space-image") {
      if (!Number.isSafeInteger(body.parentId) || (body.parentId ?? 0) <= 0) {
        return Response.json({ error: "valid parentId required" }, { status: 400 })
      }
      const { data: membership } = await ctx.supabaseAdmin.from("space_members")
        .select("spaces!inner(pub_id,deleted_at)")
        .eq("space_id", body.parentId)
        .eq("user_id", profile.id)
        .in("role", ["owner", "admin"])
        .is("banned_at", null)
        .is("spaces.deleted_at", null)
        .maybeSingle()
      const space = membership?.spaces as unknown as { pub_id: string } | null
      if (!space) return Response.json({ error: "space manager required" }, { status: 403 })
      bucket = "space-images"; prefix = `${space.pub_id}/`; maxSize = 10_000_000; allowedTypes = imageTypes
    } else if (body.kind === "post-file") {
      if (!Number.isSafeInteger(body.parentId) || (body.parentId ?? 0) <= 0) {
        return Response.json({ error: "valid parentId required" }, { status: 400 })
      }
      const { data: post } = await ctx.supabaseAdmin.from("posts").select("pub_id,space_id,spaces!inner(deleted_at)")
        .eq("id", body.parentId).eq("author_id", profile.id).is("deleted_at", null).is("spaces.deleted_at", null).maybeSingle()
      if (!post) return Response.json({ error: "active owned post required" }, { status: 403 })
      const { data: membership } = await ctx.supabaseAdmin.from("space_members").select("space_id")
        .eq("space_id", post.space_id).eq("user_id", profile.id).is("banned_at", null).maybeSingle()
      if (!membership) return Response.json({ error: "active space membership required" }, { status: 403 })
      bucket = "post-files"; prefix = `${post.pub_id}/${authUserId}/`; maxSize = 25_000_000; allowedTypes = fileTypes
    } else if (body.kind === "message-file") {
      if (!Number.isSafeInteger(body.parentId) || (body.parentId ?? 0) <= 0) {
        return Response.json({ error: "valid parentId required" }, { status: 400 })
      }
      const { data: message } = await ctx.supabaseAdmin.from("messages").select("id,room_id")
        .eq("id", body.parentId).eq("sender_id", profile.id).is("deleted_at", null).maybeSingle()
      if (!message) return Response.json({ error: "active owned message required" }, { status: 403 })
      const { data: membership } = await ctx.supabaseAdmin.from("chat_room_members").select("room_id")
        .eq("room_id", message.room_id).eq("user_id", profile.id).maybeSingle()
      if (!membership) return Response.json({ error: "room membership required" }, { status: 403 })
      bucket = "message-files"; prefix = `${message.room_id}/${message.id}/${authUserId}/`; maxSize = 25_000_000; allowedTypes = fileTypes
    } else {
      return Response.json({ error: "invalid upload kind" }, { status: 400 })
    }

    if (body.sizeBytes > maxSize || !allowedTypes.includes(body.contentType)) {
      return Response.json({ error: "file type or size not allowed" }, { status: 400 })
    }

    const path = `${prefix}${crypto.randomUUID()}`
    const { error: quotaError } = await ctx.supabaseAdmin.rpc("record_upload_authorization", {
      p_profile_id: profile.id,
      p_storage_bucket: bucket,
      p_storage_path: path,
      p_size_bytes: body.sizeBytes
    })
    if (quotaError) return Response.json({ error: quotaError.message }, { status: 429 })

    const { data, error } = await ctx.supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ bucket, path, token: data.token, signedUrl: exposeSignedUrl(req, data.signedUrl) })
  })
}
