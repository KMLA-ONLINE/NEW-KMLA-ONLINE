import { PlaceholderPage } from "../components/PlaceholderPage"

export default function HomeRoute() {
  return (
    <PlaceholderPage
      title="Home"
      description="Main page with profile summary, favorites, meals, and menu shortcuts."
      access="Accepted users. Future root logic should redirect unauthenticated or incomplete users."
    />
  )
}
