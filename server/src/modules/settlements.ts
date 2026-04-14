import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import {
  createSettlementPayouts,
  getSettlementPayouts,
} from "../queries/settlements.queries";

export const settlements = (pool: Pool) =>
  new Elysia({ prefix: "/settlements", tags: ["Settlements"] })
    .post(
      "/",
      async ({ body, set }) => {
        const payouts = await createSettlementPayouts.run(
          { settlementDate: body.date },
          pool,
        );

        if (payouts.length === 0) {
          set.status = 200;
          return {
            date: body.date,
            message: "Žádné zaplacené objednávky k vyúčtování",
            payouts: [],
            totals: { orderCount: 0, revenue: 0, platformFee: 0, merchantPayout: 0 },
          };
        }

        const totals = payouts.reduce(
          (acc, p) => ({
            orderCount: acc.orderCount + p.order_count,
            revenue: acc.revenue + parseFloat(p.total_amount),
            platformFee: acc.platformFee + parseFloat(p.platform_fee),
            merchantPayout: acc.merchantPayout + parseFloat(p.merchant_payout),
          }),
          { orderCount: 0, revenue: 0, platformFee: 0, merchantPayout: 0 },
        );

        console.log(
          `💰 [Settlement] ${body.date}: ${payouts.length} obchodníků, ${totals.orderCount} objednávek, tržby ${totals.revenue} CZK`,
        );

        return { date: body.date, payouts, totals };
      },
      {
        body: t.Object({
          date: t.String({
            description: "Datum vyúčtování (YYYY-MM-DD)",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          }),
        }),
        detail: {
          summary: "Denní vyúčtování (settlement)",
          description: [
            "Dávkové zpracování plateb za dané datum. Najde všechny zaplacené objednávky (`status = 'PAID'`),",
            "seskupí je dle obchodníka, spočítá provizi platformy a čistou výplatu.",
            "",
            "Vytvoří záznamy v `core_payouts` se statusem `ready_for_payout`.",
            "Operace je idempotentní — opakované volání pro stejný den aktualizuje existující záznamy (UPSERT).",
            "",
            "**Demonstruje:** batch zpracování na core uzlu s daty agregovanými ze všech edge uzlů.",
          ].join("\n"),
        },
      },
    )
    .get(
      "/:date",
      async ({ params }) =>
        getSettlementPayouts.run({ settlementDate: params.date }, pool),
      {
        params: t.Object({
          date: t.String({ description: "Datum vyúčtování (YYYY-MM-DD)" }),
        }),
        detail: {
          summary: "Detail vyúčtování",
          description:
            "Vrátí přehled výplat obchodníkům za dané datum včetně názvů obchodníků.",
        },
      },
    );
