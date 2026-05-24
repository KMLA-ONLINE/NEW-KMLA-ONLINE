import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("./routes/_app.tsx", [
    index("./routes/_app._index.tsx"),
    route("groups", "./routes/_app.groups.tsx"),
    route("community", "./routes/_app.community.tsx"),
    route("messenger", "./routes/_app.messenger.tsx"),
    route("menu", "./routes/_app.menu.tsx"),
    route("profile", "./routes/_app.profile.tsx"),
  ]),
  route("login", "./routes/login.tsx"),
  route("logout", "./routes/logout.tsx"),
  route("auth/oauth", "./routes/auth.oauth.tsx"),
  route("auth/error", "./routes/auth.error.tsx"),
] satisfies RouteConfig
