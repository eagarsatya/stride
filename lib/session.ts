import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Server-side gate for authenticated pages and actions.
 *
 * The middleware only checks for the presence of a session cookie, which is
 * enough to redirect anonymous visitors cheaply but is not proof of a valid
 * session. Every page and server action must call this for the real check.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/");
  return session.user;
}
