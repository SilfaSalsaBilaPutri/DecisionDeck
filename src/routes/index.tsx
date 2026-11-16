import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Layers3,
  Link2,
  ListFilter,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { filterDecisions, type DecisionFilters, type DecisionListItem, type DecisionStatus } from "@/lib/decision-search";
import { deleteDecision, listDecisions, saveDecision, summarizeDecisionNotes, type DecisionLinkInput } from "@/lib/decisions.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DecisionDeck — Simpan keputusan, temukan alasannya" },
      { name: "description", content: "Catat keputusan dan konteksnya, lalu temukan kembali alasan di baliknya saat dibutuhkan." },
      { property: "og:title", content: "DecisionDeck — Catatan keputusan pribadi" },
      { property: "og:description", content: "Simpan keputusan, konteks, dan alasannya dalam satu tempat pribadi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DecisionDeckHome,
});

export type DecisionForm = {
  title: string;
  context: string;
  decision_text: string;
  rationale: string;
  owner_name: string;
  decision_date: string;
  status: DecisionStatus;
  tags: string;
  links: DecisionLinkInput[];
  source_notes?: string;
  creation_method?: "manual" | "ai_summarized";
};

export type StoredDecision = DecisionListItem & {
  links?: DecisionLinkInput[];
  source_notes?: string;
  creation_method?: "manual" | "ai_summarized";
};

const DEMO_STORAGE_KEY = "decisiondeck_demo_decisions";

const INITIAL_DEMO_DECISIONS: StoredDecision[] = [
  {
    id: "demo-1",
    title: "Migrasi Autentikasi ke Supabase Cloud",
    context: "Sistem membutuhkan autentikasi pengguna yang aman dengan dukungan sesi berbasis JWT dan RLS di PostgreSQL.",
    decision_text: "Menggunakan Supabase Auth untuk seluruh manajemen autentikasi dan otorisasi pengguna.",
    rationale: "Menghindari pembuatan auth dari nol, mempercepat pengiriman MVP, dan native dengan basis data Supabase.",
    owner_name: "Silfa Salsabila Putri",
    decision_date: "2026-11-08",
    status: "decided",
    tags: ["arsitektur", "keamanan", "backend"],
    links: [
      { label: "Supabase Auth Docs", url: "https://supabase.com/docs/guides/auth" },
    ],
    creation_method: "manual",
    source_notes: "",
  },
  {
    id: "demo-2",
    title: "Adopsi Arsitektur Local-First untuk Mode Demo",
    context: "Penguji dan reviewer membutuhkan akses instan tanpa kendala koneksi atau batasan kuota kredit eksternal.",
    decision_text: "Mengimplementasikan penyimpanan lokal terisolasi pada browser agar seluruh fungsionalitas CRUD, pencarian, dan AI dapat diuji secara mandiri.",
    rationale: "Memastikan kehandalan demo offline tanpa bergantung pada layanan pihak ketiga yang mungkin sedang habis limit.",
    owner_name: "Tim Engineering",
    decision_date: "2026-11-10",
    status: "decided",
    tags: ["fitur", "demo", "frontend"],
    links: [
      { label: "Spesifikasi Coldstart", url: "https://github.com/decisiondeck" },
    ],
    creation_method: "manual",
    source_notes: "",
  },
  {
    id: "demo-3",
    title: "Eksplorasi Semantic Search dengan pgvector",
    context: "Pencarian berbasis kata kunci saat ini sudah berfungsi, namun pengguna menginginkan pencarian berbasis makna (semantic search).",
    decision_text: "Menunda implementasi Stage 2 pgvector hingga rilis Stage 1 MVP dinyatakan stabil.",
    rationale: "Prioritas utama adalah menyelesaikan flow inti pencatatan dan pencarian cepat terlebih dahulu.",
    owner_name: "Rani Pramesti",
    decision_date: "2026-11-11",
    status: "proposed",
    tags: ["roadmap", "stage-2", "ai"],
    links: [
      { label: "Notion Roadmap", url: "https://notion.so/decisiondeck-roadmap" },
    ],
    creation_method: "ai_summarized",
    source_notes: "Rapat mingguan produk: Diskusi mengenai prioritas fitur pencarian semantik AI vs stabilitas rilis Stage 1. Semua sepakat fokus pada MVP dulu.",
  },
];

function getDemoDecisions(): StoredDecision[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(DEMO_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_DECISIONS));
    return INITIAL_DEMO_DECISIONS;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return INITIAL_DEMO_DECISIONS;
  }
}

