// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { renderBlock, renderInline, toPlainTextPreview } from "./render"

describe("renderInline", () => {
  it("사용자 입력을 이스케이프해 태그 주입을 막는다", () => {
    const html = renderInline("<script>alert(1)</script>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("굵게/기울임을 적용한다", () => {
    expect(renderInline("**굵게**")).toContain("<strong>굵게</strong>")
    expect(renderInline("*기울임*")).toContain("<em>기울임</em>")
  })

  it("제목 표식은 떼고 텍스트만 남긴다(블록 없음)", () => {
    const html = renderInline("# 제목")
    expect(html).toContain("제목")
    expect(html).not.toContain("<h")
    expect(html).not.toContain("#")
  })

  it("공백에 붙은 별표는 서식으로 오인하지 않는다", () => {
    expect(renderInline("2 * 3 * 4")).not.toContain("<em>")
  })

  it("이모지를 Twemoji 이미지로 바꾼다", () => {
    expect(renderInline("👍")).toContain('class="emoji"')
  })

  it("카드에서는 연속 줄바꿈을 하나로 접는다", () => {
    expect(renderInline("가\n\n\n나")).toBe("가\n나")
  })

  it("\\* 이스케이프는 문자 그대로의 별표로 남기고 서식하지 않는다", () => {
    const html = renderInline("\\*중요\\*")
    expect(html).toContain("*중요*")
    expect(html).not.toContain("<em>")
    expect(html).not.toContain("\\")
  })
})

describe("renderBlock", () => {
  it("제목 2단계를 h3/h4로 낸다", () => {
    expect(renderBlock("# 큰제목")).toContain("<h3>큰제목</h3>")
    expect(renderBlock("## 작은제목")).toContain("<h4>작은제목</h4>")
  })

  it("사용자 HTML을 이스케이프한다", () => {
    const html = renderBlock("<script>alert(1)</script>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("원본 줄바꿈을 HTML에도 그대로 둔다", () => {
    expect(renderBlock("가\n\n나")).toContain("<p>가\n\n나</p>")
    expect(renderBlock("가\n\n\n나")).toContain("<p>가\n\n\n나</p>")
  })

  it("문단 안 단일 개행을 보존한다", () => {
    expect(renderBlock("가\n나")).toContain("<p>가\n나</p>")
  })

  it("문단 안에서도 굵게가 먹는다", () => {
    expect(renderBlock("**굵게**")).toContain("<p><strong>굵게</strong></p>")
  })
})

describe("toPlainTextPreview", () => {
  it("지원 Markdown 표식만 제거한다", () => {
    expect(toPlainTextPreview("# 제목\n**굵게**와 *기울임*")).toBe("제목\n굵게와 기울임")
  })
})
