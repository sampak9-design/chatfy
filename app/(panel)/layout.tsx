import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/PanelShell";
import { getActiveBot, listBots } from "@/lib/active-bot";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [bots, active] = await Promise.all([listBots(), getActiveBot()]);

  return (
    <PanelShell
      adminEmail={session.email}
      bots={bots.map((b) => ({ id: b.id, name: b.name, username: b.username, paused: b.paused }))}
      activeBotId={active?.id}
    >
      {children}
    </PanelShell>
  );
}
