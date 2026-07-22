import { useCallback, useState } from "react"

const STORAGE_KEY = "kmla:visited-posts:v1"
const MAX_VISITED_POSTS = 500

function loadVisitedPosts(): Set<string> {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    if (!Array.isArray(parsed)) return new Set()

    return new Set(
      parsed.filter((value): value is string => typeof value === "string").slice(-MAX_VISITED_POSTS)
    )
  } catch {
    return new Set()
  }
}

function saveVisitedPosts(postIds: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...postIds].slice(-MAX_VISITED_POSTS)))
  } catch {
    // Browsing still works when storage is unavailable.
  }
}

export function useVisitedPosts() {
  const [visitedPostIds, setVisitedPostIds] = useState(loadVisitedPosts)

  const markVisited = useCallback((postId: string) => {
    setVisitedPostIds((current) => {
      if (current.has(postId)) return current

      const next = new Set(current)
      next.add(postId)
      saveVisitedPosts(next)
      return next
    })
  }, [])

  return { visitedPostIds, markVisited }
}
