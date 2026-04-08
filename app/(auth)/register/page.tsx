import { RegisterForm } from "@/components/register-form";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const session = await auth();

  // Already logged in — redirect to dashboard
  if (session) {
    redirect("/dashboard");
  }

  return <RegisterForm />;
}
