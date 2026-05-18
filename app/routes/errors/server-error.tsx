import { ErrorPage } from "../../components/ErrorPage"

export default function ServerErrorRoute() {
  return (
    <ErrorPage
      code="500"
      title="Server error"
      description="Something went wrong while loading this page."
    />
  )
}
