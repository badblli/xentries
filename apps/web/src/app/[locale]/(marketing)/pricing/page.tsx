"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  const locale = useLocale();
  const t = useTranslations("marketing.pricing");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const plans = ["starter", "pro", "scale"] as const;

  const rows = useMemo(
    () =>
      plans.map((plan) => ({
        plan,
        name: t(`${plan}.name`),
        desc: t(`${plan}.desc`),
        monthly: t(`${plan}.monthly`),
        yearly: t(`${plan}.yearly`),
        events: t(`${plan}.events`),
        retention: t(`${plan}.retention`),
        webhooks: t(`${plan}.webhooks`),
        support: t(`${plan}.support`),
        popular: plan === "pro",
      })),
    [t],
  );
  const compareRows = [
    { key: "events", starter: t("starter.events"), pro: t("pro.events"), scale: t("scale.events") },
    { key: "retention", starter: t("starter.retention"), pro: t("pro.retention"), scale: t("scale.retention") },
    { key: "webhooks", starter: t("starter.webhooks"), pro: t("pro.webhooks"), scale: t("scale.webhooks") },
    { key: "support", starter: t("starter.support"), pro: t("pro.support"), scale: t("scale.support") },
  ] as const;

  return (
    <div className="space-y-6">
      <Card className="soft-glow border-slate-700/70">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold sm:text-4xl">{t("title")}</h1>
            <p className="mt-2 max-w-2xl text-slate-400">{t("subtitle")}</p>
            <p className="mt-3 text-sm text-cyan-200">{t("paymentHint")}</p>
          </div>
          <div className="panel inline-flex rounded-xl border border-slate-700 p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`focus-ring rounded-lg px-4 py-2 text-sm ${billing === "monthly" ? "bg-slate-100 text-slate-900" : "text-slate-300"}`}
            >
              {t("billing.monthly")}
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`focus-ring rounded-lg px-4 py-2 text-sm ${billing === "yearly" ? "bg-slate-100 text-slate-900" : "text-slate-300"}`}
            >
              {t("billing.yearly")}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {rows.map((row, i) => (
          <motion.div
            key={row.plan}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
          >
            <Card className={`h-full border-slate-700/70 ${row.popular ? "soft-glow border-cyan-400/60" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{row.name}</h2>
                {row.popular ? <Badge className="bg-cyan-400/20 text-cyan-100"><Sparkles className="mr-1 h-3 w-3" />{t("popular")}</Badge> : null}
              </div>
              <p className="mt-2 text-sm text-slate-400">{row.desc}</p>
              <p className="mt-5 text-4xl font-semibold">{billing === "monthly" ? row.monthly : row.yearly}</p>
              <p className="mt-1 text-xs text-slate-400">{billing === "yearly" ? t("annualSavings") : t("monthlyBilling")}</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-300">
                {[row.events, row.retention, row.webhooks, row.support].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-cyan-300" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/${locale}/app/login`} className="mt-6 block">
                <Button className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">{t("cta")}</Button>
              </Link>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border-slate-700/70">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("faq.label")}</p>
        <h3 className="mt-2 text-2xl font-semibold">{t("faq.title")}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {["q1", "q2", "q3"].map((q) => (
            <div key={q} className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4">
              <p className="font-medium">{t(`faq.${q}.title`)}</p>
              <p className="mt-2 text-sm text-slate-400">{t(`faq.${q}.desc`)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-slate-700/70 p-0">
        <div className="border-b border-slate-800 p-4">
          <h3 className="text-lg font-semibold">{t("comparison.title")}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/50 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">{t("comparison.feature")}</th>
                <th className="px-4 py-3 font-medium">{t("starter.name")}</th>
                <th className="px-4 py-3 font-medium">{t("pro.name")}</th>
                <th className="px-4 py-3 font-medium">{t("scale.name")}</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.key} className="border-b border-slate-800/70 text-slate-300">
                  <td className="px-4 py-3 text-slate-400">{t(`comparison.rows.${row.key}`)}</td>
                  <td className="px-4 py-3">{row.starter}</td>
                  <td className="px-4 py-3">{row.pro}</td>
                  <td className="px-4 py-3">{row.scale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
