import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("./routes/_app.tsx", [
    index("./routes/_app.feed.tsx"),
    route("groups", "./routes/_app.groups.tsx"),
    // discover/create는 정적 세그먼트라 :pubId보다 먼저 매칭된다(RR7은 배열 순서가 아니라
    // 구체성으로 랭킹한다). 그래서 둘은 사실상 예약된 pub_id -- 그 슬러그를 가진 그룹은 가려진다.
    route("groups/discover", "./routes/_app.groups.discover.tsx"),
    route("groups/create", "./routes/group/create.tsx"),
    route("groups/:pubId", "./routes/group/group.tsx", [
      route("new", "./routes/group/new.tsx"),
      route("posts/:postId", "./routes/group/post.tsx"),
      route("posts/:postId/edit", "./routes/group/edit.tsx"),
    ]),
    route("noti", "./routes/_app.noti.tsx"),
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
    route("admin/approvals", "./routes/admin/approvals.tsx"),
    route("admin/admins", "./routes/admin/admins.tsx"),
    route("profile", "./routes/profile/profile.tsx"),
    route("profile/edit", "./routes/profile/edit.tsx"),
    route("profile/password", "./routes/profile/password.tsx"),
  ]),
  route("login", "./routes/login.tsx"),
  route("signup", "./routes/signup.tsx"),
  route("logout", "./routes/logout.tsx"),
  route("setup", "./routes/setup.tsx"),
  route("pending", "./routes/pending.tsx"),
  route("forgot-password", "./routes/forgot-password.tsx"),
  route("reset-password", "./routes/reset-password.tsx"),
] satisfies RouteConfig
