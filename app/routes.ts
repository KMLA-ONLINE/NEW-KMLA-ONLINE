import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("./routes/_app.tsx", [
    index("./routes/_app.feed.tsx"),
    route("groups", "./routes/group/index.tsx"),
    // discover/create는 정적 세그먼트라 :pubId보다 먼저 매칭된다(RR7은 배열 순서가 아니라
    // 구체성으로 랭킹한다). 그래서 둘은 사실상 예약된 pub_id -- 그 슬러그를 가진 그룹은 가려진다.
    route("groups/discover", "./routes/group/discover.tsx"),
    route("groups/create", "./routes/group/create.tsx"),
    route("groups/:pubId", "./routes/group/group.tsx", [
      route("new", "./routes/group/new.tsx"),
      route("posts/:postId", "./routes/group/post.tsx"),
      route("posts/:postId/edit", "./routes/group/edit.tsx"),
    ]),
    route("clubs", "./routes/club/index.tsx"),
    route("clubs/:clubId/edit", "./routes/club/edit.tsx"),
    route("clubs/:clubId", "./routes/club/club.tsx"),
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
    // 비밀번호는 프로필이 아니라 계정 설정이다. 프로필은 남에게 보이는 명부고, 비밀번호는
    // 로그인 수단이라 성격이 다르다 -- /profile/:profileId가 남의 프로필도 그리는 화면이 된
    // 이상 그 아래 있을 자리가 없다.
    route("menu/password", "./routes/menu/password.tsx"),
    route("admin/approvals", "./routes/admin/approvals.tsx"),
    route("admin/admins", "./routes/admin/admins.tsx"),
    // /profile은 화면이 아니라 내 프로필로 보내는 이정표다. 내 것과 남의 것이 같은 라우트를
    // 쓰기 위해서고(갈리는 건 편집 권한 하나뿐), 덕분에 메뉴처럼 내 id를 모르는 자리에서도
    // /profile로 걸어둘 수 있다.
    route("profile", "./routes/profile/me.tsx"),
    route("profile/:profileId", "./routes/profile/profile.tsx", [
      // 편집은 탭이 아니라 본문 위에 뜨는 모달이다. 보기와 편집은 같은 데이터의 두 모드지
      // 나란히 고를 두 섹션이 아니다 -- 그룹의 글쓰기·수정과 같은 패턴.
      route("edit", "./routes/profile/edit.tsx"),
    ]),
  ]),
  route("login", "./routes/login.tsx"),
  route("signup", "./routes/signup.tsx"),
  route("logout", "./routes/logout.tsx"),
  route("setup", "./routes/setup.tsx"),
  route("pending", "./routes/pending.tsx"),
  route("forgot-password", "./routes/forgot-password.tsx"),
  route("reset-password", "./routes/reset-password.tsx"),
] satisfies RouteConfig
