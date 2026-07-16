import { useEffect, useLayoutEffect } from "react"

/**
 * `useLayoutEffect`인데 서버에서는 `useEffect`다.
 *
 * 레이아웃 이펙트는 DOM이 커밋된 뒤 **브라우저가 그리기 전에** 동기로 돈다. 그래서 첫
 * 페인트에 이미 반영돼 있어야 하는 것 -- 채팅을 바닥으로 내려놓는 일 같은 것 -- 은 여기서
 * 해야 한다. `useEffect`로 하면 브라우저가 한 번 그린 다음에 고치는 것이라, 고치기 전의
 * 프레임이 사용자 눈에 그대로 보인다.
 *
 * 브라우저 밖(빌드 시 root 셸 프리렌더)에는 페인트가 없어서 React가 경고를 찍는다. 그때는
 * `useEffect`로 바꿔 치운다 -- 어차피 거기서는 둘 다 실행되지 않는다.
 */
export const useIsomorphicLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect
