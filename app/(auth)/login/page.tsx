import { LoginForm } from "@/components/login-form";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();

  // Already logged in — redirect to dashboard
  if (session) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
