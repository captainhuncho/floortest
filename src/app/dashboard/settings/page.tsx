import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function Settings() {
  const user = await requireUser();
  redirect(user.role === "member" ? "/dashboard/settings/team" : "/dashboard/settings/profile");
}
