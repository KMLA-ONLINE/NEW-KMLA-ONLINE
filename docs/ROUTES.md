# Routes

This app uses React Router v7 Framework Mode with SPA mode enabled in `react-router.config.ts`.

`app/routes.ts` is the single source of truth for URL paths and route module files. Route modules under `app/routes/` should not duplicate their own URL path strings. If a route path changes, update `app/routes.ts` only.

## Routing Rules

- Define all URL patterns in `app/routes.ts` using `index`, `route`, `layout`, and `prefix` from `@react-router/dev/routes`.
- Use guard layouts from `app/guards/` to group routes by access rules.
- Keep route modules focused on rendering the page for that route.
- Do not add a new `src/main.tsx`, `src/routes/router.tsx`, or Vite `index.html`; framework mode owns the app entrypoint.
- Shared route UI lives in `app/components/`.
- Existing design-system components remain in `src/components/` and global styles remain in `src/styles/global.css`.

## App Structure

```txt
app/
  root.tsx
  routes.ts

  components/
    ErrorPage.tsx
    PlaceholderPage.tsx

  guards/
    accepted.tsx
    admin.tsx
    authenticated.tsx
    chat-room-member.tsx
    club-manager.tsx
    group-access.tsx
    group-manager.tsx
    group-member.tsx
    karaoke-permission.tsx
    post-owner.tsx
    public-only.tsx

  routes/
    home.tsx
    notifications.tsx
    auth/
    chat/
    clubs/
    errors/
    gisangsong/
    groups/
    home/
    life/
    onboarding/
    profile/
```

## Route Map

