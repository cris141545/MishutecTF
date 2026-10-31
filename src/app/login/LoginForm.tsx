"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAdminAction } from "@/lib/auth/actions";
import { sanitizeRedirectUrl } from "@/lib/auth/redirect";
import { Lock, User, AlertCircle, Loader2, ArrowRight } from "lucide-react";

interface LoginFormProps {
  fromUrl: string;
}

export function LoginForm({ fromUrl }: LoginFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(loginAdminAction, {
    success: false,
  });

  useEffect(() => {
    if (state.success) {
      const safeTarget = sanitizeRedirectUrl(fromUrl);
      router.push(safeTarget);
      router.refresh();
    }
  }, [state.success, fromUrl, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
        <Lock className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-semibold text-slate-700">
          Acceso de usuario requerido
        </span>
      </div>

      {state.error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-slate-500" />
          Usuario
        </label>
        <input
          name="username"
          type="text"
          required
          className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 transition-colors"
          placeholder="Tu usuario"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-slate-500" />
          Contraseña
        </label>
        <input
          name="password"
          type="password"
          required
          autoFocus
          className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 transition-colors"
          placeholder="••••••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-10 mt-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Verificando credenciales...</span>
          </>
        ) : (
          <>
            <span>Iniciar Sesión</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
