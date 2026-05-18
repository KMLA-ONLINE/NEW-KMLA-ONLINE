import { ErrorPage } from "../../components/ErrorPage"

export default function ForbiddenRoute() {
  return (
    <ErrorPage
      code="403"
      title="Access denied"
      description="You do not have permission to access this page."
    />
  )
}
