import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DecisionListItem } from "@/lib/decision-search";
import type { Json } from "@/integrations/supabase/types";

export type DecisionLinkInput = { label: string; url: string };

type SaveDecisionInput = {
  id: string | null;
  title: string;
  context: string;
  decision_text: string;
  rationale: string;
  owner_name: string;
  decision_date: string;
  status: "proposed" | "decided" | "superseded";
  tags: string[];
  links: DecisionLinkInput[];
  source_notes?: string;
  creation_method?: "manual" | "ai_summarized";
};

export const listDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("decisions")
      .select("id,title,context,decision_text,rationale,owner_name,decision_date,status")
      .order("decision_date", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error("Unable to load decisions");

    const ids = (rows ?? []).map((row) => row.id);
    if (!ids.length) return [] satisfies DecisionListItem[];

    const [{ data: tagRows, error: tagError }, { data: linkRows, error: linkError }] = await Promise.all([
      context.supabase.from("decision_tags").select("decision_id,tags(name)").in("decision_id", ids),
      context.supabase.from("decision_links").select("decision_id,label,url").in("decision_id", ids).order("display_order"),
    ]);
    if (tagError || linkError) throw new Error("Unable to load decision details");

    const tagsByDecision = new Map<string, string[]>();
    for (const row of tagRows ?? []) {
      const name = Array.isArray(row.tags) ? row.tags[0]?.name : row.tags?.name;
      if (!name) continue;
      tagsByDecision.set(row.decision_id, [...(tagsByDecision.get(row.decision_id) ?? []), name]);
    }
    const linksByDecision = new Map<string, DecisionLinkInput[]>();
    for (const row of linkRows ?? []) {
      linksByDecision.set(row.decision_id, [...(linksByDecision.get(row.decision_id) ?? []), { label: row.label ?? "", url: row.url }]);
    }

    return (rows ?? []).map((row) => ({
      ...row,
      tags: tagsByDecision.get(row.id) ?? [],
      links: linksByDecision.get(row.id) ?? [],
    }));
  });

export const saveDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveDecisionInput) => input)
  .handler(async ({ data, context }) => {
    if (!data.title.trim() || !data.owner_name.trim()) throw new Error("Title and owner are required");
    if (!/^(proposed|decided|superseded)$/.test(data.status)) throw new Error("Invalid status");
    if (data.status !== "proposed" && !data.decision_text.trim()) throw new Error("Decision text is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.decision_date)) throw new Error("Invalid decision date");
    const cleanTags = [...new Set(data.tags.map((tag) => tag.trim()).filter(Boolean))];
    if (cleanTags.some((tag) => tag.length > 80)) throw new Error("Tag is too long");
    const cleanLinks = data.links.map((link) => {
      let parsed: URL;
      try {
        parsed = new URL(link.url.trim());
      } catch {
        throw new Error("Invalid reference link");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Invalid reference link");
      return { label: link.label.trim(), url: parsed.href };
    });

    const { error } = await context.supabase.rpc("save_decision_bundle", {
      p_decision_id: data.id ?? "",
      p_title: data.title.trim(),
      p_context: data.context,
      p_decision_text: data.decision_text,
      p_rationale: data.rationale,
      p_owner_name: data.owner_name.trim(),
      p_decision_date: data.decision_date,
      p_status: data.status,
      p_creation_method: data.creation_method ?? "manual",
      p_source_notes: data.source_notes ?? "",
      p_tag_names: cleanTags,
      p_links: cleanLinks as Json,
    });
    if (error) throw new Error("Unable to save decision");
    return { success: true };
  });

export const deleteDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("decisions")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error || count === 0) throw new Error("Unable to delete decision");
    return { success: true };
  });
