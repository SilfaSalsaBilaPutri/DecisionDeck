import { describe, expect, it, vi } from "vitest";
import { summarizeWithGemini } from "@/lib/decisions.functions";

describe("Google Gemini AI Decision Summarizer (Server Action)", () => {
  it("rejects empty rawNotes with a clear error message", async () => {
    const result = await summarizeWithGemini("   ");
    expect(result.success).toBe(false);
    expect(result.error).toContain("tidak boleh kosong");
  });

  it("rejects rawNotes exceeding 10,000 characters", async () => {
    const hugeNotes = "A".repeat(10001);
    const result = await summarizeWithGemini(hugeNotes);
    expect(result.success).toBe(false);
    expect(result.error).toContain("maksimal 10.000 karakter");
  });

  it("returns a transparent error when GEMINI_API_KEY is missing without returning any mock data", async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    const originalGoogle = process.env.GOOGLE_API_KEY;
    const originalVite = process.env.VITE_GEMINI_API_KEY;

    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;

    try {
      const result = await summarizeWithGemini("Notula rapat: Kita sepakat migrasi database ke Postgres.");

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toContain("GEMINI_API_KEY tidak ditemukan di environment (.env)");
    } finally {
      if (originalEnv) process.env.GEMINI_API_KEY = originalEnv;
      if (originalGoogle) process.env.GOOGLE_API_KEY = originalGoogle;
      if (originalVite) process.env.VITE_GEMINI_API_KEY = originalVite;
    }
  });

  it("calls Google Gemini API with gemini-2.5-flash and parses valid JSON responses accurately", async () => {
    process.env.GEMINI_API_KEY = "test-mock-gemini-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: "Migrasi Database ke PostgreSQL",
                    context: "Database MySQL sebelumnya sering mengalami bottleneck performa pada beban kerja tinggi.",
                    decision_text: "Menyetujui migrasi penuh database utama ke PostgreSQL dengan arsitektur multi-tenant.",
                    rationale: "PostgreSQL menyediakan native RLS, integritas ACID tinggi, dan latensi query yang jauh lebih baik.",
                    owner_name: "Silfa Salsabila Putri",
                    suggested_tags: ["backend", "database", "arsitektur"],
                    suggested_status: "decided",
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await summarizeWithGemini("Notula rapat arsitektur: sepakat migrasi ke PostgreSQL.");

      expect(result.success).toBe(true);
      expect(result.source).toBe("gemini");
      expect(result.data?.title).toBe("Migrasi Database ke PostgreSQL");
      expect(result.data?.owner_name).toBe("Silfa Salsabila Putri");
      expect(result.data?.suggested_status).toBe("decided");
      expect(result.data?.suggested_tags).toEqual(["backend", "database", "arsitektur"]);

      // Verify request payload sent to Gemini API
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0];
      const callOptions = mockFetch.mock.calls[0][1];
      expect(callUrl).toContain("gemini-2.5-flash:generateContent?key=test-mock-gemini-key");

      const parsedBody = JSON.parse(callOptions.body);
      expect(parsedBody.generationConfig.temperature).toBe(0.1);
      expect(parsedBody.generationConfig.responseMimeType).toBe("application/json");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.GEMINI_API_KEY;
    }
  });
});
