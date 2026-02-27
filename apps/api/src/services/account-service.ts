import { prisma } from "../db.js";
import { getUsageSnapshot } from "./usage-service.js";

export async function getAccount(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  const usage = await getUsageSnapshot(customerId);

  return {
    plan: customer.plan,
    usage,
    locale: customer.locale === "tr" ? "tr" : "en",
  };
}

export async function updateAccountLocale(customerId: string, locale: "en" | "tr") {
  const updated = await prisma.customer.update({ where: { id: customerId }, data: { locale } });
  return {
    plan: updated.plan,
    locale: updated.locale === "tr" ? "tr" : "en",
  };
}
