import { useEffect, useState } from "react"

// value가 delayMs 동안 안 바뀌고 유지되면 그 값을 돌려준다. 검색어를 이걸로 감싸면 타이핑이
// 멈춘 뒤에만 실제 검색이 돈다 -- 백엔드에 붙었을 때 키 입력마다 쿼리를 날리지 않게 한다.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
