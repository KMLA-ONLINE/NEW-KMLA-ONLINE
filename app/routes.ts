import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("./routes/layout.tsx", [
    index("./routes/feed/feed.tsx"),

    route("groups", "./routes/group/index.tsx"),
    route("groups/discover", "./routes/group/discover.tsx"),
    route("groups/create", "./routes/group/create.tsx"),
    route("groups/:pubId", "./routes/group/group.tsx", [
      route("new", "./routes/group/new.tsx"),
      route("posts/:postId", "./routes/group/post.tsx"),
      route("posts/:postId/edit", "./routes/group/edit.tsx"),
    ]),

    route("noti", "./routes/noti/noti.tsx"),

    route("messenger", "./routes/messenger/messenger.tsx", [
      index("./routes/messenger/index.tsx"),
      route(":roomId", "./routes/messenger/room.tsx", [
        route("details", "./routes/messenger/details.tsx"),
        route("invite", "./routes/messenger/invite.tsx"),
        route("media", "./routes/messenger/media.tsx"),
        route("members", "./routes/messenger/members.tsx"),
        route("pinned", "./routes/messenger/pinned.tsx"),
        route("search", "./routes/messenger/search.tsx"),
      ]),
    ]),

    route("menu", "./routes/menu/menu.tsx"),
    route("menu/licenses", "./routes/menu/licenses.tsx"),
    route("menu/meal", "./routes/menu/meal.tsx"),
    route("menu/notifications", "./routes/menu/notifications.tsx"),
    route("menu/password", "./routes/menu/password.tsx"),

    route("admin/approvals", "./routes/admin/approvals.tsx"),
    route("admin/admins", "./routes/admin/admins.tsx"),

    route("profile", "./routes/profile/me.tsx"),
    route("profile/:profileId", "./routes/profile/profile.tsx", [
      route("edit", "./routes/profile/edit.tsx"),
    ]),
  ]),
  route("login", "./routes/auth/login.tsx"),
  route("signup", "./routes/auth/signup.tsx"),
  route("logout", "./routes/auth/logout.tsx"),
  route("setup", "./routes/auth/setup.tsx"),
  route("pending", "./routes/auth/pending.tsx"),
  route("forgot-password", "./routes/auth/forgot-password.tsx"),
  route("reset-password", "./routes/auth/reset-password.tsx"),
  route("__error-preview/:status", "./routes/error-preview.tsx"),
  route("*", "./routes/not-found.tsx"),
] satisfies RouteConfig
