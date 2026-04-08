import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { CalendarDays, Mail, Shield } from "lucide-react";

export default async function DashboardPage() {
  const authUser = await requireAuth();

  // Fetch full user record from database
  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: {
      accounts: {
        select: { provider: true },
      },
    },
  });

  if (!user) {
    return null;
  }

  const joinedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(user.createdAt);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.name ?? "there"}!
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            <UserAvatar
              name={user.name}
              image={user.image}
              className="h-8 w-8"
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {user.name ?? "No name set"}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {user.email}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold truncate">{user.email}</div>
            <p className="text-xs text-muted-foreground">
              {user.emailVerified ? "Verified" : "Not verified"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{joinedDate}</div>
            <p className="text-xs text-muted-foreground">Account created</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Connected Accounts
          </CardTitle>
          <CardDescription>
            Authentication providers linked to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user.accounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {user.accounts.map((account: { provider: string }) => (
                <span
                  key={account.provider}
                  className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium capitalize"
                >
                  {account.provider}
                </span>
              ))}
              {user.password && (
                <span className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium">
                  credentials
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {user.password ? "Credentials (email + password)" : "No providers connected"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
