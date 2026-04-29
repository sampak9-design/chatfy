import { redirect } from "next/navigation";
import { getSession, loginWithCredentials } from "@/lib/auth";
import { LogIn } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const params = await searchParams;
  const error = params.error;

  async function action(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const user = await loginWithCredentials(email, password);
    if (!user) redirect("/login?error=invalid");
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        action={action}
        className="card w-full max-w-md p-8 space-y-5"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--primary)" }}
          >
            <LogIn className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Chatfy</h1>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Painel administrativo
            </p>
          </div>
        </div>

        {error && (
          <div className="text-sm rounded-lg px-3 py-2 border" style={{ borderColor: "rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", color: "#fca5a5" }}>
            E-mail ou senha incorretos.
          </div>
        )}

        <div>
          <label className="label">E-mail</label>
          <input name="email" type="email" required className="input" placeholder="admin@chatfy.local" autoComplete="username" />
        </div>

        <div>
          <label className="label">Senha</label>
          <input name="password" type="password" required className="input" placeholder="••••••••" autoComplete="current-password" />
        </div>

        <button type="submit" className="btn btn-primary w-full">Entrar</button>
      </form>
    </div>
  );
}
