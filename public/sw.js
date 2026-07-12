// This project ships no service worker. A previous app on this origin (localhost)
// registered one at /sw.js, and the browser keeps fetching this path to update it
// -- which the router logs as "No route matches URL /sw.js". Serving a static file
// here silences that, and this self-destroying worker unregisters the stale
// registration so the requests stop for good.
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) {
        client.navigate(client.url)
      }
    })()
  )
})
