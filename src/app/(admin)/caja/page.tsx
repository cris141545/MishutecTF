import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCashDashboardData } from "@/lib/services/cash.service";
import { CashDashboardClient } from "@/components/cash/CashDashboardClient";

export const metadata: Metadata = {
  title: "Gestión de Caja y Arqueo Diario | MISHUTEC",
  description: "Apertura y cierre de caja, registro de ingresos y egresos, conciliación de efectivo físico y arqueo diario.",
};

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const dbName = process.env.DB_NAME || "MishutecT2_Aceptacion";
  const isAcademic = dbName.toLowerCase() === "mishutect2";

  const initialData = await getCashDashboardData();

  return (
    <CashDashboardClient
      initialData={initialData}
      dbName={dbName}
      isAcademic={isAcademic}
    />
  );
}
