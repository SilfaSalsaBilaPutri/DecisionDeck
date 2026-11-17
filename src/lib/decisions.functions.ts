
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DecisionListItem } from "@/lib/decision-search";
import type { Json } from "@/integrations/supabase/types";

// =====================================================
// TYPES
// =====================================================

export type DecisionLinkInput = {
  label: string;
  url: string;
};

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

// =====================================================
// GEMINI CONFIGURATION
// =====================================================

const GEMINI_MODEL = "gemini-3.5-flash-lite";

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GEMINI_MAX_ATTEMPTS = 3;

// =====================================================
// HELPER: WAIT
// =====================================================

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================
// HELPER: RETRY DELAY
// =====================================================

function getRetryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 10000);
    }

    const retryDate = Date.parse(retryAfter);

    if (!Number.isNaN(retryDate)) {
      return Math.min(
        Math.max(retryDate - Date.now(), 0),
        10000
      );
    }
  }

  return Math.min(1000 * Math.pow(2, attempt - 1), 10000);
}

// =====================================================
// HELPER: CALL GEMINI WITH RETRY
// =====================================================

async function callGeminiWithRetry(
  apiKey: string,
  requestBody: object
): Promise<Response> {
  const retryableStatuses = [429, 500, 502, 503, 504];

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    // Request berhasil atau error tidak dapat diulang
    if (
      response.ok ||
      !retryableStatuses.includes(response.status)
    ) {
      return response;
    }

    // Semua percobaan sudah digunakan
    if (attempt === GEMINI_MAX_ATTEMPTS) {
      console.error(
        `Gemini API gagal setelah ${attempt} percobaan. HTTP ${response.status}`
      );

      return response;
    }

    const delay = getRetryDelay(response, attempt);

    console.warn(
      `Gemini API HTTP ${response.status}. Percobaan ${attempt}/${GEMINI_MAX_ATTEMPTS}. Mencoba kembali dalam ${delay} ms.`
    );

    await response.body?.cancel().catch(() => undefined);

    await wait(delay);
  }

  throw new Error("Gemini API tidak memberikan respons.");
}

// =====================================================
// GEMINI AI SUMMARIZATION
// =====================================================

