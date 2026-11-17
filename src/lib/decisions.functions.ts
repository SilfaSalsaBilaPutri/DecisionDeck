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

export type GeminiSummaryResult = {
  success: boolean;
  data?: {
    title: string;
    context: string;
    decision_text: string;
    rationale: string;
    owner_name: string;
    suggested_tags: string[];
    suggested_status: "proposed" | "decided" | "superseded";
  };
  error?: string;
  source?: "gemini";
};

export async function summarizeWithGemini(rawNotesInput: string): Promise<GeminiSummaryResult> {
  const rawNotes = rawNotesInput.trim();
  if (!rawNotes) {
    return {
      success: false,
      error: "Catatan mentah tidak boleh kosong. Silakan tempel catatan rapat atau diskusi Anda.",
    };
  }

  if (rawNotes.length > 10000) {
    return {
      success: false,
      error: "Catatan terlalu panjang (maksimal 10.000 karakter). Mohon perpendek teks catatan Anda.",
    };
  }

  // Retrieve Google Gemini API Key strictly on the server
  const apiKey =
    (typeof process !== "undefined" &&
      (process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.VITE_GEMINI_API_KEY)) ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error:
        "GEMINI_API_KEY tidak ditemukan di environment (.env). Mohon tambahkan GEMINI_API_KEY ke file .env agar server dapat memanggil Google Gemini API.",
    };
  }

  const systemPrompt = `Anda adalah Senior Product Operations & Decision Analyst untuk sistem DecisionDeck.
Tugas Anda: Menganalisis berbagai jenis input (transkrip rapat, catatan kasar, forward chat WhatsApp/Slack, atau notula tidak terstruktur) dan mengekstraknya menjadi Decision Record yang akurat dan terstruktur dalam Bahasa Indonesia profesional.

ATURAN LOGIKA & EDGE-CASE (WAJIB DIPATUHI):
1. ANTI-HALUSINASI (JIKA TIDAK ADA KEPUTUSAN): Jika catatan hanya berisi obrolan, update status rutin, atau brainstorming tanpa kesepakatan apa pun, JANGAN mengarang keputusan. Isi 'title' dengan "Tidak Ada Keputusan Final Ditemukan", jelaskan ringkasan diskusinya di 'context', kosongkan 'decision_text' dengan "Belum ada keputusan yang disepakati dalam catatan ini.", dan set 'suggested_status' ke "proposed".
2. BACA SAMPAI AKHIR (FINAL CONSENSUS): Dalam diskusi panjang, usulan awal sering kali dibatalkan di akhir. Lacak alur logika dari awal hingga akhir. Ambil kesepakatan paling final untuk 'decision_text', dan pindahkan usulan yang ditolak ke bagian 'rationale'.
3. LOGIKA STATUS KEPUTUSAN:
   - Gunakan "decided" HANYA jika keputusan sudah bulat dan siap dieksekusi.
   - Gunakan "proposed" jika keputusan masih bersyarat (misal: "menunggu approval", "kalau budget cukup", "akan dicek dulu").
4. NORMALISASI BAHASA & FORMAT: Input bisa berupa bahasa campuran (Indonesia-Inggris), singkatan chat (acc, tbd, fyi, asap), atau format berantakan (timestamp WA/Zoom, bullet acak). Terjemahkan dan sintesis menjadi Bahasa Indonesia bisnis yang jelas, lugas, dan bebas dari copy-paste mentah.
5. MULTI-DECISION: Jika terdapat lebih dari 1 keputusan berbeda dalam satu catatan, pisahkan menggunakan daftar bernomor (1, 2, dst.) secara rapi di dalam 'decision_text' dan 'rationale'.

PANDUAN FIELD OUTPUT:
1. title: Judul keputusan ringkas & spesifik menggambarkan tindakan final (maksimal 100 karakter).
2. context: Latar belakang masalah atau pemicu diskusi (2-3 kalimat komprehensif, tanpa menyalin transkrip mentah).
3. decision_text: Hasil keputusan definitif yang disepakati beserta action item/PIC secara operasional.
4. rationale: Alasan logis di balik keputusan ini, pertimbangan trade-off, serta opsi alternatif yang ditolak (jika ada).
5. owner_name: Nama PIC utama yang bertanggung jawab (pisahkan dengan koma jika lebih dari satu; tulis "Belum Ditentukan" jika tidak ada nama yang disebut).
6. suggested_tags: Array 2-5 tag kategori relevan dalam huruf kecil (misal: ["pricing", "operasional", "produk"]).
7. suggested_status: "decided" atau "proposed".

Kembalikan HANYA JSON valid dengan struktur:
{
  "title": "string",
  "context": "string",
  "decision_text": "string",
  "rationale": "string",
  "owner_name": "string",
  "suggested_tags": ["string"],
  "suggested_status": "decided" | "proposed"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nCATATAN MENTAH:\n"""\n${rawNotes}\n"""`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        success: false,
        error: `Gagal terhubung ke Gemini API: HTTP ${response.status} (${response.statusText})${errorText ? ` - ${errorText.slice(0, 150)}` : ""}`,
      };
    }

    const json = await response.json();
    const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return {
        success: false,
        error: "Gagal terhubung ke Gemini API: Model tidak mengembalikan kandidat respons.",
      };
    }

    const cleanText = candidateText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      return {
        success: false,
        error: `Gagal mengurai output JSON dari Gemini API: ${cleanText.slice(0, 100)}`,
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        success: false,
        error: "Struktur respons Gemini API tidak valid (bukan JSON object).",
      };
    }

    const cleanTags = Array.isArray(parsed.suggested_tags)
      ? parsed.suggested_tags.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean)
      : [];

    return {
      success: true,
      data: {
        title: String(parsed.title || "Keputusan Diskusi").trim(),
        context: String(parsed.context || "").trim(),
        decision_text: String(parsed.decision_text || "").trim(),
        rationale: String(parsed.rationale || "").trim(),
        owner_name: String(parsed.owner_name || "Belum Ditentukan").trim(),
        suggested_tags: cleanTags.length > 0 ? cleanTags : ["produk", "operasional"],
        suggested_status: parsed.suggested_status === "proposed" ? "proposed" : "decided",
      },
      source: "gemini",
    };
  } catch (fetchError: any) {
    return {
      success: false,
      error: `Gagal terhubung ke Gemini API: ${fetchError?.message || String(fetchError)}`,
    };
  }
}

export const summarizeDecisionNotes = createServerFn({ method: "POST" })
  .validator((input: { rawNotes: string }) => input)
  .handler(async ({ data }): Promise<GeminiSummaryResult> => {
    return summarizeWithGemini(data?.rawNotes ?? "");
  });

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
  .validator((input: SaveDecisionInput) => input)
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
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("decisions")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error || count === 0) throw new Error("Unable to delete decision");
    return { success: true };
  });
