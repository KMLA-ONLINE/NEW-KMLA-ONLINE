import { ErrorPage } from "../../components/ErrorPage"

export default function NotFoundRoute() {
  return (
    <ErrorPage
      code="404"
      title="Page not found"
      description="The requested route does not exist."
    />
  )
}
