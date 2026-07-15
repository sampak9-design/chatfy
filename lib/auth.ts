import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE_NAME = "chatfy_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: { sub: string; email: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());
}

export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { sub: string; email: string };
  } catch {
    return null;
  }
}

export async function loginWithCredentials(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const token = await signSession({ sub: user.id, email: user.email });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
  return user;
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySession(token);
}

/**
 * The owner id for the current request (the AdminUser id in the session).
 * Every bot-scoped query filters by this so accounts never see each other's data.
 * Redirects to /login when there is no valid session.
 */
export async function requireOwnerId(): Promise<string> {
  const session = await getSession();
  if (!session?.sub) redirect("/login");
  return session.sub;
}

/** Current logged-in AdminUser row (or null). */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.sub) return null;
  return prisma.adminUser.findUnique({ where: { id: session.sub } });
}

/** True when the current user is the super-admin (can manage accounts). */
export async function isSuperAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user?.isSuperAdmin;
}

export const SESSION_COOKIE = COOKIE_NAME;
