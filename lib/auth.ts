import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
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

export const SESSION_COOKIE = COOKIE_NAME;
