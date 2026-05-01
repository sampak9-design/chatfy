import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VSChat — Telegram Bot Manager",
  description: "Capture leads, build flows, broadcast — all from one panel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
