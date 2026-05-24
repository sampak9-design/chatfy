import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
  small?: boolean;
}

export function EmptyState({ icon: Icon, title, description, cta, small }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${small ? "py-10" : "py-16 md:py-24"}`}
      style={{ color: "var(--text-dim)" }}
    >
      <div
        className={`rounded-2xl flex items-center justify-center mb-4 ${small ? "w-12 h-12" : "w-16 h-16"}`}
        style={{ background: "rgba(249,115,22,0.10)", color: "var(--primary)" }}
      >
        <Icon className={small ? "w-6 h-6" : "w-8 h-8"} />
      </div>
      <h3 className={`font-semibold ${small ? "text-base" : "text-lg"}`} style={{ color: "var(--text)" }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm mt-1 max-w-md" style={{ color: "var(--text-faint)" }}>
          {description}
        </p>
      )}
      {cta && (
        <Link href={cta.href} className="btn btn-primary mt-5">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
