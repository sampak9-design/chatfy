import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOwnerId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Old /bot URL — keeps working but redirects to the new Channels structure.
 * If a bot exists, jumps straight to its edit page; otherwise goes to the
 * Telegram channel list.
 */
export default async function LegacyBotRedirect() {
  const ownerId = await requireOwnerId();
  const bot = await prisma.bot.findFirst({ where: { ownerId }, orderBy: { createdAt: "asc" } });
  if (bot) redirect(`/channels/telegram/${bot.id}`);
  redirect("/channels/telegram");
}
