export type PlanId = "free" | "pro" | "business";

export type PlanLimits = {
  id: PlanId;
  label: string;
  maxWorkspaces: number;
  maxDocumentsPerWorkspace: number;
  maxStorageMb: number;
  maxUploadMb: number;
  maxEmbedMessagesPerMonth: number;
};

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: "free",
    label: "Free",
    maxWorkspaces: 2,
    maxDocumentsPerWorkspace: 5,
    maxStorageMb: 50,
    maxUploadMb: 10,
    maxEmbedMessagesPerMonth: 200,
  },
  pro: {
    id: "pro",
    label: "Pro",
    maxWorkspaces: 10,
    maxDocumentsPerWorkspace: 50,
    maxStorageMb: 500,
    maxUploadMb: 50,
    maxEmbedMessagesPerMonth: 5_000,
  },
  business: {
    id: "business",
    label: "Business",
    maxWorkspaces: 100,
    maxDocumentsPerWorkspace: 500,
    maxStorageMb: 10_000,
    maxUploadMb: 100,
    maxEmbedMessagesPerMonth: 100_000,
  },
};

export function resolvePlanId(raw: string | null | undefined): PlanId {
  if (raw === "pro" || raw === "business") return raw;
  return "free";
}

export function getPlanLimits(planId: string | null | undefined): PlanLimits {
  return PLANS[resolvePlanId(planId)];
}
