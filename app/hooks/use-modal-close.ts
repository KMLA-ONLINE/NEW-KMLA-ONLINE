import { useCallback } from "react"
import { useLocation, useNavigate } from "react-router"

// 라우트 모달(<Link>로 여는 new/post/edit 등)을 닫는다. 모달은 열 때 히스토리에 push되는
// 항목 하나이므로, 닫을 때도 pop(navigate(-1))해서 뒤로가기로 모달이 되살아나지 않게 한다.
// navigate("..")로 닫으면 그 위에 부모를 또 push해 [부모, 모달, 부모]가 되고, 뒤로가기가
// 가운데 모달을 다시 띄운다. 단, 모달 URL로 바로 진입(딥링크)한 경우엔 돌아갈 히스토리가
// 없으니 부모로 replace 이동한다.
export function useModalClose(fallback = "..") {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    if (location.key === "default") {
      navigate(fallback, { replace: true })
    } else {
      navigate(-1)
    }
  }, [navigate, location.key, fallback])
}
