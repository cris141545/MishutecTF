import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth/authorization";
import { listManagedUsers } from "@/lib/auth/user-actions";
import { UserManagementClient } from "@/components/users/UserManagementClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getActiveSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard");

  const users = await listManagedUsers();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Usuarios del sistema
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Crea cuentas personales y desactiva el acceso cuando alguien ya no necesite usar Mishutec.
        </p>
      </header>
      <UserManagementClient initialUsers={users} />
    </section>
  );
}
