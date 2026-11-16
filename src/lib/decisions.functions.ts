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
  source?: "gemini" | "heuristic_fallback";
};

/**
 * Intelligent semantic extractor that parses raw meeting notes or text
 * into complete, multi-sentence decision records without leaving fields empty.
 */
export function parseNotesIntelligently(rawNotes: string) {
  const text = rawNotes.trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let title = "";
  let context = "";
  let decision_text = "";
  let rationale = "";
  let owner_name = "";
  let suggested_status: "proposed" | "decided" | "superseded" = "decided";
  const tags: string[] = [];

  // 1. Look for explicit labeled headers/lines
  for (const line of lines) {
    if (!title && /^(?:judul|topik|topic|title|subject)\s*[:\-]\s*(.+)$/i.test(line)) {
      title = line.replace(/^(?:judul|topik|topic|title|subject)\s*[:\-]\s*/i, "").trim();
    } else if (!owner_name && /^(?:owner|pic|penanggung jawab|lead|assigned to|pemilik)\s*[:\-]\s*(.+)$/i.test(line)) {
      owner_name = line.replace(/^(?:owner|pic|penanggung jawab|lead|assigned to|pemilik)\s*[:\-]\s*/i, "").trim();
    } else if (!decision_text && /^(?:keputusan|decision|kesimpulan|hasil diskusi|hasil keputusan|disepakati)\s*[:\-]\s*(.+)$/i.test(line)) {
      decision_text = line.replace(/^(?:keputusan|decision|kesimpulan|hasil diskusi|hasil keputusan|disepakati)\s*[:\-]\s*/i, "").trim();
    } else if (!rationale && /^(?:alasan|rationale|kenapa|mengapa|pertimbangan|trade-off|background reason)\s*[:\-]\s*(.+)$/i.test(line)) {
      rationale = line.replace(/^(?:alasan|rationale|kenapa|mengapa|pertimbangan|trade-off|background reason)\s*[:\-]\s*/i, "").trim();
    } else if (!context && /^(?:konteks|context|latar belakang|background|masalah|problem)\s*[:\-]\s*(.+)$/i.test(line)) {
      context = line.replace(/^(?:konteks|context|latar belakang|background|masalah|problem)\s*[:\-]\s*/i, "").trim();
    }
  }

  // 2. Identify paragraphs or multi-line blocks
  const cleanLines = lines.filter(
    (l) => !/^(?:agenda|hadir|attendees|tanggal|waktu|notulis)\s*[:\-]/i.test(l)
  );

  // Fallback Title: First substantive line or summary of topic
  if (!title) {
    const firstSubstantive = cleanLines[0] || "Keputusan Diskusi Tim";
    title = firstSubstantive.replace(/^[#*\-•\d.]+\s*/, "").slice(0, 100).trim();
  }

  // Fallback Decision Text: Find sentence describing action agreed
  if (!decision_text) {
    const decisionMatches = cleanLines.filter((l) =>
      /\b(?:memutuskan|sepakat|menyetujui|memilih|akan menggunakan|ditetapkan|disepakati|agreed|decided|adopt|migrate)\b/i.test(l)
    );
    if (decisionMatches.length > 0) {
      decision_text = decisionMatches.map((m) => m.replace(/^[#*\-•\d.]+\s*/, "").trim()).join(". ");
    } else if (cleanLines.length > 1) {
      decision_text = cleanLines.slice(1, Math.min(3, cleanLines.length)).map((l) => l.replace(/^[#*\-•\d.]+\s*/, "")).join(" ");
    } else {
      decision_text = cleanLines[0] ? `Menyetujui implementasi terkait: ${cleanLines[0]}` : "Keputusan telah disepakati oleh tim.";
    }
  }

  // Fallback Context: Explains background / problem
  if (!context) {
    const contextMatches = cleanLines.filter((l) =>
      /\b(?:kebutuhan|kendala|masalah|tantangan|sebelumnya|latar belakang|urgensi|problem|challenge|currently)\b/i.test(l)
    );
    if (contextMatches.length > 0) {
      context = contextMatches.map((m) => m.replace(/^[#*\-•\d.]+\s*/, "").trim()).join(". ");
    } else {
      context = cleanLines.slice(0, Math.min(2, cleanLines.length)).map((l) => l.replace(/^[#*\-•\d.]+\s*/, "")).join(" ");
      if (context.length < 30) {
        context = `Pembahasan ini dilakukan untuk menindaklanjuti kebutuhan tim terkait: ${title}. Diperlukan kejelasan arah dan standarisasi teknis untuk kelancaran proyek.`;
      }
    }
  }

  // Fallback Rationale: Explains why
  if (!rationale) {
    const rationaleMatches = cleanLines.filter((l) =>
      /\b(?:karena|alasan|sebab|pertimbangan|efisiensi|keuntungan|kelebihan|menghemat|agar|supaya|in order to|because)\b/i.test(l)
    );
    if (rationaleMatches.length > 0) {
      rationale = rationaleMatches.map((m) => m.replace(/^[#*\-•\d.]+\s*/, "").trim()).join(". ");
    } else {
      rationale = "Pilihan ini diambil berdasarkan pertimbangan efisiensi waktu pengerjaan, stabilitas sistem, serta kesesuaian dengan arsitektur proyek DecisionDeck.";
    }
  }

  // Fallback Owner
  if (!owner_name) {
    const ownerMatch = text.match(/(?:@|pic\s*[:\-]?\s*|oleh\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (ownerMatch && ownerMatch[1]) {
      owner_name = ownerMatch[1].trim();
    } else {
      owner_name = "Belum Ditentukan";
    }
  }

  // Detect status
  if (/\b(?:usulan|draft|proposed|menunggu|evaluasi|pending)\b/i.test(text) && !/\b(?:final|disepakati|resmi|decided)\b/i.test(text)) {
    suggested_status = "proposed";
  }

  // Dynamic tags extraction
  const tagDictionary: Record<string, string[]> = {
    arsitektur: ["arsitektur", "architecture", "microservice", "monolith", "stack"],
    backend: ["backend", "api", "database", "sql", "postgres", "supabase", "server"],
    frontend: ["frontend", "ui", "ux", "react", "tailwind", "komponen", "design"],
    keamanan: ["keamanan", "security", "auth", "jwt", "rls", "token", "login"],
    produk: ["produk", "product", "fitur", "roadmap", "mvp", "stage", "user"],
    operasional: ["operasional", "devops", "deploy", "docker", "ci/cd", "infra", "cloud"],
    performa: ["performa", "optimasi", "caching", "speed", "latency", "load"],
  };

  for (const [tagCategory, keywords] of Object.entries(tagDictionary)) {
    if (keywords.some((kw) => text.toLowerCase().includes(kw))) {
      tags.push(tagCategory);
    }
  }

  if (tags.length === 0) {
    tags.push("produk", "operasional");
  }

  return {
    title,
    context,
    decision_text,
    rationale,
    owner_name,
    suggested_tags: tags.slice(0, 5),
    suggested_status,
  };
}

export const summarizeDecisionNotes = createServerFn({ method: "POST" })
  .validator((input: { rawNotes: string }) => input)
  .handler(async ({ data }): Promise<GeminiSummaryResult> => {
    const rawNotes = (data?.rawNotes ?? "").trim();
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

    // Try Google Gemini API if key is configured
    const apiKey =
      (typeof process !== "undefined" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY)) ||
      "";

    if (apiKey) {
      try {
        const systemPrompt = `Anda adalah Senior Product Operations & Decision Analyst untuk sistem DecisionDeck.
Tugas Anda: Menganalisis berbagai jenis input (transkrip rapat, catatan kasar, forward chat WhatsApp/Slack, atau notula tidak terstruktur) dan mengekstraknya menjadi Decision Record yang akurat dan terstruktur dalam Bahasa Indonesia profesional.

ATURAN LOGIKA & EDGE-CASE (WAJIB DIPATUHI):
1. ANTI-HALUSINASI (JIKA TIDAK ADA KEPUTUSAN): Jika catatan hanya berisi obrolan, update status rutin, atau brainstorming tanpa kesepakatan apa pun, JANGAN mengarang keputusan. Isi 'title' dengan "Tidak Ada Keputusan Final Ditemukan", jelaskan ringkasan diskusinya di 'context', kosongkan 'decision_text' dengan "Belum ada keputusan yang disepakati dalam catatan ini.", dan set 'suggested_status' ke "proposed".
2. BACA SAMPAI AKHIR (FINAL CONSENSUS): Dalam diskusi panjang, usulan awal sering kali dibatalkan di akhir. Lacak alur logika dari awal hingga akhir. Ambil kesepakatan paling final untuk 'decision_text', dan pindahkan usulan yang ditolak ke 'rejected_alternatives' (gabungkan di bagian 'rationale').
3. LOGIKA STATUS KEPUTUSAN:
- Gunakan "decided" HANYA jika keputusan sudah bulat dan siap dieksekusi.
- Gunakan "proposed" jika keputusan masih bersyarat (misal: "menunggu approval", "kalau budget cukup", "akan dicek dulu").
4. NORMALISASI BAHASA & FORMAT: Input bisa berupa bahasa campuran (Indonesia-Inggris), singkatan chat (acc, tbd, fyi, asap), atau format berantakan (timestamp WA/Zoom, bullet acak). Terjemahkan dan sintesis menjadi Bahasa Indonesia bisnis yang jelas, lugas, mudah dimengerti dan bebas dari copy-paste mentah.
5. MULTI-DECISION: Jika terdapat lebih dari 1 keputusan berbeda dalam satu catatan, pisahkan menggunakan daftar bernomor (1, 2, dst.) secara rapi di dalam 'decision_text' dan 'rationale'.

PANDUAN FIELD OUTPUT:
1. title: Judul keputusan ringkas & spesifik menggambarkan tindakan final (maksimal 100 karakter).
2. context: Latar belakang masalah atau pemicu diskusi (2-3 kalimat komprehensif, tanpa menyalin transkrip mentah).
3. decision_text: Hasil keputusan definitif yang disepakati beserta action item/PIC secara operasional.
4. rationale: Alasan logis di balik keputusan ini, pertimbangan trade-off, serta opsi alternatif yang ditolak (jika ada).
5. owner_name: Nama PIC utama yang bertanggung jawab (pisahkan dengan koma jika lebih dari satu; tulis "Belum Ditentukan" jika tidak ada nama yang disebut).
6. suggested_tags: Array 2-5 tag kategori relevan dalam huruf kecil (misal: ["pricing", "operasional", "produk"]).
7. suggested_status: "decided" atau "proposed".

Kembalikan HANYA JSON valid tanpa markdown backticks (\`\`\`json):
{
"title": "string",
"context": "string",
"decision_text": "string",
"rationale": "string",
"owner_name": "string",
"suggested_tags": ["string"],
"suggested_status": "decided" | "proposed"
}`;

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
                temperature: 0.2,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json();
          const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            const cleanText = candidateText
              .trim()
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```$/i, "");
            const parsed = JSON.parse(cleanText);

            if (parsed.title && (parsed.decision_text || parsed.context || parsed.rationale)) {
              return {
                success: true,
                data: {
                  title: String(parsed.title).trim(),
                  context: String(parsed.context || "").trim(),
                  decision_text: String(parsed.decision_text || "").trim(),
                  rationale: String(parsed.rationale || "").trim(),
                  owner_name: String(parsed.owner_name || "Belum Ditentukan").trim(),
                  suggested_tags: Array.isArray(parsed.suggested_tags)
                    ? parsed.suggested_tags.map((t: any) => String(t).trim()).filter(Boolean)
                    : ["produk", "operasional"],
                  suggested_status: parsed.suggested_status === "proposed" ? "proposed" : "decided",
                },
                source: "gemini",
              };
            }
          }
        } else {
          console.warn("[Gemini API] Request returned non-ok status:", response.status);
        }
      } catch (geminiError) {
        console.warn("[Gemini API] Request error, falling back to semantic parser:", geminiError);
      }
    }

    // High quality semantic fallback parser
    const fallbackParsed = parseNotesIntelligently(rawNotes);
    return {
      success: true,
      data: fallbackParsed,
      source: "heuristic_fallback",
    };
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