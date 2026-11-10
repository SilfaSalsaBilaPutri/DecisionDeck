import { describe, expect, it } from "vitest";

import { filterDecisions, type DecisionListItem } from "@/lib/decision-search";

const records: DecisionListItem[] = [
  {
    id: "annual-plan",
    title: "Prioritaskan paket tahunan",
    context: "Diskusi harga untuk pelanggan baru",
    decision_text: "Uji paket tahunan selama satu kuartal",
    rationale: "Membantu perencanaan pendapatan",
    owner_name: "Rani Pramesti",
    decision_date: "2026-10-12",
    status: "decided",
    tags: ["Pricing", "Produk"],
  },
  {
    id: "support-hours",
    title: "Jam layanan dukungan",
    context: "Masih mengumpulkan masukan",
    decision_text: "",
    rationale: "",
    owner_name: "Bima Putra",
    decision_date: "2026-11-02",
    status: "proposed",
    tags: ["Operasional"],
  },
];

describe("filterDecisions", () => {
  it("matches keyword searches in tag names without changing the record", () => {
    expect(filterDecisions(records, { query: "pricing", status: "", tag: "", owner: "", dateFrom: "", dateTo: "" }).map((item) => item.id)).toEqual(["annual-plan"]);
  });

  it("combines status, tag, owner, and date range filters", () => {
    expect(filterDecisions(records, { query: "", status: "decided", tag: "pricing", owner: "rani", dateFrom: "2026-10-01", dateTo: "2026-10-31" }).map((item) => item.id)).toEqual(["annual-plan"]);
    expect(filterDecisions(records, { query: "", status: "decided", tag: "pricing", owner: "rani", dateFrom: "2026-11-01", dateTo: "2026-11-30" })).toEqual([]);
  });
});