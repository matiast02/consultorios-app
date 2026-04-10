import { redirect } from "next/navigation";

// Registration is now admin-only (via dashboard).
// Redirect to login if someone visits /register directly.
export default function RegisterPage() {
  redirect("/login");
}
