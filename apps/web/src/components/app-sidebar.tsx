"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Activity, Bot, Database, FileDown, Search, Settings, Webhook, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { key: "dashboard", href: "/app/dashboard", icon: Activity },
  { key: "search", href: "/app/search", icon: Search },
  { key: "monitors", href: "/app/monitors", icon: Database },
  { key: "events", href: "/app/events", icon: Radio },
  { key: "webhooks", href: "/app/webhooks", icon: Webhook },
  { key: "extractions", href: "/app/extractions", icon: FileDown },
  { key: "mcp", href: "/app/mcp", icon: Bot },
  { key: "settings", href: "/app/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <aside className="panel h-fit p-4 lg:sticky lg:top-6">
      <div className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-400">Xentries Control Plane</div>
      <nav className="space-y-1.5">
        {items.map((item) => {
          const href = `/${locale}${item.href}`;
          const active = pathname === href;
          return (
            <Link
              key={item.key}
              href={href}
              className={cn(
                "focus-ring flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition",
                active ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-900/60",
              )}
            >
              <item.icon size={15} />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
