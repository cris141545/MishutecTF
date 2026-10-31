"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Wallet,
  Users,
  Truck,
  UserCheck,
  RotateCcw,
  BarChart3,
  Cpu,
  Database,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  LogOut,
  UserPlus,
} from "lucide-react";
import { logoutAdminAction } from "@/lib/auth/actions";

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Productos", href: "/productos", icon: Package },
  { title: "Inventario", href: "/inventario", icon: Boxes },
  { title: "Ventas", href: "/ventas", icon: ShoppingCart },
  { title: "Caja", href: "/caja", icon: Wallet },
  { title: "Clientes", href: "/clientes", icon: Users },
  { title: "Proveedores", href: "/proveedores", icon: Truck },
  { title: "Empleados", href: "/empleados", icon: UserCheck },
  { title: "Devoluciones", href: "/devoluciones", icon: RotateCcw },
  { title: "Reportes", href: "/reportes", icon: BarChart3 },
  { title: "Usuarios", href: "/usuarios", icon: UserPlus },
];

interface SidebarProps {
  onNavigate?: () => void;
  dbName?: string;
  isAcademic?: boolean;
  isAdmin?: boolean;
}

export function Sidebar({
  onNavigate,
  dbName = "MishutecT2_Aceptacion",
  isAcademic = false,
  isAdmin = false,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logoutAdminAction();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="w-64 h-full flex flex-col bg-slate-950 border-r border-slate-800/80 text-slate-200">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center border-b border-slate-800/80 gap-3 shrink-0">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20">
          <Cpu className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
            MISHUTEC
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              SaaS
            </span>
          </span>
          <span className="text-[11px] text-slate-400">PC Hardware Enterprise</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto min-h-0">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Módulos del Sistema
        </div>

        {navItems
          .filter((item) => item.href !== "/usuarios" || isAdmin)
          .map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                prefetch={false}
                className={`flex items-center justify-between px-3.5 min-h-[44px] rounded-lg text-xs font-medium transition-all group ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300 font-semibold border-l-2 border-cyan-400 pl-3"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/80"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 transition-colors shrink-0 ${
                      isActive ? "text-cyan-400" : "text-slate-400 group-hover:text-slate-300"
                    }`}
                  />
                  <span>{item.title}</span>
                </div>
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                )}
              </Link>
            );
          })}
      </nav>

      {/* Database Connection Status Footer */}
      <div className="p-3 m-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-2 shrink-0 mt-auto">
        <div className="flex items-center justify-between text-slate-300 font-medium">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[11px]">SQL Server</span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              isAcademic
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isAcademic ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
              }`}
            />
            <span className="truncate max-w-[95px]">{dbName}</span>
          </span>
        </div>
        <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
          <span className="flex items-center gap-1 truncate max-w-[150px]">
            {isAcademic ? (
              <ShieldAlert className="h-3 w-3 text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
            )}
            Acceso con cuenta
          </span>
          <Link
            href="/diagnostico"
            onClick={onNavigate}
            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
            title="Ver diagnóstico de conexión"
          >
            Diag <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
        <button
          onClick={handleLogout}
          type="button"
          className="w-full mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
        >
          <LogOut className="h-3 w-3" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}