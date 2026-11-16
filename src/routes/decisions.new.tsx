import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Layers3,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  User,
  Wand2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  parseNotesIntelligently,
  saveDecision,
  summarizeDecisionNotes,
  type DecisionLinkInput,
} from "@/lib/decisions.functions";
import type { DecisionStatus } from "@/lib/decision-search";

export const Route = createFileRoute("/decisions/new")({
  head: () => ({
    meta: [
      { title: "Buat Keputusan Baru — DecisionDeck" },
      { name: "description", content: "Buat keputusan baru dengan bantuan ringkasan AI atau pengisian manual." },
    ],
  }),
  component: NewDecisionPage,
});

const DEMO_STORAGE_KEY = "decisiondeck_demo_decisions";

const SAMPLE_NOTES = `Notula Rapat Arsitektur Produk & Engineering
Tanggal: 12 November 2026
Peserta: Silfa Salsabila Putri (Tech Lead), Budi (Backend), Ani (Frontend)

Latar Belakang:
Sistem aplikasi DecisionDeck mengalami lonjakan akses pada fitur pencarian dan pencatatan keputusan. Saat ini query pencarian teks dan filter tag langsung membebani database utama tanpa mekanisme caching layer, sehingga latensi meningkat pada jam sibuk.

Pembahasan:
Tim mengevaluasi 2 alternatif:
1. Mengaktifkan full caching di Redis cluster terpisah.
2. Menggunakan in-memory cache layer terdistribusi dengan invalidasi berbasis event Supabase Realtime.

Kesimpulan & Keputusan:
Disepakati untuk menerapkan caching terdistribusi dengan Supabase Realtime cache-invalidation. Implementasi ini akan dipimpin oleh Silfa Salsabila Putri dan ditargetkan selesai minggu ini.

Alasan & Pertimbangan:
Pendekatan ini memangkas biaya infrastruktur hingga 40% tanpa perlu server Redis tambahan, latency query turun drastis di bawah 45ms, dan sinkronisasi data antar client tetap instan secara real-time.`;

type DecisionFormState = {
  title: string;
  context: string;
  decision_text: string;
  rationale: string;
  owner_name: string;
  decision_date: string;
  status: DecisionStatus;
  tags: string;
  links: DecisionLinkInput[];
  source_notes: string;
  creation_method: "manual" | "ai_summarized";
};

function initialForm(): DecisionFormState {
  return {
    title: "",
    context: "",
    decision_text: "",
    rationale: "",
    owner_name: "",
    decision_date: new Date().toISOString().slice(0, 10),
    status: "decided",
    tags: "",
    links: [],
    source_notes: "",
    creation_method: "ai_summarized",
  };
}