export async function summarizeWithGemini(
  rawNotesInput: string
): Promise<GeminiSummaryResult> {
  const rawNotes = rawNotesInput.trim();

  // ---------------------------------------------------
  // VALIDATE INPUT
  // ---------------------------------------------------

  if (!rawNotes) {
    return {
      success: false,
      error:
        "Catatan mentah tidak boleh kosong. Silakan tempel catatan rapat atau diskusi Anda.",
    };
  }

  if (rawNotes.length > 10000) {
    return {
      success: false,
      error:
        "Catatan terlalu panjang (maksimal 10.000 karakter). Mohon perpendek teks catatan Anda.",
    };
  }

  // ---------------------------------------------------
  // GET API KEY
  // ---------------------------------------------------

  const apiKey =
    (typeof process !== "undefined" &&
      (process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY)) ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error:
        "GEMINI_API_KEY tidak ditemukan di environment (.env). Mohon tambahkan GEMINI_API_KEY agar server dapat memanggil Google Gemini API.",
    };
  }

  // ---------------------------------------------------
  // SYSTEM PROMPT
  // ---------------------------------------------------

  const systemPrompt = `Anda adalah Senior Product Operations & Decision Analyst untuk sistem DecisionDeck.

Tugas Anda: Menganalisis berbagai jenis input (transkrip rapat, catatan kasar, forward chat WhatsApp/Slack, atau notula tidak terstruktur) dan mengekstraknya menjadi Decision Record yang akurat dan terstruktur dalam Bahasa Indonesia profesional.

ATURAN LOGIKA & EDGE-CASE (WAJIB DIPATUHI):

1. ANTI-HALUSINASI (JIKA TIDAK ADA KEPUTUSAN):
Jika catatan hanya berisi obrolan, update status rutin, atau brainstorming tanpa kesepakatan apa pun, JANGAN mengarang keputusan.
Isi 'title' dengan "Tidak Ada Keputusan Final Ditemukan", jelaskan ringkasan diskusinya di 'context', isi 'decision_text' dengan "Belum ada keputusan yang disepakati dalam catatan ini.", dan set 'suggested_status' ke "proposed".

2. BACA SAMPAI AKHIR (FINAL CONSENSUS):
Dalam diskusi panjang, usulan awal sering kali dibatalkan di akhir. Lacak alur logika dari awal hingga akhir.
Ambil kesepakatan paling final untuk 'decision_text', dan pindahkan usulan yang ditolak ke bagian 'rationale'.

3. LOGIKA STATUS KEPUTUSAN:
- Gunakan "decided" HANYA jika keputusan sudah bulat dan siap dieksekusi.
- Gunakan "proposed" jika keputusan masih bersyarat (misal: "menunggu approval", "kalau budget cukup", "akan dicek dulu").

4. NORMALISASI BAHASA & FORMAT:
Input bisa berupa bahasa campuran (Indonesia-Inggris), singkatan chat (acc, tbd, fyi, asap), atau format berantakan (timestamp WA/Zoom, bullet acak).
Terjemahkan dan sintesis menjadi Bahasa Indonesia bisnis yang jelas, lugas, dan bebas dari copy-paste mentah.

5. MULTI-DECISION:
Jika terdapat lebih dari 1 keputusan berbeda dalam satu catatan, pisahkan menggunakan daftar bernomor (1, 2, dst.) secara rapi di dalam 'decision_text' dan 'rationale'.

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

  // ---------------------------------------------------
  // GEMINI REQUEST BODY
  // ---------------------------------------------------

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${systemPrompt}

CATATAN MENTAH:
"""
${rawNotes}
"""`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  // ---------------------------------------------------
  // CALL GEMINI API
  // ---------------------------------------------------

  try {
    const response = await callGeminiWithRetry(
      apiKey,
      requestBody
    );

    // -------------------------------------------------
    // HANDLE API ERROR
    // -------------------------------------------------

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");

      let errorMessage = responseText;

      try {
        const errorData = JSON.parse(responseText);
        errorMessage =
          errorData?.error?.message ||
          responseText;
      } catch {
        // Keep original response text
      }

      console.error("Gemini API Error:", {
        status: response.status,
        statusText: response.statusText,
        message: errorMessage,
        model: GEMINI_MODEL,
      });

      let userMessage = "";

      if (response.status === 429) {
        userMessage =
          "Batas permintaan Gemini API telah tercapai. Silakan tunggu beberapa saat sebelum mencoba kembali.";
      } else if (response.status === 503) {
        userMessage =
          "Server Gemini sedang mengalami lonjakan permintaan. Sistem sudah mencoba mengulang permintaan secara otomatis, tetapi layanan masih belum tersedia. Silakan coba beberapa saat lagi.";
      } else if (response.status >= 500) {
        userMessage =
          "Server Gemini sedang mengalami gangguan. Silakan coba kembali beberapa saat lagi.";
      } else if (response.status === 400) {
        userMessage =
          "Permintaan ke Gemini API tidak valid. Periksa format input atau konfigurasi request.";
      } else if (response.status === 403) {
        userMessage =
          "Akses Gemini API ditolak. Periksa API Key dan izin akses proyek Google AI Studio.";
      } else if (response.status === 404) {
        userMessage =
          "Model Gemini tidak ditemukan atau tidak tersedia untuk API Key ini. Periksa nama model dan dukungan generateContent.";
      } else {
        userMessage =
          `Gemini API mengembalikan HTTP ${response.status}.`;
      }

      return {
        success: false,
        error: `${userMessage} Detail: ${errorMessage.slice(0, 300)}`,
      };
    }

    // ---------------------------------------------------
    // PARSE API RESPONSE
    // ---------------------------------------------------

    const json = await response.json();

    const candidate = json?.candidates?.[0];

    const candidateText = candidate?.content?.parts
      ?.map((part: any) => part.text || "")
      .join("")
      .trim();

    if (!candidateText) {
      console.error("Gemini returned empty response:", json);

      return {
        success: false,
        error:
          "Gemini API tidak mengembalikan teks. Silakan coba kembali dengan catatan yang lebih jelas.",
      };
    }

    // ---------------------------------------------------
    // CLEAN JSON RESPONSE
    // ---------------------------------------------------

    const cleanText = candidateText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // ---------------------------------------------------
    // PARSE JSON
    // ---------------------------------------------------

    let parsed: any;

    try {
      parsed = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("Gemini JSON Parsing Error:", parseError);
      console.error("Gemini Raw Response:", cleanText);

      return {
        success: false,
        error:
          "Gagal mengurai output JSON dari Gemini API. Silakan coba kembali.",
      };
    }

    // ---------------------------------------------------
    // VALIDATE JSON OBJECT
    // ---------------------------------------------------

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        success: false,
        error:
          "Struktur respons Gemini API tidak valid (bukan JSON object).",
      };
    }

    // ---------------------------------------------------
    // NORMALIZE TAGS
    // ---------------------------------------------------

    const cleanTags = Array.isArray(parsed.suggested_tags)
      ? parsed.suggested_tags
        .map((tag: any) =>
          String(tag).trim().toLowerCase()
        )
        .filter(Boolean)
        .slice(0, 5)
      : [];

    // ---------------------------------------------------
    // NORMALIZE STATUS
    // ---------------------------------------------------

    const allowedStatuses = [
      "proposed",
      "decided",
      "superseded",
    ];

    const suggestedStatus = allowedStatuses.includes(
      parsed.suggested_status
    )
      ? parsed.suggested_status
      : "proposed";

    // ---------------------------------------------------
    // RETURN RESULT
    // ---------------------------------------------------

    return {
      success: true,
      data: {
        title: String(
          parsed.title || "Keputusan Diskusi"
        ).trim(),

        context: String(
          parsed.context || ""
        ).trim(),

        decision_text: String(
          parsed.decision_text || ""
        ).trim(),

        rationale: String(
          parsed.rationale || ""
        ).trim(),

        owner_name: String(
          parsed.owner_name || "Belum Ditentukan"
        ).trim(),

        suggested_tags:
          cleanTags.length > 0
            ? cleanTags
            : ["produk", "operasional"],

        suggested_status: suggestedStatus,
      },
      source: "gemini",
    };

  } catch (fetchError: any) {
    console.error("Gemini Fetch Error:", fetchError);

    return {
      success: false,
      error: `Gagal terhubung ke Gemini API: ${fetchError?.message || String(fetchError)
        }`,
    };
  }
}

