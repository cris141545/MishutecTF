import { AdminLayoutClient } from "@/components/layout/AdminLayoutClient";
import { isMutationAllowed } from "@/lib/db-guard";
import { getActiveSession } from "@/lib/auth/authorization";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getActiveSession();
  if (!session) {
    redirect("/login");
  }

  const guard = isMutationAllowed();

  return (
    <AdminLayoutClient
      dbName={guard.dbName}
      isAcademic={!guard.allowed}
      username={session.username}
      isAdmin={session.role === "admin"}
    >
      {children}
    </AdminLayoutClient>
  );
}