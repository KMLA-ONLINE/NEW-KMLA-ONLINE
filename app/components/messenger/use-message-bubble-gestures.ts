import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import type { Message } from "~/lib/messenger/types"

const SWIPE_REPLY_START_DISTANCE = 8
const SWIPE_REPLY_TRIGGER_DISTANCE = 48
const SWIPE_REPLY_MAX_DISTANCE = 72

export function useMessageBubbleGestures({
  isMine,
  disabled,
  message,
  onOpenActions,
  onReply,
}: {
  isMine: boolean
  disabled: boolean
  message: Message
  onOpenActions: (message: Message) => void
  onReply: (message: Message) => void
}) {
  const [isSwipeActive, setIsSwipeActive] = useState(false)
  const swipeElementRef = useRef<HTMLDivElement | null>(null)
  const replyIconRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const swipeStartPointRef = useRef<{ x: number; y: number } | null>(null)
  const swipeOffsetRef = useRef(0)
  const pendingSwipeOffsetRef = useRef(0)
  const hasSwipeGestureRef = useRef(false)
  const isSwipingRef = useRef(false)

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const renderSwipeDistance = () => {
    animationFrameRef.current = null

    const swipeOffset = pendingSwipeOffsetRef.current
    const swipeElement = swipeElementRef.current
    if (swipeElement) {
      swipeElement.style.transform = swipeOffset
        ? `translateX(${isMine ? -swipeOffset : swipeOffset}px)`
        : ""
      swipeElement.style.transition = isSwipingRef.current ? "none" : "transform 160ms ease-out"
    }

    const replyIcon = replyIconRef.current
    if (replyIcon) {
      replyIcon.style.opacity = `${Math.min(1, swipeOffset / SWIPE_REPLY_TRIGGER_DISTANCE)}`
    }
  }

  const setSwipeDistance = (value: number) => {
    swipeOffsetRef.current = value
    pendingSwipeOffsetRef.current = value

    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(renderSwipeDistance)
    }
  }

  const resetSwipe = () => {
    swipeStartPointRef.current = null
    swipeOffsetRef.current = 0
    hasSwipeGestureRef.current = false
    isSwipingRef.current = false
    setIsSwipeActive(false)
    setSwipeDistance(0)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || disabled) {
      return
    }

    clearLongPress()
    const startPoint = { x: event.clientX, y: event.clientY }
    swipeStartPointRef.current = startPoint
    hasSwipeGestureRef.current = false
    setSwipeDistance(0)
    isSwipingRef.current = false
    longPressTimerRef.current = window.setTimeout(() => {
      onOpenActions(message)
      clearLongPress()
    }, 450)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startPoint = swipeStartPointRef.current
    if (!startPoint) {
      return
    }

    const deltaX = event.clientX - startPoint.x
    const deltaY = event.clientY - startPoint.y
    const movedX = Math.abs(deltaX)
    const movedY = Math.abs(deltaY)

    if (movedX > SWIPE_REPLY_START_DISTANCE || movedY > SWIPE_REPLY_START_DISTANCE) {
      clearLongPress()
    }

    if (movedY > movedX && movedY > SWIPE_REPLY_START_DISTANCE) {
      resetSwipe()
      return
    }

    const inwardDistance = isMine ? -deltaX : deltaX

    if (inwardDistance <= 0) {
      if (hasSwipeGestureRef.current) {
        setSwipeDistance(0)
      }
      return
    }

    if (inwardDistance < SWIPE_REPLY_START_DISTANCE || movedX <= movedY) {
      return
    }

    if (!hasSwipeGestureRef.current) {
      setIsSwipeActive(true)
    }

    hasSwipeGestureRef.current = true
    isSwipingRef.current = true
    setSwipeDistance(Math.min(inwardDistance, SWIPE_REPLY_MAX_DISTANCE))
  }

  const finishPointerInteraction = () => {
    const shouldReply =
      hasSwipeGestureRef.current && swipeOffsetRef.current >= SWIPE_REPLY_TRIGGER_DISTANCE

    clearLongPress()
    resetSwipe()

    if (shouldReply) {
      onReply(message)
    }
  }

  useEffect(
    () => () => {
      clearLongPress()

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    },
    []
  )

  return {
    isSwipeActive,
    swipeElementRef,
    replyIconRef,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointerInteraction,
      onPointerCancel: finishPointerInteraction,
      onPointerLeave: finishPointerInteraction,
    },
  }
}