// =====================================================
// SERVER FUNCTION: SUMMARIZE DECISION NOTES
// =====================================================

export const summarizeDecisionNotes = createServerFn({
  method: "POST",
})
  .validator((input: { rawNotes: string }) => input)
  .handler(async ({ data }): Promise<GeminiSummaryResult> => {
    return summarizeWithGemini(data?.rawNotes ?? "");
  });

// =====================================================
// SERVER FUNCTION: LIST DECISIONS
// =====================================================

export const listDecisions = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("decisions")
      .select(
        "id,title,context,decision_text,rationale,owner_name,decision_date,status"
      )
      .order("decision_date", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error("Unable to load decisions");
    }

    const ids = (rows ?? []).map((row) => row.id);

    if (!ids.length) {
      return [] satisfies DecisionListItem[];
    }

    const [
      { data: tagRows, error: tagError },
      { data: linkRows, error: linkError },
    ] = await Promise.all([
      context.supabase
        .from("decision_tags")
        .select("decision_id,tags(name)")
        .in("decision_id", ids),

      context.supabase
        .from("decision_links")
        .select("decision_id,label,url")
        .in("decision_id", ids)
        .order("display_order"),
    ]);

    if (tagError || linkError) {
      throw new Error("Unable to load decision details");
    }

    // Group tags by decision
    const tagsByDecision = new Map<string, string[]>();

    for (const row of tagRows ?? []) {
      const name = Array.isArray(row.tags)
        ? row.tags[0]?.name
        : row.tags?.name;

      if (!name) continue;

      tagsByDecision.set(row.decision_id, [
        ...(tagsByDecision.get(row.decision_id) ?? []),
        name,
      ]);
    }

    // Group links by decision
    const linksByDecision = new Map<
      string,
      DecisionLinkInput[]
    >();

    for (const row of linkRows ?? []) {
      linksByDecision.set(row.decision_id, [
        ...(linksByDecision.get(row.decision_id) ?? []),
        {
          label: row.label ?? "",
          url: row.url,
        },
      ]);
    }

    return (rows ?? []).map((row) => ({
      ...row,
      tags: tagsByDecision.get(row.id) ?? [],
      links: linksByDecision.get(row.id) ?? [],
    }));
  });

// =====================================================
// SERVER FUNCTION: SAVE DECISION
// =====================================================

export const saveDecision = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator((input: SaveDecisionInput) => input)
  .handler(async ({ data, context }) => {
    // Validate required fields
    if (!data.title.trim() || !data.owner_name.trim()) {
      throw new Error("Title and owner are required");
    }

    if (!/^(proposed|decided|superseded)$/.test(data.status)) {
      throw new Error("Invalid status");
    }

    if (
      data.status !== "proposed" &&
      !data.decision_text.trim()
    ) {
      throw new Error("Decision text is required");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.decision_date)) {
      throw new Error("Invalid decision date");
    }

    // Clean tags
    const cleanTags = [
      ...new Set(
        data.tags
          .map((tag) => tag.trim())
          .filter(Boolean)
      ),
    ];

    if (cleanTags.some((tag) => tag.length > 80)) {
      throw new Error("Tag is too long");
    }

    // Validate reference links
    const cleanLinks = data.links.map((link) => {
      let parsed: URL;

      try {
        parsed = new URL(link.url.trim());
      } catch {
        throw new Error("Invalid reference link");
      }

      if (
        parsed.protocol !== "https:" &&
        parsed.protocol !== "http:"
      ) {
        throw new Error("Invalid reference link");
      }

      return {
        label: link.label.trim(),
        url: parsed.href,
      };
    });

    // Save decision bundle to Supabase
    const { error } = await context.supabase.rpc(
      "save_decision_bundle",
      {
        p_decision_id: data.id ?? "",
        p_title: data.title.trim(),
        p_context: data.context,
        p_decision_text: data.decision_text,
        p_rationale: data.rationale,
        p_owner_name: data.owner_name.trim(),
        p_decision_date: data.decision_date,
        p_status: data.status,
        p_creation_method:
          data.creation_method ?? "manual",
        p_source_notes: data.source_notes ?? "",
        p_tag_names: cleanTags,
        p_links: cleanLinks as Json,
      }
    );

    if (error) {
      console.error("Supabase Save Error:", error);
      throw new Error("Unable to save decision");
    }

    return {
      success: true,
    };
  });

// =====================================================
// SERVER FUNCTION: DELETE DECISION
// =====================================================

export const deleteDecision = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("decisions")
      .delete({ count: "exact" })
      .eq("id", data.id);

    if (error || count === 0) {
      throw new Error("Unable to delete decision");
    }

    return {
      success: true,
    };
  });