function saveDemoDecisions(data: StoredDecision[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
}

const defaultFilters: DecisionFilters = {
  query: "",
  status: "",
  tag: "",
  owner: "",
  dateFrom: "",
  dateTo: "",
};

function localDate() {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function blankForm(): DecisionForm {
  return {
    title: "",
    context: "",
    decision_text: "",
    rationale: "",
    owner_name: "",
    decision_date: localDate(),
    status: "proposed",
    tags: "",
    links: [],
    source_notes: "",
    creation_method: "manual",
  };
}

function formFromDecision(decision: StoredDecision): DecisionForm {
  return {
    title: decision.title,
    context: decision.context,
    decision_text: decision.decision_text,
    rationale: decision.rationale,
    owner_name: decision.owner_name,
    decision_date: decision.decision_date,
    status: decision.status as DecisionStatus,
    tags: decision.tags.join(", "),
    links: decision.links ?? [],
    source_notes: decision.source_notes ?? "",
    creation_method: decision.creation_method ?? "manual",
  };
}

function formatDate(value: string) {
  if (!value) return "Tanggal belum tersedia";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function statusLabel(status: string) {
  if (status === "decided") return "Diputuskan";
  if (status === "superseded") return "Digantikan";
  return "Diusulkan";
}

function parseNotesToDraft(rawNotes: string): Partial<DecisionForm> {
  const text = rawNotes.trim();
  if (!text) return {};

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = "";
  let context = "";
  let decision_text = "";
  let rationale = "";
  let owner_name = "";
  const tags: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!title && (lower.startsWith("judul:") || lower.startsWith("topik:") || lower.startsWith("topic:") || lower.startsWith("title:"))) {
      title = line.replace(/^(judul|topik|topic|title)\s*:\s*/i, "").trim();
    } else if (!owner_name && (lower.startsWith("owner:") || lower.startsWith("pic:") || lower.startsWith("penanggung jawab:") || lower.startsWith("lead:"))) {
      owner_name = line.replace(/^(owner|pic|penanggung jawab|lead)\s*:\s*/i, "").trim();
    } else if (!decision_text && (lower.startsWith("keputusan:") || lower.startsWith("decision:") || lower.startsWith("kesimpulan:"))) {
      decision_text = line.replace(/^(keputusan|decision|kesimpulan)\s*:\s*/i, "").trim();
    } else if (!rationale && (lower.startsWith("alasan:") || lower.startsWith("rationale:") || lower.startsWith("kenapa:") || lower.startsWith("mengapa:"))) {
      rationale = line.replace(/^(alasan|rationale|kenapa|mengapa)\s*:\s*/i, "").trim();
    } else if (!context && (lower.startsWith("konteks:") || lower.startsWith("context:") || lower.startsWith("latar belakang:") || lower.startsWith("background:"))) {
      context = line.replace(/^(konteks|context|latar belakang|background)\s*:\s*/i, "").trim();
    }
  }

  if (!title && lines.length > 0) {
    title = (lines[0] ?? "").replace(/^[#\-*\d.]+\s*/, "").slice(0, 100);
  }
  if (!decision_text) {
    const decisionLine = lines.find((l) => /memutuskan|sepakat|setuju|akan menggunakan|dipilih|agreed|decided/i.test(l));
    if (decisionLine) {
      decision_text = decisionLine.replace(/^[#\-*\d.]+\s*/, "").trim();
    } else if (lines.length > 1) {
      decision_text = lines[1] ?? "";
    }
  }
  if (!context) {
    context = lines.slice(0, Math.min(3, lines.length)).join(" ");
  }
  if (!rationale) {
    const rationaleLine = lines.find((l) => /karena|alasan|sebab|pertimbangan|because|in order to/i.test(l));
    if (rationaleLine) {
      rationale = rationaleLine.replace(/^[#\-*\d.]+\s*/, "").trim();
    } else {
      rationale = "Berdasarkan pertimbangan efisiensi dan kesesuaian kebutuhan tim pada catatan diskusi.";
    }
  }
  if (!owner_name) {
    owner_name = "Silfa Salsabila Putri";
  }

  const tagKeywords = ["frontend", "backend", "arsitektur", "produk", "keamanan", "database", "api", "infra", "prioritas", "ui/ux", "auth", "mobile"];
  for (const kw of tagKeywords) {
    if (text.toLowerCase().includes(kw)) {
      tags.push(kw);
    }
  }
  if (!tags.length) {
    tags.push("ai-summary", "produk");
  }

  return {
    title,
    context,
    decision_text,
    rationale,
    owner_name,
    decision_date: localDate(),
    status: "decided",
    tags: tags.join(", "),
    source_notes: text,
    creation_method: "ai_summarized",
  };
}

function DecisionDeckHome() {
  const queryClient = useQueryClient();
  const listDecisionsFn = useServerFn(listDecisions);
  const saveDecisionFn = useServerFn(saveDecision);
  const deleteDecisionFn = useServerFn(deleteDecision);
  const summarizeNotesFn = useServerFn(summarizeDecisionNotes);

  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [filters, setFilters] = useState<DecisionFilters>(defaultFilters);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StoredDecision | null>(null);
  const [form, setForm] = useState<DecisionForm>(blankForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<StoredDecision | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredDecision | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // AI Summarizer states (Default: AI-First)
  const [aiMode, setAiMode] = useState(true);
  const [rawNotes, setRawNotes] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraftBanner, setAiDraftBanner] = useState(false);

  useEffect(() => {
    let active = true;

    // Check if in demo mode
    if (typeof window !== "undefined" && localStorage.getItem("demo_mode") === "true") {
      const stored = localStorage.getItem("user");
      let email = "demo@decisiondeck.local";
      try {
        if (stored) email = JSON.parse(stored).email || email;
      } catch { }
      setUser({ id: "demo-user-id", email });
      setIsDemo(true);
      setAuthReady(true);
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        setUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
        setIsDemo(false);
        setAuthReady(true);
        if (event === "SIGNED_OUT") void queryClient.cancelQueries().then(() => queryClient.clear());
      }
    });

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (!error && data.user) {
        setUser({ id: data.user.id, email: data.user.email ?? null });
        setIsDemo(false);
      } else {
        setUser(null);
      }
      setAuthReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [queryClient]);

  const decisionsQuery = useQuery({
    queryKey: ["decisions", user?.id, isDemo],
    queryFn: async () => {
      if (isDemo) {
        return getDemoDecisions();
      }
      return listDecisionsFn();
    },
    enabled: Boolean(user),
    retry: false,
  });

  const decisions = (decisionsQuery.data ?? []) as StoredDecision[];
  const visibleDecisions = useMemo(() => filterDecisions(decisions, filters), [decisions, filters]);
  const allTags = useMemo(
    () => [...new Set(decisions.flatMap((decision) => decision.tags))].sort((a, b) => a.localeCompare(b, "id")),
    [decisions],
  );

  function openCreate() {
    setEditing(null);
    setForm(blankForm());
    setFormError("");
    setLinkLabel("");
    setLinkUrl("");
    setAiMode(true); // Default to AI-First Experience
    setRawNotes("");
    setAiDraftBanner(false);
    setFormOpen(true);
  }

  function openEdit(decision: StoredDecision) {
    setSelected(null);
    setEditing(decision);
    setForm(formFromDecision(decision));
    setFormError("");
    setLinkLabel("");
    setLinkUrl("");
    setAiMode(false);
    setRawNotes("");
    setAiDraftBanner(false);
    setFormOpen(true);
  }

      async function handleAiSummarize() {
        const trimmedNotes = rawNotes.trim();
        if (!trimmedNotes) {
          setFormError("Masukkan catatan teks terlebih dahulu untuk diringkas.");
          return;
        }
        if (trimmedNotes.length > 10000) {
          setFormError("Catatan terlalu panjang (maksimal 10.000 karakter).");
          return;
        }

        setAiGenerating(true);
        setFormError("");
        try {
          const response = await summarizeNotesFn({ data: { rawNotes: trimmedNotes } });
          if (response && response.success && response.data) {
            const { title, context, decision_text, rationale, owner_name, suggested_tags, suggested_status } = response.data;
            setForm((current) => ({
              ...current,
              title: title || current.title,
              context: context || current.context,
              decision_text: decision_text || current.decision_text,
              rationale: rationale || current.rationale,
              owner_name: owner_name || current.owner_name,
              status: suggested_status || "decided",
              tags: suggested_tags && suggested_tags.length > 0 ? suggested_tags.join(", ") : current.tags,
              source_notes: trimmedNotes,
              creation_method: "ai_summarized",
              links: current.links,
            }));
          } else {
            const draft = parseNotesToDraft(trimmedNotes);
            setForm((current) => ({
              ...current,
              ...draft,
              source_notes: trimmedNotes,
              creation_method: "ai_summarized",
              links: current.links,
            }));
          }
          setAiMode(false);
          setAiDraftBanner(true);
        } catch {
          const draft = parseNotesToDraft(trimmedNotes);
          setForm((current) => ({
            ...current,
            ...draft,
            source_notes: trimmedNotes,
            creation_method: "ai_summarized",
            links: current.links,
          }));
          setAiMode(false);
          setAiDraftBanner(true);
        } finally {
          setAiGenerating(false);
        }
      }

      async function submitDecision(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError("");
        if (!form.title.trim() || !form.owner_name.trim()) {
          setFormError("Judul dan penanggung jawab perlu diisi.");
          return;
        }
        if (form.status !== "proposed" && !form.decision_text.trim()) {
          setFormError("Isi keputusan wajib untuk status Diputuskan atau Digantikan.");
          return;
        }
        setSaving(true);
        try {
          const cleanTags = form.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
          const cleanLinks = form.links;

          if (isDemo) {
            const currentList = getDemoDecisions();
            const item: StoredDecision = {
              id: editing?.id ?? `demo-${Date.now()}`,
              title: form.title.trim(),
              context: form.context,
              decision_text: form.decision_text,
              rationale: form.rationale,
              owner_name: form.owner_name.trim(),
              decision_date: form.decision_date,
              status: form.status,
              tags: cleanTags,
              links: cleanLinks,
              source_notes: form.source_notes ?? "",
              creation_method: form.creation_method ?? "manual",
            };

            const updatedList = editing?.id
              ? currentList.map((d) => (d.id === editing.id ? item : d))
              : [item, ...currentList];

            saveDemoDecisions(updatedList);
            await queryClient.invalidateQueries({ queryKey: ["decisions", user?.id, isDemo] });
            setFormOpen(false);
            return;
          }

          await saveDecisionFn({
            data: {
              id: editing?.id ?? null,
              title: form.title.trim(),
              context: form.context,
              decision_text: form.decision_text,
              rationale: form.rationale,
              owner_name: form.owner_name.trim(),
              decision_date: form.decision_date,
              status: form.status,
              tags: cleanTags,
              links: cleanLinks,
              source_notes: form.source_notes ?? "",
              creation_method: form.creation_method ?? "manual",
            },
          });
          await queryClient.invalidateQueries({ queryKey: ["decisions", user?.id, isDemo] });
          setFormOpen(false);
        } catch {
          setFormError("Keputusan belum tersimpan. Periksa koneksi lalu coba lagi.");
        } finally {
          setSaving(false);
        }
      }

      async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
          if (isDemo) {
            const currentList = getDemoDecisions();
            const updatedList = currentList.filter((item) => item.id !== deleteTarget.id);
            saveDemoDecisions(updatedList);
            await queryClient.invalidateQueries({ queryKey: ["decisions", user?.id, isDemo] });
            setDeleteTarget(null);
            setSelected(null);
            return;
          }

          await deleteDecisionFn({ data: { id: deleteTarget.id } });
          await queryClient.invalidateQueries({ queryKey: ["decisions", user?.id, isDemo] });
          setDeleteTarget(null);
          setSelected(null);
        } catch {
          setDeleteTarget(null);
          setFormError("Keputusan belum dapat dihapus. Coba lagi.");
        } finally {
          setDeleting(false);
        }
      }

      async function signOut() {
        if (typeof window !== "undefined") {
          localStorage.removeItem("demo_mode");
          localStorage.removeItem("user");
        }
        setIsDemo(false);
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        setUser(null);
      }

      function addLink() {
        try {
          const parsed = new URL(linkUrl.trim());
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Invalid protocol");
          setForm((current) => ({ ...current, links: [...current.links, { label: linkLabel.trim(), url: parsed.href }] }));
          setLinkLabel("");
          setLinkUrl("");
          setFormError("");
        } catch {
          setFormError("Masukkan tautan lengkap yang diawali http:// atau https://.");
        }
      }

      if (!authReady) {
        return <main className="flex min-h-screen items-center justify-center bg-[#0c0d12] text-sm text-zinc-400">Memuat DecisionDeck…</main>;
      }

      if (!user) return <WelcomePage />;

      return (
        <div className="relative min-h-screen bg-[#0c0d12] text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200">
          {/* Ambient background glow */}
          <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(245,158,11,0.10),transparent_70%)]" />

          <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0c0d12]/85 backdrop-blur-md">
            <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
              <Link to="/" className="flex items-center gap-2.5 text-zinc-100 transition-opacity hover:opacity-90" aria-label="DecisionDeck beranda">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-md shadow-amber-500/20">
                  <Layers3 className="size-5" />
                </span>
                <span className="text-lg font-bold tracking-tight text-zinc-100">
                  Decision<span className="text-amber-400">Deck</span>
                </span>
              </Link>
              <div className="flex items-center gap-3">
                {isDemo && (
                  <Badge variant="outline" className="flex items-center gap-1.5 rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                    <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Mode Demo Lokal
                  </Badge>
                )}
                <span className="hidden max-w-48 truncate rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1 font-mono text-xs text-zinc-300 sm:inline">
                  {user.email}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void signOut()}
                  className="rounded-full text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label="Keluar"
                >
                  Keluar
                </Button>
              </div>
            </div>
          </header>

          <main className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <span className="inline-block text-xs font-bold uppercase tracking-widest text-amber-400">RUANG PRIBADI</span>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-100 sm:text-4xl">Keputusan Saya</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">Catat apa yang diputuskan, siapa penanggung jawabnya, dan alasan di baliknya.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  asChild
                  className="h-10 gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <Link to="/decisions/new">
                    <Sparkles className="size-4 text-zinc-950" /> Buat Keputusan (AI)
                  </Link>
                </Button>
              </div>
            </div>

            {isDemo && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-950/20 to-transparent p-4 text-xs text-amber-200/95 shadow-lg shadow-amber-500/5 backdrop-blur-sm sm:text-sm">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div>
                  <strong className="font-semibold text-amber-300">Mode Demo Aktif:</strong> Seluruh data keputusan tersimpan terisolasi di penyimpanan lokal browser Anda (LocalStorage). Anda dapat menguji seluruh alur CRUD, pencarian kata kunci, saringan tag, ringkasan AI, dan tautan eksternal secara mandiri tanpa batas.
                </div>
              </div>
            )}

            {formError && !formOpen ? (
              <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {formError}
              </p>
            ) : null}

            {decisionsQuery.isLoading ? (
              <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#141620]/60 py-16 text-center text-sm text-zinc-400">
                Memuat keputusan…
              </div>
            ) : decisionsQuery.isError ? (
              <div className="mt-10 rounded-2xl border border-red-500/20 bg-[#141620]/60 py-12 text-center" role="alert">
                <p className="font-medium text-red-300">Daftar keputusan belum dapat dimuat.</p>
                <Button variant="outline" className="mt-4 rounded-xl border-white/10" onClick={() => void decisionsQuery.refetch()}>
                  Coba lagi
                </Button>
              </div>
            ) : decisions.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#141620]/80 py-16 text-center shadow-xl shadow-black/40">
                <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                  <FileText className="size-7" />
                </span>
                <h2 className="mt-5 text-xl font-bold tracking-tight text-zinc-100">Mulai catat keputusan pertama</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">Simpan hasil diskusi dan alasannya agar mudah ditemukan kembali nanti.</p>
                <Button
                  asChild
                  className="mt-6 gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:brightness-105"
                >
                  <Link to="/decisions/new">
                    <Sparkles className="size-4 text-zinc-950" /> Buat Keputusan Pertama (AI)
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <section aria-label="Cari dan saring keputusan" className="mt-8 rounded-2xl border border-white/[0.08] bg-[#141620]/85 p-4 shadow-xl shadow-black/30 backdrop-blur-sm sm:p-5">
                  <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(130px,1fr))]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                      <Input
                        aria-label="Cari keputusan"
                        placeholder="Cari judul, isi, alasan, atau tag…"
                        value={filters.query}
                        onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                        className="h-10 rounded-xl border-white/10 bg-[#0c0e14] pl-10 pr-9 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                      />
                      {filters.query ? (
                        <button
                          type="button"
                          aria-label="Hapus kata pencarian"
                          onClick={() => setFilters((current) => ({ ...current, query: "" }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100"
                        >
                          <X className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    <Select value={filters.status || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, status: value === "all" ? "" : value }))}>
                      <SelectTrigger aria-label="Saring berdasarkan status" className="h-10 rounded-xl border-white/10 bg-[#0c0e14] text-zinc-200">
                        <ListFilter className="mr-2 size-4 text-zinc-400" />
                        <SelectValue placeholder="Semua status" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-white/10 bg-[#141620] text-zinc-200">
                        <SelectItem value="all">Semua status</SelectItem>
                        <SelectItem value="proposed">Diusulkan</SelectItem>
                        <SelectItem value="decided">Diputuskan</SelectItem>
                        <SelectItem value="superseded">Digantikan</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filters.tag || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, tag: value === "all" ? "" : value }))}>
                      <SelectTrigger aria-label="Saring berdasarkan tag" className="h-10 rounded-xl border-white/10 bg-[#0c0e14] text-zinc-200">
                        <SlidersHorizontal className="mr-2 size-4 text-zinc-400" />
                        <SelectValue placeholder="Semua tag" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-white/10 bg-[#141620] text-zinc-200">
                        <SelectItem value="all">Semua tag</SelectItem>
                        {allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label="Saring berdasarkan penanggung jawab"
                      placeholder="Penanggung jawab"
                      value={filters.owner}
                      onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}
                      className="h-10 rounded-xl border-white/10 bg-[#0c0e14] text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                    />
                  </div>
                  <div className="mt-3.5 flex flex-col gap-3 border-t border-white/[0.06] pt-3.5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                      <CalendarDays className="size-4 text-amber-400" />
                      <span>Tanggal keputusan:</span>
                    </div>
                    <Input
                      aria-label="Tanggal mulai"
                      type="date"
                      value={filters.dateFrom}
                      onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                      className="h-9 rounded-xl border-white/10 bg-[#0c0e14] text-xs text-zinc-200 sm:max-w-44"
                    />
                    <span className="hidden text-xs text-zinc-500 sm:inline">hingga</span>
                    <Input
                      aria-label="Tanggal akhir"
                      type="date"
                      value={filters.dateTo}
                      onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                      className="h-9 rounded-xl border-white/10 bg-[#0c0e14] text-xs text-zinc-200 sm:max-w-44"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 rounded-lg text-xs font-semibold text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 sm:ml-auto"
                      onClick={() => setFilters(defaultFilters)}
                    >
                      Atur ulang
                    </Button>
                  </div>
                </section>

                <div className="flex items-center justify-between gap-4 py-5">
                  <p className="text-xs text-zinc-400 sm:text-sm">
                    Menampilkan <span className="font-bold text-amber-400">{visibleDecisions.length}</span> dari {decisions.length} keputusan
                  </p>
                  <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex">
                    <LockKeyhole className="size-3.5 text-amber-400/80" /> Hanya terlihat oleh Anda
                  </span>
                </div>

                {visibleDecisions.length ? (
                  <div className="grid gap-3.5">
                    {visibleDecisions.map((decision) => (
                      <article
                        key={decision.id}
                        className="group relative rounded-2xl border border-white/[0.07] bg-[#141620]/80 p-5 shadow-lg shadow-black/20 backdrop-blur-sm transition-all duration-200 hover:border-amber-500/40 hover:bg-[#171924] sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                      >
                        <button type="button" className="min-w-0 text-left" onClick={() => setSelected(decision)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="break-words text-lg font-bold text-zinc-100 transition-colors group-hover:text-amber-400">
                              {decision.title}
                            </h2>
                            <Badge
                              variant="outline"
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${decision.status === "decided"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : decision.status === "superseded"
                                    ? "border-zinc-700 bg-zinc-800 text-zinc-400"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                }`}
                            >
                              {statusLabel(decision.status)}
                            </Badge>
                            {decision.creation_method === "ai_summarized" && (
                              <Badge variant="secondary" className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                                <Sparkles className="size-3 text-amber-400" /> Ringkas AI
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2.5 line-clamp-2 text-sm leading-6 text-zinc-400">
                            {decision.decision_text || decision.context || decision.rationale || "Belum ada ringkasan isi."}
                          </p>
                          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 font-medium">
                            <span className="text-zinc-300">{decision.owner_name}</span>
                            <span>•</span>
                            <span>{formatDate(decision.decision_date)}</span>
                            {decision.tags.map((tag) => (
                              <span key={tag} className="rounded-md border border-white/5 bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-300 font-medium">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </button>
                        <div className="mt-3 flex items-center gap-1.5 self-start sm:mt-0 sm:self-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ubah ${decision.title}`}
                            title="Ubah"
                            onClick={() => openEdit(decision)}
                            className="size-9 rounded-xl border border-white/5 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-amber-500/30 hover:bg-zinc-800 hover:text-amber-400"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Hapus ${decision.title}`}
                            title="Hapus"
                            onClick={() => setDeleteTarget(decision)}
                            className="size-9 rounded-xl border border-white/5 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-red-500/30 hover:bg-zinc-800 hover:text-red-400"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Lihat ${decision.title}`}
                            title="Lihat detail"
                            onClick={() => setSelected(decision)}
                            className="size-9 rounded-xl border border-white/5 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-amber-500/30 hover:bg-zinc-800 hover:text-amber-400"
                          >
                            <ArrowUpRight className="size-4" />
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/[0.08] bg-[#141620]/60 py-16 text-center">
                    <h2 className="font-bold text-zinc-200">Tidak ada keputusan yang cocok</h2>
                    <p className="mt-2 text-sm text-zinc-500">Coba kata kunci atau saringan yang berbeda.</p>
                    <Button
                      variant="outline"
                      className="mt-4 rounded-xl border-white/10 text-amber-400 hover:bg-amber-500/10"
                      onClick={() => setFilters(defaultFilters)}
                    >
                      Hapus pencarian dan saringan
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>

          {/* Dialog Form Create / Edit Decision */}
          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#141620]/95 p-6 text-zinc-100 shadow-2xl shadow-black/80 backdrop-blur-2xl sm:max-w-2xl sm:p-7">
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <DialogTitle className="text-xl font-bold tracking-tight text-zinc-100">
                    {editing ? "Ubah keputusan" : "Buat keputusan"}
                  </DialogTitle>
                  {!editing && (
                    <Button
                      type="button"
                      variant={aiMode ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setAiMode(!aiMode)}
                      className={`gap-1.5 rounded-xl text-xs font-semibold transition-all ${aiMode
                          ? "border border-amber-500/40 bg-amber-500/20 text-amber-300"
                          : "border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.12)]"
                        }`}
                    >
                      <Sparkles className="size-3.5 text-amber-400" />
                      {aiMode ? "Beralih ke Form Manual" : "Ringkas dari Catatan (AI)"}
                    </Button>
                  )}
                </div>
                <DialogDescription className="text-zinc-400">
                  {aiMode
                    ? "Tempel catatan rapat atau diskusi (hingga 10.000 karakter) untuk menghasilkan draf otomatis."
                    : "Catat hasil diskusi dan alasan yang ingin Anda ingat."}
                </DialogDescription>
              </DialogHeader>

              {aiMode ? (
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ai-raw-notes" className="text-xs font-semibold text-zinc-300">
                        Catatan Mentah / Notula Rapat
                      </Label>
                      <span className="font-mono text-xs text-amber-400/90">
                        {rawNotes.length.toLocaleString("id-ID")} / 10.000 karakter
                      </span>
                    </div>
                    <Textarea
                      id="ai-raw-notes"
                      maxLength={10000}
                      rows={8}
                      placeholder="Tempel catatan rapat, diskusi chat, atau draf keputusan di sini..."
                      value={rawNotes}
                      onChange={(e) => setRawNotes(e.target.value)}
                      className="rounded-xl border-white/10 bg-[#0c0d14] text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
                    <Button type="button" variant="outline" className="rounded-xl border-white/10" onClick={() => setAiMode(false)}>
                      Beralih ke Isi Manual
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleAiSummarize()}
                      disabled={!rawNotes.trim() || aiGenerating}
                      className="gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:brightness-105"
                    >
                      {aiGenerating ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Menganalisis...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4 text-zinc-950" /> Hasilkan Draf Keputusan
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={(event) => void submitDecision(event)} className="space-y-4 pt-1">
                  {aiDraftBanner && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 shrink-0 text-amber-400" />
                        <span>Draf keputusan berhasil dibuat dari catatan. Anda dapat meninjau dan melengkapinya sebelum disimpan.</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-amber-400 hover:bg-amber-500/20 hover:text-amber-200"
                        onClick={() => {
                          setForm(blankForm());
                          setAiDraftBanner(false);
                        }}
                      >
                        Tolak draf
                      </Button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="decision-title" className="text-xs font-semibold text-zinc-300">Judul Keputusan</Label>
                    <Input
                      id="decision-title"
                      autoFocus
                      required
                      maxLength={180}
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Contoh: Fokus pada paket tahunan"
                      className="h-10 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="decision-context" className="text-xs font-semibold text-zinc-300">Konteks</Label>
                    <Textarea
                      id="decision-context"
                      value={form.context}
                      onChange={(event) => setForm((current) => ({ ...current, context: event.target.value }))}
                      placeholder="Apa latar belakang yang memicu pembahasan ini?"
                      rows={3}
                      className="rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="decision-text" className="text-xs font-semibold text-zinc-300">Isi Keputusan</Label>
                    <Textarea
                      id="decision-text"
                      value={form.decision_text}
                      onChange={(event) => setForm((current) => ({ ...current, decision_text: event.target.value }))}
                      placeholder="Apa yang diputuskan secara definitif?"
                      rows={3}
                      className="rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="decision-rationale" className="text-xs font-semibold text-zinc-300">Alasan & Pertimbangan</Label>
                    <Textarea
                      id="decision-rationale"
                      value={form.rationale}
                      onChange={(event) => setForm((current) => ({ ...current, rationale: event.target.value }))}
                      placeholder="Mengapa opsi ini dipilih dibanding opsi lain?"
                      rows={3}
                      className="rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>
                  <div className="grid gap-3.5 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="decision-owner" className="text-xs font-semibold text-zinc-300">Penanggung Jawab</Label>
                      <Input
                        id="decision-owner"
                        required
                        value={form.owner_name}
                        onChange={(event) => setForm((current) => ({ ...current, owner_name: event.target.value }))}
                        className="h-10 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="decision-date" className="text-xs font-semibold text-zinc-300">Tanggal</Label>
                      <Input
                        id="decision-date"
                        type="date"
                        required
                        value={form.decision_date}
                        onChange={(event) => setForm((current) => ({ ...current, decision_date: event.target.value }))}
                        className="h-10 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-zinc-300">Status</Label>
                      <Select value={form.status} onValueChange={(value: DecisionStatus) => setForm((current) => ({ ...current, status: value }))}>
                        <SelectTrigger aria-label="Status keputusan" className="h-10 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-white/10 bg-[#141620] text-zinc-200">
                          <SelectItem value="proposed">Diusulkan</SelectItem>
                          <SelectItem value="decided">Diputuskan</SelectItem>
                          <SelectItem value="superseded">Digantikan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {form.status !== "proposed" && !form.decision_text.trim() ? (
                    <p className="text-xs text-amber-400">Isi keputusan diperlukan untuk status Diputuskan atau Digantikan.</p>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor="decision-tags" className="text-xs font-semibold text-zinc-300">Tag (pisahkan dengan koma)</Label>
                    <Input
                      id="decision-tags"
                      value={form.tags}
                      onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                      placeholder="Produk, Prioritas, Keamanan"
                      className="h-10 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>

                  <div className="space-y-2.5 rounded-2xl border border-white/[0.06] bg-[#0c0e14]/60 p-4">
                    <Label className="text-xs font-semibold text-zinc-300">Tautan Referensi</Label>
                    {form.links.map((link, index) => (
                      <div key={`${link.url}-${index}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300">
                        <Link2 className="size-3.5 shrink-0 text-amber-400" />
                        <span className="min-w-0 flex-1 truncate">{link.label || link.url}</span>
                        <button
                          type="button"
                          className="text-zinc-500 hover:text-red-400"
                          aria-label={`Hapus tautan ${link.label || index + 1}`}
                          onClick={() => setForm((current) => ({ ...current, links: current.links.filter((_, itemIndex) => itemIndex !== index) }))}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                      <Input
                        aria-label="Nama tautan"
                        value={linkLabel}
                        onChange={(event) => setLinkLabel(event.target.value)}
                        placeholder="Label (Notion, Docs, dsb.)"
                        className="h-9 rounded-xl border-white/10 bg-[#12141c] text-xs text-zinc-100 placeholder:text-zinc-600"
                      />
                      <Input
                        aria-label="Alamat tautan"
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        placeholder="https://…"
                        className="h-9 rounded-xl border-white/10 bg-[#12141c] text-xs text-zinc-100 placeholder:text-zinc-600"
                      />
                      <Button type="button" variant="outline" onClick={addLink} className="h-9 rounded-xl border-white/10 text-xs font-medium hover:bg-zinc-800">
                        Tambah
                      </Button>
                    </div>
                  </div>

                  {form.source_notes ? (
                    <div className="space-y-1 rounded-xl border border-amber-500/20 bg-amber-950/15 p-3 text-xs">
                      <p className="font-semibold text-amber-300">Sumber Catatan Asli Tersimpan:</p>
                      <p className="line-clamp-2 italic text-zinc-400">{form.source_notes}</p>
                    </div>
                  ) : null}

                  {formError ? (
                    <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                      {formError}
                    </p>
                  ) : null}

                  <div className="flex flex-col-reverse gap-2.5 border-t border-white/[0.08] pt-4 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" className="rounded-xl border-white/10 text-zinc-300 hover:bg-zinc-800" onClick={() => setFormOpen(false)}>
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving}
                      className="gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-lg shadow-amber-500/20 hover:brightness-105 active:scale-[0.98]"
                    >
                      {saving ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan keputusan"}
                      {!saving ? <Check className="size-4" /> : null}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>

          {/* Dialog Detail Decision */}
          <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#141620]/95 p-6 text-zinc-100 shadow-2xl shadow-black/80 backdrop-blur-2xl sm:max-w-2xl sm:p-7">
              {selected ? (
                <>
                  <DialogHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${selected.status === "decided"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : selected.status === "superseded"
                              ? "border-zinc-700 bg-zinc-800 text-zinc-400"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                          }`}
                      >
                        {statusLabel(selected.status)}
                      </Badge>
                      <span className="text-xs text-zinc-400">{formatDate(selected.decision_date)}</span>
                      {selected.creation_method === "ai_summarized" && (
                        <Badge variant="secondary" className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                          <Sparkles className="size-3 text-amber-400" /> Diringkas AI
                        </Badge>
                      )}
                    </div>
                    <DialogTitle className="break-words pt-2 text-2xl font-bold tracking-tight text-zinc-100">
                      {selected.title}
                    </DialogTitle>
                    <DialogDescription className="text-xs font-medium text-zinc-400">
                      Penanggung jawab: <span className="text-amber-400 font-semibold">{selected.owner_name}</span>
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <DetailBlock title="Konteks" value={selected.context} />
                    <DetailBlock title="Keputusan" value={selected.decision_text} />
                    <DetailBlock title="Alasan" value={selected.rationale} />

                    {selected.tags.length ? (
                      <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d14]/70 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400/90">Tag</h3>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {selected.tags.map((tag) => (
                            <span key={tag} className="rounded-md border border-white/5 bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-200 font-medium">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selected.links && Array.isArray(selected.links) && selected.links.length ? (
                      <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d14]/70 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400/90">Referensi & Tautan Eksternal</h3>
                        <ul className="mt-2.5 space-y-2">
                          {selected.links.map((link, index) => (
                            <li key={`${link.url}-${index}`}>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-full items-center gap-2 break-all rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-zinc-800 hover:underline"
                              >
                                <Link2 className="size-3.5 shrink-0 text-amber-400" />
                                {link.label || link.url}
                                <ArrowUpRight className="size-3.5 shrink-0 opacity-70" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {selected.source_notes ? (
                      <section className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">Catatan Sumber Asli (AI Summarizer)</h3>
                        <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{selected.source_notes}</p>
                      </section>
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-2.5 border-t border-white/[0.08] pt-4">
                    <Button variant="outline" onClick={() => openEdit(selected)} className="rounded-xl border-white/10 hover:bg-zinc-800">
                      <Pencil className="mr-2 size-4 text-amber-400" /> Ubah
                    </Button>
                    <Button variant="destructive" onClick={() => setDeleteTarget(selected)} className="rounded-xl">
                      <Trash2 className="mr-2 size-4" /> Hapus
                    </Button>
                  </div>
                </>
              ) : null}
            </DialogContent>
          </Dialog>

          {/* Alert Dialog Delete Confirmation */}
          <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
            <AlertDialogContent className="rounded-3xl border border-white/10 bg-[#141620] text-zinc-100 shadow-2xl shadow-black/80">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-lg font-bold text-zinc-100">Hapus keputusan ini?</AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-zinc-400">
                  “{deleteTarget?.title}” akan dihapus permanen dari catatan pribadi Anda.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="border-t border-white/[0.08] pt-4">
                <AlertDialogCancel disabled={deleting} className="rounded-xl border-white/10 hover:bg-zinc-800 text-zinc-300">
                  Batal
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={(event) => {
                    event.preventDefault();
                    void confirmDelete();
                  }}
                  className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Menghapus…" : "Hapus keputusan"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    }

    function DetailBlock({ title, value }: { title: string; value: string }) {
      return (
        <section className="rounded-2xl border border-white/[0.06] bg-[#0c0d14]/70 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400/90">{title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{value || "Belum diisi."}</p>
        </section>
      );
    }

    function WelcomePage() {
      return (
        <div className="relative min-h-screen bg-[#0c0d12] text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200">
          {/* Ambient background glow */}
          <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(245,158,11,0.14),transparent_70%)]" />

          <header className="relative z-10 border-b border-white/[0.08] bg-[#0c0d12]/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
              <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-md shadow-amber-500/20">
                  <Layers3 className="size-5" />
                </span>
                <span className="text-lg font-bold tracking-tight text-zinc-100">
                  Decision<span className="text-amber-400">Deck</span>
                </span>
              </Link>
              <Link
                to="/auth"
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20 hover:text-amber-200"
              >
                Masuk
              </Link>
            </div>
          </header>

          <main className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <section>
                <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                  CATATAN KEPUTUSAN PRIBADI
                </span>
                <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-tight text-zinc-100 sm:text-5xl">
                  Simpan keputusan.{" "}
                  <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                    Temukan kembali alasannya.
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400">
                  Satu tempat pribadi untuk menyimpan hasil diskusi, latar belakang, dan alasan di balik setiap keputusan penting agar tidak tenggelam di antara tumpukan catatan.
                </p>
                <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
                  <Button
                    asChild
                    className="h-11 gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-xl shadow-amber-500/20 transition-all hover:brightness-105 active:scale-[0.98]"
                  >
                    <Link to="/auth">
                      Mulai mencatat <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <a
                    href="#cara-kerja"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-5 text-sm font-semibold text-zinc-200 backdrop-blur-sm transition-all hover:bg-zinc-800 hover:text-white"
                  >
                    Lihat cara kerjanya <ChevronDown className="size-4" />
                  </a>
                </div>
                <p className="mt-6 flex items-center gap-2 text-xs text-zinc-500">
                  <LockKeyhole className="size-4 text-amber-400" /> Catatan bersifat pribadi dan hanya dapat diakses oleh akun Anda.
                </p>
              </section>

              <aside className="space-y-4">
                <div className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-[#141620]/80 p-5 shadow-xl shadow-black/40 backdrop-blur-sm">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.12)]">
                    <FileText className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-zinc-100">Catat konteksnya</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">Simpan keputusan, latar belakang masalah, dan pertimbangan dalam satu kesatuan catatan terstruktur.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-[#141620]/80 p-5 shadow-xl shadow-black/40 backdrop-blur-sm">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.12)]">
                    <Search className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-zinc-100">Temukan saat dibutuhkan</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">Temukan kembali dalam hitungan detik menggunakan pencarian kata kunci, status, tag, penanggung jawab, atau tanggal.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-[#141620]/80 p-5 shadow-xl shadow-black/40 backdrop-blur-sm">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.12)]">
                    <Link2 className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-zinc-100">Simpan referensi</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">Hubungkan setiap catatan keputusan ke dokumen terkait seperti Notion, Linear, Figma, atau Google Docs.</p>
                  </div>
                </div>
              </aside>
            </div>

            <section id="cara-kerja" className="mt-20 border-t border-white/[0.08] pt-12">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400">ALUR SEDERHANA</span>
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                {[
                  { n: "01", title: "Tulis keputusan", text: "Catat hasil keputusan, latar belakang konteks, penanggung jawab, dan tanggal berlaku." },
                  { n: "02", title: "Tambahkan alasan & referensi", text: "Simpan pertimbangan mendalam dan tautan sumber yang membantu menjelaskan pilihan tim." },
                  { n: "03", title: "Cari kembali secara instan", text: "Gunakan pencarian kata kunci dan filter presisi untuk menemukan riwayat keputusan kapan pun dibutuhkan." },
                ].map((step) => (
                  <div key={step.n} className="rounded-2xl border border-white/[0.06] bg-[#141620]/70 p-5 backdrop-blur-sm">
                    <span className="font-mono text-xs font-bold text-amber-400">{step.n}</span>
                    <h2 className="mt-3 text-base font-bold text-zinc-100">{step.title}</h2>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{step.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>
      );
    }
