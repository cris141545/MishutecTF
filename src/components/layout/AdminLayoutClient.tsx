"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { X } from "lucide-react";

interface AdminLayoutClientProps {
  children: React.ReactNode;
  dbName: string;
  isAcademic: boolean;
}

export function AdminLayoutClient({
  children,
  dbName,
  isAcademic,
}: AdminLayoutClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // 1. Bloqueo del scroll del body mientras el drawer móvil está abierto
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // 2. Cierre mediante la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <div className="h-screen h-[100dvh] flex overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-blue-500/20 selection:text-blue-700">
      {/* Sidebar Escritorio (fijo para pantallas lg+) */}
      <div className="hidden lg:flex lg:flex-shrink-0 h-full">
        <Sidebar dbName={dbName} isAcademic={isAcademic} />
      </div>

      {/* Drawer Móvil para pantallas pequeñas */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación principal"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          {/* Fondo oscuro traslúcido */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Contenedor del Sidebar con botón de cerrar accesible */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-950 shadow-2xl z-10 animate-in slide-in-from-left duration-200 h-full">
            <div className="absolute top-3.5 right-3.5 z-20">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800 transition-colors"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar
              dbName={dbName}
              isAcademic={isAcademic}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Área Principal de Contenido - Con scroll independiente del Sidebar */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
        <Header
          dbName={dbName}
          isAcademic={isAcademic}
          onToggleMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}