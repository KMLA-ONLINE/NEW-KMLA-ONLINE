import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router"

import { AppShell } from "~/components/layout/app-shell"
import { createClient } from "~/lib/supabase/server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase } = createClient(request)
  const { data, error } = await supabase.auth.getUser()

  // if (error || !data?.user) {
  //   return redirect("/login")
  // }

  return { email: data.user?.email ?? "user@kmla" }
}

export default function AppLayout() {
  const data = useLoaderData<typeof loader>()
  return <AppShell email={data.email} />
}