function NewDecisionPage() {
  const navigate = useNavigate();
  const saveDecisionFn = useServerFn(saveDecision);
  const summarizeNotesFn = useServerFn(summarizeDecisionNotes);

  // Authentication & Mode
  const [isDemo, setIsDemo] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);

  // Primary workflow mode: Default is "ai" (AI-First Experience)
  const [workflowMode, setWorkflowMode] = useState<"ai" | "manual">("ai");
  const [rawNotes, setRawNotes] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraftReady, setAiDraftReady] = useState(false);
  const [aiSource, setAiSource] = useState<"gemini" | "heuristic_fallback" | null>(null);

  // Form State
  const [form, setForm] = useState<DecisionFormState>(initialForm());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    const demoActive = localStorage.getItem("demo_mode") === "true";
    setIsDemo(demoActive);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? null });
        if (!demoActive && session.user.user_metadata?.full_name) {
          setForm((prev) => ({
            ...prev,
            owner_name: session.user.user_metadata.full_name,
          }));
        }
      }
    });
  }, []);

  // AI Summarization Handler
  async function handleGenerateAiDraft() {
    setErrorMessage("");
    const trimmedNotes = rawNotes.trim();

    if (!trimmedNotes) {
      setErrorMessage("Catatan mentah tidak boleh kosong. Silakan tempel catatan rapat atau gunakan contoh.");
      return;
    }

    if (trimmedNotes.length > 10000) {
      setErrorMessage("Catatan terlalu panjang (maksimal 10.000 karakter). Mohon perpendek catatan Anda.");
      return;
    }

    setAiGenerating(true);
    try {
      const response = await summarizeNotesFn({ data: { rawNotes: trimmedNotes } });

      if (response && response.success && response.data) {
        const { title, context, decision_text, rationale, owner_name, suggested_tags, suggested_status } = response.data;
        setForm((prev) => ({
          ...prev,
          title: title || prev.title,
          context: context || prev.context,
          decision_text: decision_text || prev.decision_text,
          rationale: rationale || prev.rationale,
          owner_name: owner_name || prev.owner_name,
          status: suggested_status || "decided",
          tags: suggested_tags && suggested_tags.length > 0 ? suggested_tags.join(", ") : prev.tags,
          source_notes: trimmedNotes,
          creation_method: "ai_summarized",
        }));
        setAiSource(response.source ?? "gemini");
        setAiDraftReady(true);
      } else {
        // Fallback to local intelligent semantic extractor
        const fallback = parseNotesIntelligently(trimmedNotes);
        setForm((prev) => ({
          ...prev,
          title: fallback.title,
          context: fallback.context,
          decision_text: fallback.decision_text,
          rationale: fallback.rationale,
          owner_name: fallback.owner_name,
          status: fallback.suggested_status,
          tags: fallback.suggested_tags.join(", "),
          source_notes: trimmedNotes,
          creation_method: "ai_summarized",
        }));
        setAiSource("heuristic_fallback");
        setAiDraftReady(true);
      }
    } catch (err) {
      console.warn("AI summarizer server call failed, applying client heuristic parser:", err);
      const fallback = parseNotesIntelligently(trimmedNotes);
      setForm((prev) => ({
        ...prev,
        title: fallback.title,
        context: fallback.context,
        decision_text: fallback.decision_text,
        rationale: fallback.rationale,
        owner_name: fallback.owner_name,
        status: fallback.suggested_status,
        tags: fallback.suggested_tags.join(", "),
        source_notes: trimmedNotes,
        creation_method: "ai_summarized",
      }));
      setAiSource("heuristic_fallback");
      setAiDraftReady(true);
    } finally {
      setAiGenerating(false);
    }
  }

  function handleRejectDraft() {
    setAiDraftReady(false);
    setErrorMessage("");
  }

  function addLink() {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) return;

    let validUrl = trimmedUrl;
    if (!/^https?:\/\//i.test(validUrl)) {
      validUrl = `https://${validUrl}`;
    }

    const label = linkLabel.trim() || validUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || "Tautan";
    setForm((prev) => ({
      ...prev,
      links: [...prev.links, { label, url: validUrl }],
    }));
    setLinkLabel("");
    setLinkUrl("");
  }

  function removeLink(index: number) {
    setForm((prev) => ({
      ...prev,
      links: prev.links.filter((_, idx) => idx !== index),
    }));
  }

  async function handleSaveDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!form.title.trim()) {
      setErrorMessage("Judul keputusan wajib diisi.");
      return;
    }

    if (!form.owner_name.trim()) {
      setErrorMessage("Penanggung jawab (Owner / PIC) wajib diisi.");
      return;
    }

    if (form.status !== "proposed" && !form.decision_text.trim()) {
      setErrorMessage("Isi keputusan wajib diisi untuk status 'Diputuskan' atau 'Digantikan'.");
      return;
    }

    setSaving(true);
    try {
      const cleanTags = form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      if (isDemo) {
        // Save to demo LocalStorage
        let stored: any[] = [];
        try {
          stored = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "[]");
        } catch {
          stored = [];
        }

        const newRecord = {
          id: `demo-${Date.now()}`,
          title: form.title.trim(),
          context: form.context.trim(),
          decision_text: form.decision_text.trim(),
          rationale: form.rationale.trim(),
          owner_name: form.owner_name.trim(),
          decision_date: form.decision_date,
          status: form.status,
          tags: cleanTags,
          links: form.links,
          source_notes: form.source_notes,
          creation_method: form.creation_method,
        };

        stored.unshift(newRecord);
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(stored));
        await navigate({ to: "/" });
        return;
      }

      // Save to Supabase Cloud
      await saveDecisionFn({
        data: {
          id: null,
          title: form.title.trim(),
          context: form.context.trim(),
          decision_text: form.decision_text.trim(),
          rationale: form.rationale.trim(),
          owner_name: form.owner_name.trim(),
          decision_date: form.decision_date,
          status: form.status,
          tags: cleanTags,
          links: form.links,
          source_notes: form.source_notes,
          creation_method: form.creation_method,
        },
      });

      await navigate({ to: "/" });
    } catch (saveError) {
      console.error("Save error:", saveError);
      setErrorMessage("Gagal menyimpan keputusan. Periksa koneksi internet atau gunakan Mode Demo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0d12] text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background Ambience */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-[700px] rounded-full bg-amber-500/10 blur-[130px]" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-amber-600/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Navigation Bar */}
        <div className="mb-8 flex items-center justify-between border-b border-white/[0.08] pb-4">
          <Link
            to="/"
            className="group flex items-center gap-2 text-xs font-semibold text-zinc-400 transition-colors hover:text-amber-300"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
            <span>Kembali ke Dashboard</span>
          </Link>

          <div className="flex items-center gap-2">
            {isDemo && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                Mode Demo Aktif
              </Badge>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 py-1.5 backdrop-blur-md">
              <div className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-xs font-bold text-zinc-950">
                D
              </div>
              <span className="text-xs font-bold tracking-tight text-white">DecisionDeck</span>
            </div>
          </div>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Buat Keputusan Baru
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Dokumentasikan keputusan arsitektur, produk, atau operasional tim secara terstruktur agar mudah ditinjau kembali.
          </p>

          {/* Workflow Mode Switcher (AI-First vs Manual) */}
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setWorkflowMode("ai");
                setForm((prev) => ({ ...prev, creation_method: "ai_summarized" }));
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm ${workflowMode === "ai"
                  ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-zinc-950 shadow-lg shadow-amber-500/20 font-bold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                }`}
            >
              <Sparkles className={`size-4 ${workflowMode === "ai" ? "text-zinc-950" : "text-amber-400"}`} />
              <span>Ringkas dari Catatan (AI)</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${workflowMode === "ai" ? "bg-zinc-950/20 text-zinc-950" : "bg-amber-500/20 text-amber-300"
                }`}>
                Default
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setWorkflowMode("manual");
                setForm((prev) => ({ ...prev, creation_method: "manual" }));
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm ${workflowMode === "manual"
                  ? "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-zinc-950 shadow-lg shadow-amber-500/20 font-bold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                }`}
            >
              <FileText className={`size-4 ${workflowMode === "manual" ? "text-zinc-950" : "text-zinc-400"}`} />
              <span>Isi Form Manual</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-300 backdrop-blur-md">
            <p className="font-semibold">{errorMessage}</p>
          </div>
        )}

        {/* WORKFLOW A: AI-FIRST EXPERIENCE */}
        {workflowMode === "ai" && !aiDraftReady && (
          <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-white sm:text-lg">
                  <Wand2 className="size-5 text-amber-400" />
                  Tempel Catatan Diskusi atau Rapat
                </h2>
                <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                  Kecerdasan buatan akan mengekstrak Judul, Latar Belakang (Konteks), Keputusan, dan Alasan (Rasional) secara otomatis.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRawNotes(SAMPLE_NOTES)}
                className="self-start rounded-xl border-amber-500/30 bg-amber-500/10 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 sm:self-auto"
              >
                Muat Contoh Notula
              </Button>
            </div>

            <div className="mt-6 space-y-2">
              <div className="relative">
                <Textarea
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                  placeholder="Tempel teks notula rapat, chat Slack, ringkasan diskusi, atau draf catatan bebas di sini... (hingga 10.000 karakter)"
                  rows={12}
                  className="w-full resize-y rounded-2xl border-white/[0.08] bg-zinc-950/70 p-4 font-mono text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus-visible:border-amber-500/50 focus-visible:ring-1 focus-visible:ring-amber-500/50"
                />
              </div>

              <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
                <span>Mendukung teks hingga 10.000 karakter</span>
                <span className={rawNotes.length > 10000 ? "font-bold text-red-400" : ""}>
                  {rawNotes.length.toLocaleString()} / 10.000 karakter
                </span>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-white/[0.08] pt-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setWorkflowMode("manual")}
                className="rounded-xl text-xs text-zinc-400 hover:text-white"
              >
                Beralih ke Isi Manual
              </Button>

              <Button
                type="button"
                onClick={handleGenerateAiDraft}
                disabled={aiGenerating || !rawNotes.trim()}
                className="h-11 gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 px-6 font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
              >
                {aiGenerating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sedang Menganalisis Catatan...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 text-zinc-950" />
                    Ekstrak & Hasilkan Draf Keputusan (AI)
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* WORKFLOW A (Step 2: Review AI Draft) OR WORKFLOW B (Manual Form) */}
        {(workflowMode === "manual" || (workflowMode === "ai" && aiDraftReady)) && (
          <form onSubmit={handleSaveDecision} className="space-y-6">
            {/* AI Draft Review Banner */}
            {workflowMode === "ai" && aiDraftReady && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 backdrop-blur-md">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                      <Sparkles className="size-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-amber-300">
                        Draf Berhasil Diekstrak oleh AI
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-300">
                        {aiSource === "gemini"
                          ? "Model Google Gemini telah mengekstrak struktur keputusan. Silakan tinjau dan edit kolom di bawah sebelum disimpan."
                          : "Catatan berhasil diparsing secara cerdas. Silakan tinjau dan lengkapi detail jika diperlukan."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRejectDraft}
                      className="gap-1.5 rounded-xl border-white/10 bg-zinc-900/60 text-xs font-semibold text-zinc-300 hover:text-white"
                    >
                      <RotateCcw className="size-3.5" />
                      Ubah Catatan
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Form Fields Card */}
            <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-8 space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Judul Keputusan <span className="text-amber-400">*</span>
                </Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Misal: Migrasi Autentikasi ke Supabase Cloud"
                  className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500/50"
                  required
                />
              </div>

              {/* Context (Latar Belakang) */}
              <div className="space-y-2">
                <Label htmlFor="context" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Konteks & Masalah (Latar Belakang)
                </Label>
                <Textarea
                  id="context"
                  value={form.context}
                  onChange={(e) => setForm((prev) => ({ ...prev, context: e.target.value }))}
                  placeholder="Jelaskan situasi, kendala, atau kebutuhan awal yang memicu keputusan ini..."
                  rows={4}
                  className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500/50"
                />
              </div>

              {/* Decision Text */}
              <div className="space-y-2">
                <Label htmlFor="decision_text" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Keputusan yang Diambil <span className="text-amber-400">*</span>
                </Label>
                <Textarea
                  id="decision_text"
                  value={form.decision_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, decision_text: e.target.value }))}
                  placeholder="Tuliskan tindakan atau kesepakatan final yang disetujui..."
                  rows={4}
                  className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500/50"
                />
              </div>

              {/* Rationale (Alasan) */}
              <div className="space-y-2">
                <Label htmlFor="rationale" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Alasan & Pertimbangan (Rasional)
                </Label>
                <Textarea
                  id="rationale"
                  value={form.rationale}
                  onChange={(e) => setForm((prev) => ({ ...prev, rationale: e.target.value }))}
                  placeholder="Mengapa keputusan ini yang dipilih? Apa trade-off atau dampak positifnya?..."
                  rows={3}
                  className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500/50"
                />
              </div>

              {/* Grid: Owner, Date, Status */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="owner_name" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Penanggung Jawab (Owner) <span className="text-amber-400">*</span>
                  </Label>
                  <Input
                    id="owner_name"
                    value={form.owner_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                    placeholder="Nama PIC atau Tim"
                    className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="decision_date" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Tanggal Keputusan
                  </Label>
                  <Input
                    id="decision_date"
                    type="date"
                    value={form.decision_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, decision_date: e.target.value }))}
                    className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Status
                  </Label>
                  <Select
                    value={form.status}
                    onValueChange={(val: DecisionStatus) => setForm((prev) => ({ ...prev, status: val }))}
                  >
                    <SelectTrigger className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100">
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900 text-zinc-100">
                      <SelectItem value="decided">Diputuskan (Decided)</SelectItem>
                      <SelectItem value="proposed">Diusulkan (Proposed)</SelectItem>
                      <SelectItem value="superseded">Digantikan (Superseded)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label htmlFor="tags" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Tag Kategori (Pisahkan dengan koma)
                </Label>
                <Input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="arsitektur, backend, keamanan"
                  className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-sm text-zinc-100"
                />
              </div>

              {/* External Links Section [P5] */}
              <div className="space-y-3 border-t border-white/[0.08] pt-6">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Tautan Referensi Eksternal (Notion, Linear, Google Docs, URL)
                  </Label>
                  <span className="text-[11px] text-zinc-500">Opsional</span>
                </div>

                {form.links.length > 0 && (
                  <div className="space-y-2">
                    {form.links.map((link, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-zinc-950/40 px-3.5 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <ExternalLink className="size-3.5 shrink-0 text-amber-400" />
                          <span className="font-semibold text-zinc-200">{link.label}</span>
                          <span className="truncate text-zinc-500">({link.url})</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLink(idx)}
                          className="size-7 rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Nama Label (mis: PRD Notion, Tiket Linear)"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    className="rounded-xl border-white/[0.08] bg-zinc-950/60 text-xs text-zinc-100 sm:w-1/3"
                  />
                  <Input
                    placeholder="https://notion.so/... atau https://linear.app/..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="flex-1 rounded-xl border-white/[0.08] bg-zinc-950/60 text-xs text-zinc-100"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addLink}
                    disabled={!linkUrl.trim()}
                    className="gap-1.5 rounded-xl border-amber-500/30 bg-amber-500/10 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                  >
                    <Plus className="size-3.5" />
                    Tambah
                  </Button>
                </div>
              </div>

              {/* Source Notes Section (Saved Reference) */}
              {form.source_notes && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-950/15 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-amber-400">
                      Tersimpan: Catatan Sumber Asli (AI Context)
                    </span>
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                      {form.source_notes.length} Karakter
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap font-mono text-zinc-400">
                    {form.source_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (workflowMode === "ai") {
                    setAiDraftReady(false);
                  } else {
                    navigate({ to: "/" });
                  }
                }}
                className="rounded-xl text-xs text-zinc-400 hover:text-white"
              >
                {workflowMode === "ai" ? "Kembali ke Catatan Mentah" : "Batal"}
              </Button>

              <Button
                type="submit"
                disabled={saving}
                className="h-11 gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 px-8 font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Menyimpan Keputusan...
                  </>
                ) : (
                  <>
                    <Check className="size-4 text-zinc-950 stroke-[3]" />
                    Simpan Keputusan
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
