import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  await logout();
  // Redirect relative to the request host so it works em qualquer domínio (Railway, local etc).
  return NextResponse.redirect(new URL("/login", req.url), 303);
}

// POST: usado pelo botão "Sair" na sidebar.
export async function POST(req: NextRequest) {
  return handle(req);
}

// GET: permite deslogar abrindo o link direto no navegador.
export async function GET(req: NextRequest) {
  return handle(req);
}
