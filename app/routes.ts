import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes"

export default [
  layout("./guards/public-only.tsx", [route("login", "./routes/auth/login.tsx")]),

  layout("./guards/authenticated.tsx", [
    route("logout", "./routes/auth/logout.tsx"),
    route("profile/set", "./routes/onboarding/set-profile.tsx"),
    route("pending", "./routes/onboarding/pending.tsx"),
    route("rejected", "./routes/onboarding/rejected.tsx"),
  ]),

  layout("./guards/accepted.tsx", [
    index("./routes/home.tsx"),
    route("search", "./routes/home/search.tsx"),
    route("menu", "./routes/home/menu.tsx"),
    route("profile", "./routes/profile/my-profile.tsx"),
    route("profile/edit", "./routes/profile/edit-profile.tsx"),
    route("profile/:userId", "./routes/profile/user-profile.tsx"),
    route("profile/:userId/posts", "./routes/profile/user-posts.tsx"),
    route("noti", "./routes/notifications.tsx"),
    route("gongang", "./routes/life/gongang.tsx"),
    route("meal", "./routes/life/meal.tsx"),
    route("timetable", "./routes/life/timetable.tsx"),
    route("gisangsong", "./routes/gisangsong/gisangsong.tsx"),
    route("gisangsong/request", "./routes/gisangsong/request.tsx"),
    route("clubs", "./routes/clubs/clubs.tsx"),
    route("clubs/:clubId", "./routes/clubs/club-detail.tsx"),
    route("clubs/:clubId/applications", "./routes/clubs/club-applications.tsx"),
    ...prefix("groups", [
      index("./routes/groups/groups.tsx"),
      route("new", "./routes/groups/new-group.tsx"),
    ]),
    ...prefix("chat", [
      index("./routes/chat/chat-list.tsx"),
      route("new", "./routes/chat/new-chat.tsx"),
    ]),
  ]),

  layout("./guards/karaoke-permission.tsx", [route("karaoke", "./routes/life/karaoke.tsx")]),

  layout("./guards/group-access.tsx", [
    ...prefix("groups/:groupId", [
      index("./routes/groups/group-home.tsx"),
      route("about", "./routes/groups/group-about.tsx"),
      route("members", "./routes/groups/group-members.tsx"),
      route("search", "./routes/groups/group-search.tsx"),
      route("media", "./routes/groups/group-media.tsx"),
      route("posts/:postId", "./routes/groups/post-detail.tsx"),
    ]),
  ]),

  layout("./guards/group-member.tsx", [
    route("groups/:groupId/settings", "./routes/groups/group-settings.tsx"),
    route("groups/:groupId/posts/new", "./routes/groups/new-post.tsx"),
  ]),

  layout("./guards/group-manager.tsx", [
    route("groups/:groupId/manage", "./routes/groups/group-manage.tsx"),
  ]),

  layout("./guards/post-owner.tsx", [
    route("groups/:groupId/posts/:postId/edit", "./routes/groups/edit-post.tsx"),
  ]),

  layout("./guards/chat-room-member.tsx", [
    route("chat/:roomId", "./routes/chat/chat-room.tsx"),
    route("chat/:roomId/settings", "./routes/chat/chat-settings.tsx"),
  ]),

  layout("./guards/admin.tsx", [
    route("admin/gisangsong", "./routes/gisangsong/manage.tsx"),
    route("admin/clubs", "./routes/clubs/manage-clubs.tsx"),
  ]),

  layout("./guards/club-manager.tsx", [
    route("admin/clubs/:clubId/applications", "./routes/clubs/manage-club-applications.tsx"),
  ]),

  route("403", "./routes/errors/forbidden.tsx"),
  route("404", "./routes/errors/not-found.tsx"),
  route("500", "./routes/errors/server-error.tsx"),
  route("*", "./routes/errors/catch-all.tsx"),
] satisfies RouteConfig
