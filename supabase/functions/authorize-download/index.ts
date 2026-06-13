import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

type DownloadRequest = {
  bucket: "avatars" | "space-images" | "post-files" | "message-files"
  path: string
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
    let body: DownloadRequest
    try {
      body = await req.json() as DownloadRequest
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 })
    }
    const authUserId = ctx.userClaims?.id
    if (
      !authUserId
      || !body
      || typeof body !== "object"
      || typeof body.path !== "string"
      || body.path.length === 0
      || body.path.length > 1024
      || !["avatars", "space-images", "post-files", "message-files"].includes(body.bucket)
    ) {
      return Response.json({ error: "invalid request" }, { status: 400 })
    }

    const { data: profile } = await ctx.supabaseAdmin.from("profiles").select("id")
      .eq("auth_user_id", authUserId).eq("status", "accepted").is("deleted_at", null).maybeSingle()
    if (!profile) return Response.json({ error: "accepted profile required" }, { status: 403 })

    let downloadName: string | boolean = false
    if (body.bucket === "avatars") {
      const { data } = await ctx.supabaseAdmin.from("profiles").select("id")
        .eq("avatar_url", body.path).eq("status", "accepted").is("deleted_at", null).maybeSingle()
      if (!data) return Response.json({ error: "avatar not accessible" }, { status: 403 })
    } else if (body.bucket === "space-images") {
      const { data } = await ctx.supabaseAdmin.from("spaces").select("id")
        .eq("image_url", body.path).is("deleted_at", null).maybeSingle()
      if (!data) return Response.json({ error: "space image not accessible" }, { status: 403 })
    } else if (body.bucket === "post-files") {
      const { data: attachment } = await ctx.supabaseAdmin.from("post_attachments").select("post_id,file_name,content_type")
        .eq("storage_path", body.path).maybeSingle()
      if (!attachment) return Response.json({ error: "post attachment not found" }, { status: 404 })
      const { data: post } = await ctx.supabaseAdmin.from("posts").select("space_id,spaces!inner(deleted_at)")
        .eq("id", attachment.post_id).is("deleted_at", null).is("spaces.deleted_at", null).maybeSingle()
      const { data: membership } = post ? await ctx.supabaseAdmin.from("space_members").select("space_id")
        .eq("space_id", post.space_id).eq("user_id", profile.id).is("banned_at", null).maybeSingle() : { data: null }
      if (!membership) return Response.json({ error: "post attachment not accessible" }, { status: 403 })
      downloadName = attachment.content_type.startsWith("image/") ? false : attachment.file_name
    } else {
      const { data: attachment } = await ctx.supabaseAdmin.from("message_attachments").select("message_id,file_name,content_type")
        .eq("storage_path", body.path).maybeSingle()
      if (!attachment) return Response.json({ error: "message attachment not found" }, { status: 404 })
      const { data: message } = await ctx.supabaseAdmin.from("messages").select("room_id")
        .eq("id", attachment.message_id).is("deleted_at", null).maybeSingle()
      const { data: membership } = message ? await ctx.supabaseAdmin.from("chat_room_members").select("room_id")
        .eq("room_id", message.room_id).eq("user_id", profile.id).maybeSingle() : { data: null }
      if (!membership) return Response.json({ error: "message attachment not accessible" }, { status: 403 })
      downloadName = attachment.content_type.startsWith("image/") ? false : attachment.file_name
    }

    const { data, error } = await ctx.supabaseAdmin.storage.from(body.bucket)
      .createSignedUrl(body.path, 60, { download: downloadName })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ signedUrl: exposeSignedUrl(req, data.signedUrl), expiresIn: 60 })
  })
}
