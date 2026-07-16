// 1234 -> "1,234". toLocaleString은 런타임의 로케일 데이터에 기대므로 SSR과 브라우저가 다른 문자열을
// 낼 수 있다(그러면 하이드레이션이 어긋난다). 자릿수 구분은 규칙이 하나뿐이라 직접 만드는 게 싸다.
export function formatMemberCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
