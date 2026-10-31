"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, UserPlus, UserRound, UserX } from "lucide-react";
import {
  createManagedUser,
  setManagedUserActive,
  type ManagedUser,
} from "@/lib/auth/user-actions";

interface UserManagementClientProps {
  initialUsers: ManagedUser[];
}

export function UserManagementClient({ initialUsers }: UserManagementClientProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isCreating] = useActionState(createManagedUser, {
    success: false,
  });
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.success, state.message]);

  async function toggleUser(user: ManagedUser) {
    setPendingUserId(user.userId);
    setUpdateMessage("");
    try {
      const result = await setManagedUserActive(user.userId, !user.isActive);
      setUpdateMessage(result.message ?? result.error ?? "");
      if (result.success) router.refresh();
    } catch (error) {
      console.error("No se pudo actualizar la cuenta de usuario.", error);
      setUpdateMessage("No se pudo actualizar la cuenta. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <form
        ref={formRef}
        action={formAction}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Crear cuenta</h2>
        </div>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Nombre de usuario
          <input
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={50}
            pattern="[A-Za-z0-9._-]+"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="ej. operador1"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Contraseña inicial
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Al menos 12 caracteres"
          />
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Comparte la contraseña de forma privada. No hay registro público.
        </p>
        {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
        {state.success && (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={isCreating}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Crear usuario
        </button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Cuentas individuales</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Todas las cuentas activas pueden operar los módulos del sistema.
          </p>
        </div>
        {updateMessage && (
          <p role="status" className="px-5 pt-4 text-sm text-slate-600 dark:text-slate-300">
            {updateMessage}
          </p>
        )}
        {initialUsers.length === 0 ? (
          <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
            Aún no se han creado cuentas adicionales.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {initialUsers.map((user) => (
              <li
                key={user.userId}
                className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {user.username}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Creada {user.createdAt.slice(0, 10)}
                      {" · "}
                      {user.isActive ? "Activa" : "Desactivada"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pendingUserId === user.userId}
                  onClick={() => void toggleUser(user)}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold disabled:opacity-60 ${
                    user.isActive
                      ? "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
                  }`}
                >
                  {pendingUserId === user.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : user.isActive ? (
                    <UserX className="h-3.5 w-3.5" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  {user.isActive ? "Desactivar" : "Reactivar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
