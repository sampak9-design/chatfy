import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <Sidebar adminEmail={session.email} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
