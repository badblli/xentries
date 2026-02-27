const trendsTtlMs = 15 * 60 * 1000;
const supportedRegions = ["US", "TR", "GB", "DE", "FR", "JP", "BR", "IN"] as const;

type RegionCode = (typeof supportedRegions)[number];

type TrendsResponse = {
  region: RegionCode;
  provider: "x";
  status: "not_supported";
  usageCost: 0;
  refreshedAt: string;
  expiresAt: string;
  items: [];
  message: string;
};

const trendCache = new Map<RegionCode, { expiresAt: number; value: TrendsResponse }>();

function normalizeRegion(input: string | undefined): RegionCode {
  const region = (input ?? "US").toUpperCase();
  return (supportedRegions as readonly string[]).includes(region) ? (region as RegionCode) : "US";
}

function buildStub(region: RegionCode): TrendsResponse {
  const now = Date.now();
  return {
    region,
    provider: "x",
    status: "not_supported",
    usageCost: 0,
    refreshedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + trendsTtlMs).toISOString(),
    items: [],
    message: "Official provider trends endpoint is not available in MVP mode.",
  };
}

export async function getTrendsResponse(regionInput: string | undefined) {
  const region = normalizeRegion(regionInput);
  const cached = trendCache.get(region);

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      cached: true,
      ttlSec: Math.max(Math.floor((cached.expiresAt - Date.now()) / 1000), 0),
      supportedRegions,
    };
  }

  const value = buildStub(region);
  trendCache.set(region, { expiresAt: Date.now() + trendsTtlMs, value });
  return {
    ...value,
    cached: false,
    ttlSec: Math.floor(trendsTtlMs / 1000),
    supportedRegions,
  };
}
