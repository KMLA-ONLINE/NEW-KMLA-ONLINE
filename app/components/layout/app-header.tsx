import { useEffect, useRef, useState } from "react"
import { BellIcon, SearchIcon, XIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

type AppHeaderProps = {
  email: string
  className?: string
}

function getInitials(email: string) {
  const base = email.split("@")[0] ?? "User"
  return base.slice(0, 2).toUpperCase()
}

export function AppHeader({ email, className }: AppHeaderProps) {
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isMobileSearchOpen) {
      return
    }

    mobileSearchInputRef.current?.focus()
  }, [isMobileSearchOpen])

  return (
    <header
      className={cn(
        "bg-background/95 fixed top-0 z-10 grid h-[calc(3.5rem+env(safe-area-inset-top))] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] backdrop-blur md:h-14 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:px-4 md:pt-0",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <a
          href="/"
          className="hover:text-primary text-sm font-semibold tracking-wide transition-colors"
        >
          KMLA Online
        </a>
      </div>
      <div className="relative mx-auto hidden w-full max-w-xl md:col-start-2 md:block">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
        <Input className="h-9 pl-9" placeholder="Search groups, posts, and people" />
      </div>
      <div className="ml-auto flex items-center gap-2 justify-self-end md:col-start-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          aria-expanded={isMobileSearchOpen}
          className="md:hidden"
          onClick={() => setIsMobileSearchOpen(true)}
        >
          <SearchIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <BellIcon />
        </Button>
        <Avatar className="size-8">
          <AvatarFallback>{getInitials(email)}</AvatarFallback>
        </Avatar>
      </div>

      <div
        className={`bg-background/95 absolute inset-0 z-20 flex items-center gap-2 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] backdrop-blur transition-all duration-200 ease-out md:hidden ${
          isMobileSearchOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2" />
          <Input
            ref={mobileSearchInputRef}
            className="h-9 pl-9"
            placeholder="Search groups, posts, and people"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setIsMobileSearchOpen(false)
              }
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close search"
          onClick={() => setIsMobileSearchOpen(false)}
        >
          <XIcon />
        </Button>
      </div>
    </header>
  )
}
