import { data as responseData, useLoaderData, type LoaderFunctionArgs } from "react-router"

import { AppShell } from "~/components/layout/app-shell"
import { createClient } from "~/lib/supabase/server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data: authData } = await supabase.auth.getUser()

  // if (error || !data?.user) {
  //   return redirect("/login")
  // }

  return responseData({ email: authData.user?.email ?? "user@kmla" }, { headers })
}

export default function AppLayout() {
  const data = useLoaderData<typeof loader>()
  return <AppShell email={data.email} />
}
