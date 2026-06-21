import { redirect } from "next/navigation.js";
import { requireDemoSession } from "./demo-auth.ts";

export default async function Page() {
  const session = await requireDemoSession();

  redirect(session.defaultRoute);
}
