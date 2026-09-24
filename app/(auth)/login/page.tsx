import { LoginForm } from "@/components/login-form";
import { getSession } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await getSession();

  // Already logged in — redirect to dashboard
  if (session) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
