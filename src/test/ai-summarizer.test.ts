import { describe, expect, it } from "vitest";
import { parseNotesIntelligently } from "@/lib/decisions.functions";

describe("AI & Heuristic Decision Summarizer", () => {
  it("never produces an empty decision_text or title for realistic input", () => {
    const rawNotes = `Diskusi tim backend:
Kapasitas memori server hampir penuh.
Kita memutuskan untuk mengaktifkan distributed cache di redis.
PIC: Budi Santoso
Alasan: Mengurangi beban CPU dan query database.`;

    const result = parseNotesIntelligently(rawNotes);
    expect(result.title).toBeTruthy();
    expect(result.decision_text).toBeTruthy();
    expect(result.context).toBeTruthy();
    expect(result.rationale).toBeTruthy();
    expect(result.owner_name).toBe("Budi Santoso");
    expect(result.suggested_status).toBe("decided");
    expect(result.decision_text.length).toBeGreaterThan(30);
  });

  it("handles anti-halusinasi when notes contain only status updates or brainstorming without decisions", () => {
    const rawNotes = `Update status tim pagi ini:
- Budi sedang ngerjain bug fix form
- Ani mereview PR styling
- Diskusi santai tanpa kesepakatan dan belum ada keputusan baru`;

    const result = parseNotesIntelligently(rawNotes);
    expect(result.title).toBe("Tidak Ada Keputusan Final Ditemukan");
    expect(result.decision_text).toBe("Belum ada keputusan yang disepakati dalam catatan ini.");
    expect(result.suggested_status).toBe("proposed");
  });

  it("cleans WhatsApp/Slack chat timestamps and speaker prefixes, formatting multi-decision notes", () => {
    const rawNotes = `[10.15] Budi: gaes gimana soal stack backend?
[10.17] Ani: kita sepakat migrasi ke Supabase Auth
[10.20] Budi: oke dan kita sepakat pakai Tailwind CSS untuk styling
[10.21] PIC: Ani Wijaya`;

    const result = parseNotesIntelligently(rawNotes);
    expect(result.decision_text).not.toContain("[10.17]");
    expect(result.decision_text).not.toContain("Ani:");
    expect(result.owner_name).toBe("Ani Wijaya");
    expect(result.decision_text).toContain("1.");
    expect(result.decision_text).toContain("2.");
    expect(result.suggested_tags).toContain("keamanan");
  });

  it("synthesizes complete, operational decisions instead of raw 1-word fragments", () => {
    const rawNotes = `Topik: Pemilihan Database
Konteks: Butuh database relasional untuk multi-tenant.
Keputusan: Postgres
Alasan: Dukungan RLS native dan ACID compliance.`;

    const result = parseNotesIntelligently(rawNotes);
    expect(result.decision_text).toBeTruthy();
    expect(result.decision_text).toContain("Postgres");
    // Ensure it's not just "Postgres" by itself, but formulated into an operational decision statement
    expect(result.decision_text.length).toBeGreaterThan(25);
  });
});

