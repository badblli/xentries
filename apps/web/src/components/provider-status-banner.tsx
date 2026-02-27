"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";

type Props = {
  providerReady?: boolean;
  show?: boolean;
};

export function ProviderStatusBanner({ providerReady, show }: Props) {
  const t = useTranslations("app.providerBanner");
  const locale = useLocale();

  if (!show && providerReady !== false) return null;

  return (
    <Card className="border-amber-300/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3 text-amber-100">
        <AlertTriangle size={18} className="mt-0.5" />
        <div>
          <p className="font-medium">{t("title")}</p>
          <p className="mt-1 text-sm text-amber-100/90">{t("description")}</p>
          <Link href={`/${locale}/app/settings`} className="mt-2 inline-flex text-xs text-amber-200 underline underline-offset-2">
            {t("contactAdmin")}
          </Link>
        </div>
      </div>
    </Card>
  );
}
