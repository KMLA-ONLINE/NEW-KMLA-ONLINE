import { useState } from "react"
import { Check, Copy, KeyRound } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"

/**
 * 복구 코드를 보여주는 단 한 번의 화면.
 *
 * 서버는 이 코드로 봉인된 blob만 갖고 있지 코드 자체는 모른다. 그래서 다시 보여줄 방법이
 * 없고, 그래서 사용자가 "저장했다"고 말하기 전에는 넘어가지 못하게 막는다 -- 여기서 대충
 * 넘기면 비밀번호를 잊는 날 그 사람의 DM은 아무도, 영영 되살릴 수 없다.
 */
export function RecoveryCodeNotice({
  recoveryCode,
  continueLabel,
  onContinue,
}: {
  recoveryCode: string
  continueLabel: string
  onContinue: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드가 막힌 브라우저도 있다. 코드는 화면에 그대로 떠 있으니 손으로 적으면 된다.
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <KeyRound className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">복구 코드를 저장하세요</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          1:1 대화는 종단간 암호화되어 있어 서버도 내용을 읽지 못합니다. 그래서{" "}
          <strong className="text-foreground font-medium">
            비밀번호를 잊으면 이 코드가 유일한 열쇠
          </strong>
          입니다. 코드까지 잃으면 지난 대화는 누구도 되살릴 수 없습니다.
        </p>
      </div>

      <div className="bg-muted/60 flex flex-col gap-3 rounded-lg border p-4">
        <p
          className="text-center font-mono text-base font-semibold tracking-wider break-all select-all"
          aria-label="복구 코드"
        >
          {recoveryCode}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={copy} className="w-full">
          {copied ? (
            <Check className="mr-1.5 size-4" aria-hidden="true" />
          ) : (
            <Copy className="mr-1.5 size-4" aria-hidden="true" />
          )}
          {copied ? "복사했습니다" : "복사하기"}
        </Button>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="acknowledged"
          checked={acknowledged}
          onCheckedChange={(checked) => setAcknowledged(checked === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor="acknowledged"
          className="text-muted-foreground text-sm leading-relaxed font-normal"
        >
          안전한 곳에 저장했습니다. 이 코드는 다시 볼 수 없다는 것을 이해했습니다.
        </Label>
      </div>

      <Button type="button" className="h-10 w-full" disabled={!acknowledged} onClick={onContinue}>
        {continueLabel}
      </Button>
    </div>
  )
}
