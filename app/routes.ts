import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("./routes/_app.tsx", [
    index("./routes/_app._index.tsx"),
    route("groups", "./routes/_app.groups.tsx"),
    route("groups/:pubId", "./routes/group/group.tsx", [route("new", "./routes/group/new.tsx")]),
    route("community", "./routes/_app.community.tsx"),
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
    route("menu", "./routes/_app.menu.tsx"),
    route("profile", "./routes/_app.profile.tsx"),
    route("profile/edit", "./routes/_app.profile.edit.tsx"),
  ]),
  route("login", "./routes/login.tsx"),
  route("signup", "./routes/signup.tsx"),
  route("logout", "./routes/logout.tsx"),
  route("setup", "./routes/setup.tsx"),
  route("pending", "./routes/pending.tsx"),
  route("forgot-password", "./routes/forgot-password.tsx"),
] satisfies RouteConfig
