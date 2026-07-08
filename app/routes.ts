import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("./routes/_app.tsx", [
    index("./routes/_app._index.tsx"),
    route("groups", "./routes/_app.groups.tsx"),
    route("community", "./routes/_app.community.tsx"),
    route("messenger", "./routes/_app.messenger.tsx", [
      index("./routes/_app.messenger-index.tsx"),
      route(":roomId", "./routes/_app.messenger-room.tsx", [
        route("details", "./routes/_app.messenger-room-details.tsx"),
        route("media", "./routes/_app.messenger-room-media.tsx"),
      ]),
    ]),
    route("menu", "./routes/_app.menu.tsx"),
    route("profile", "./routes/_app.profile.tsx"),
  ]),
  route("login", "./routes/login.tsx"),
  route("signup", "./routes/signup.tsx"),
  route("logout", "./routes/logout.tsx"),
  route("setup", "./routes/setup.tsx"),
  route("pending", "./routes/pending.tsx"),
  route("forgot-password", "./routes/forgot-password.tsx"),
] satisfies RouteConfig
