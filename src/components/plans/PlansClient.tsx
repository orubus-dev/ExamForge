"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Sparkles } from "lucide-react";
import { Badge, Button, Card, PageHeader, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { TierInfo } from "@/lib/plans";
import type { Tier } from "@/lib/types";

export default function PlansClient({
  tiers,
  currentTier,
  pendingTier,
  activeExams,
}: {
  tiers: Record<Tier, TierInfo>;
  currentTier: Tier;
  pendingTier: string | null;
  activeExams: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<Tier | null>(null);
  const order: Tier[] = ["free", "plus", "pro", "enterprise"];

  const checkout = async (tier: Tier) => {
    setBusy(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? "Checkout failed");
      toast.push({
        kind: "info",
        title: body.message ?? "Checkout wiring in progress — tier saved",
        body: "Your tier is recorded and limits update the moment it activates.",
      });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Checkout failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Plans" />

      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2 text-sm">
          <Sparkles size={15} className="text-moss-600" aria-hidden />
          Current plan: <Badge tone="success">{tiers[currentTier].label}</Badge>
          {pendingTier && (
            <Badge tone="warning">checkout pending: {pendingTier}</Badge>
          )}
        </p>
        <p className="text-xs text-muted">
          {activeExams} / {tiers[currentTier].activeExams} active exams
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {order.map((tier) => {
          const info = tiers[tier];
          const isCurrent = tier === currentTier;
          return (
            <Card
              key={tier}
              className={cn(
                "flex flex-col p-6",
                isCurrent && "border-jade-400 dark:border-jade-600"
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{info.label}</h2>
                {isCurrent && <Badge tone="success">current</Badge>}
                {tier === "pro" && !isCurrent && <Badge tone="info">popular</Badge>}
              </div>
              <p className="mt-3 text-2xl font-semibold">{info.price}</p>
              <p className="mt-1 text-xs text-muted">{info.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {info.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs">
                    <Check size={13} className="mt-0.5 shrink-0 text-moss-600" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-5 w-full"
                variant={isCurrent ? "secondary" : tier === "free" ? "secondary" : "primary"}
                disabled={isCurrent || tier === "free"}
                loading={busy === tier}
                onClick={() => checkout(tier)}
              >
                <CreditCard size={15} aria-hidden />
                {isCurrent ? "Your plan" : tier === "free" ? "Default tier" : `Choose ${info.label}`}
              </Button>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 max-w-2xl text-xs text-muted">
        Checkout wiring is in progress — choosing a tier records a pending subscription so your
        account reflects the intent. Tier limits are enforced server-side when exams are created.
      </p>
    </div>
  );
}
