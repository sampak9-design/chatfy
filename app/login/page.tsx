import { redirect } from "next/navigation";
import { getSession, loginWithCredentials } from "@/lib/auth";

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
        <div className="flex flex-col items-center gap-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="VSChat" className="w-20 h-20 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-semibold">VSChat</h1>
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
