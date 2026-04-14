import { Elysia, t } from "elysia";
import type { Pool } from "pg";
import { getOrderAnalytics } from "../queries/analytics.queries";

export const analytics = (pool: Pool) =>
  new Elysia({ prefix: "/analytics", tags: ["Analytics"] }).get(
    "/orders",
    async ({ query }) =>
      getOrderAnalytics.run(
        {
          granularity: query.granularity || "day",
          fromDate: query.from || "2020-01-01",
          toDate: query.to || "2099-01-01",
        },
        pool,
      ),
    {
      query: t.Object({
        granularity: t.Optional(
          t.String({
            description: "Granularita: hour / day / week / month",
            default: "day",
          }),
        ),
        from: t.Optional(
          t.String({
            description: "Počátek intervalu (ISO 8601)",
            default: "2020-01-01",
          }),
        ),
        to: t.Optional(
          t.String({
            description: "Konec intervalu (ISO 8601)",
            default: "2099-01-01",
          }),
        ),
      }),
      detail: {
        summary: "Analytika objednávek",
        description:
          "Agregace objednávek v čase — počet a tržby po zvoleném intervalu. Dotaz běží nad core databází, kde jsou agregovány objednávky ze všech edge uzlů.",
      },
    },
  );
