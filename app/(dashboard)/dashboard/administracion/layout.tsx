import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Check if user has admin or secretary role
  const userRole = await prisma.userRole.findFirst({
    where: { userId: session.user.id },
    include: { role: true },
  });

  const roleName = userRole?.role?.name;

  if (roleName !== "admin" && roleName !== "secretary") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