| Route                                 | Module                                          | Guard                | Description                                                           |
| ------------------------------------- | ----------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `/`                                   | `app/routes/home.tsx`                           | `accepted`           | Main page with profile summary, favorites, meals, and menu shortcuts. |
| `/login`                              | `app/routes/auth/login.tsx`                     | `public-only`        | Google OAuth login entry.                                             |
| `/logout`                             | `app/routes/auth/logout.tsx`                    | `authenticated`      | Sign out flow.                                                        |
| `/profile/set`                        | `app/routes/onboarding/set-profile.tsx`         | `authenticated`      | Required profile setup after first sign-in.                           |
| `/pending`                            | `app/routes/onboarding/pending.tsx`             | `authenticated`      | Admin approval pending state.                                         |
| `/rejected`                           | `app/routes/onboarding/rejected.tsx`            | `authenticated`      | Account approval rejected state.                                      |
| `/search`                             | `app/routes/home/search.tsx`                    | `accepted`           | Global group and user search.                                         |
| `/menu`                               | `app/routes/home/menu.tsx`                      | `accepted`           | Settings, shortcuts, profile edit, and logout.                        |
| `/profile`                            | `app/routes/profile/my-profile.tsx`             | `accepted`           | Current user's profile.                                               |
| `/profile/edit`                       | `app/routes/profile/edit-profile.tsx`           | `accepted`           | Current user's profile edit page.                                     |
| `/profile/:userId`                    | `app/routes/profile/user-profile.tsx`           | `accepted`           | Another user's profile.                                               |
| `/profile/:userId/posts`              | `app/routes/profile/user-posts.tsx`             | `accepted`           | Posts written by a user.                                              |
| `/groups`                             | `app/routes/groups/groups.tsx`                  | `accepted`           | Official, private, and favorite groups.                               |
| `/groups/new`                         | `app/routes/groups/new-group.tsx`               | `accepted`           | Create a private group.                                               |
| `/groups/:groupId`                    | `app/routes/groups/group-home.tsx`              | `group-access`       | Group home and post list.                                             |
| `/groups/:groupId/about`              | `app/routes/groups/group-about.tsx`             | `group-access`       | Group description.                                                    |
| `/groups/:groupId/members`            | `app/routes/groups/group-members.tsx`           | `group-access`       | Group members.                                                        |
| `/groups/:groupId/settings`           | `app/routes/groups/group-settings.tsx`          | `group-member`       | Notifications, favorite, report, and leave group settings.            |
| `/groups/:groupId/manage`             | `app/routes/groups/group-manage.tsx`            | `group-manager`      | Group metadata and member management.                                 |
| `/groups/:groupId/search`             | `app/routes/groups/group-search.tsx`            | `group-access`       | Search posts inside a group.                                          |
| `/groups/:groupId/media`              | `app/routes/groups/group-media.tsx`             | `group-access`       | Images attached to group posts.                                       |
| `/groups/:groupId/posts/new`          | `app/routes/groups/new-post.tsx`                | `group-member`       | Create a group post.                                                  |
| `/groups/:groupId/posts/:postId`      | `app/routes/groups/post-detail.tsx`             | `group-access`       | Post detail, comments, replies, and reactions.                        |
| `/groups/:groupId/posts/:postId/edit` | `app/routes/groups/edit-post.tsx`               | `post-owner`         | Edit an existing post.                                                |
| `/chat`                               | `app/routes/chat/chat-list.tsx`                 | `accepted`           | Chat room list.                                                       |
| `/chat/new`                           | `app/routes/chat/new-chat.tsx`                  | `accepted`           | Start a direct or group chat.                                         |
| `/chat/:roomId`                       | `app/routes/chat/chat-room.tsx`                 | `chat-room-member`   | Chat room detail.                                                     |
| `/chat/:roomId/settings`              | `app/routes/chat/chat-settings.tsx`             | `chat-room-member`   | Chat room settings and members.                                       |
| `/noti`                               | `app/routes/notifications.tsx`                  | `accepted`           | Non-chat notifications.                                               |
| `/gongang`                            | `app/routes/life/gongang.tsx`                   | `accepted`           | Free-period reservations and status.                                  |
| `/karaoke`                            | `app/routes/life/karaoke.tsx`                   | `karaoke-permission` | Karaoke features.                                                     |
| `/meal`                               | `app/routes/life/meal.tsx`                      | `accepted`           | Today's meals.                                                        |
| `/timetable`                          | `app/routes/life/timetable.tsx`                 | `accepted`           | Timetable.                                                            |
| `/gisangsong`                         | `app/routes/gisangsong/gisangsong.tsx`          | `accepted`           | Wake-up song list and today's song.                                   |
| `/gisangsong/request`                 | `app/routes/gisangsong/request.tsx`             | `accepted`           | Request a wake-up song.                                               |
| `/admin/gisangsong`                   | `app/routes/gisangsong/manage.tsx`              | `admin`              | Manage wake-up songs.                                                 |
| `/clubs`                              | `app/routes/clubs/clubs.tsx`                    | `accepted`           | Club list.                                                            |
| `/clubs/:clubId`                      | `app/routes/clubs/club-detail.tsx`              | `accepted`           | Club detail.                                                          |
| `/clubs/:clubId/applications`         | `app/routes/clubs/club-applications.tsx`        | `accepted`           | Club application page.                                                |
| `/admin/clubs`                        | `app/routes/clubs/manage-clubs.tsx`             | `admin`              | Create, edit, and delete clubs.                                       |
| `/admin/clubs/:clubId/applications`   | `app/routes/clubs/manage-club-applications.tsx` | `club-manager`       | Review club applications.                                             |
| `/403`                                | `app/routes/errors/forbidden.tsx`               | none                 | Access denied.                                                        |
| `/404`                                | `app/routes/errors/not-found.tsx`               | none                 | Page not found.                                                       |
| `/500`                                | `app/routes/errors/server-error.tsx`            | none                 | Server error.                                                         |
| `*`                                   | `app/routes/errors/not-found.tsx`               | none                 | Catch-all fallback.                                                   |

## Future Auth Wiring

- `/` should redirect based on session and profile status: `/login`, `/profile/set`, `/pending`, `/rejected`, or the accepted home page.
- Guard layouts should later read Supabase Auth/session/profile state and redirect or render `/403` as needed.
- Use route `clientLoader` and `clientAction` for client-side data work in SPA mode. Do not add server-only loaders unless SSR/pre-rendering is intentionally enabled.
