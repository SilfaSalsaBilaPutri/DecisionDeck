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
import { deleteDecision, listDecisions, saveDecision, type DecisionLinkInput } from "@/lib/decisions.functions";

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
    title = lines[0].replace(/^[#\-*\d.]+\s*/, "").slice(0, 100);
  }
  if (!decision_text) {
    const decisionLine = lines.find((l) => /memutuskan|sepakat|setuju|akan menggunakan|dipilih|agreed|decided/i.test(l));
    if (decisionLine) {
      decision_text = decisionLine.replace(/^[#\-*\d.]+\s*/, "").trim();
    } else if (lines.length > 1) {
      decision_text = lines[1];
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

  // AI Summarizer states
  const [aiMode, setAiMode] = useState(false);
  const [rawNotes, setRawNotes] = useState("");
  const [aiDraftBanner, setAiDraftBanner] = useState(false);

  useEffect(() => {
    let active = true;

    // Check if in demo mode
    if (typeof window !== "undefined" && localStorage.getItem("demo_mode") === "true") {
      const stored = localStorage.getItem("user");
      let email = "demo@decisiondeck.local";
      try {
        if (stored) email = JSON.parse(stored).email || email;
      } catch {}
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
    setAiMode(false);
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

  function handleAiSummarize() {
    if (!rawNotes.trim()) {
      setFormError("Masukkan catatan teks terlebih dahulu untuk diringkas.");
      return;
    }
    const draft = parseNotesToDraft(rawNotes);
    setForm((current) => ({
      ...current,
      ...draft,
      links: current.links,
    }));
    setAiMode(false);
    setAiDraftBanner(true);
    setFormError("");
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
    return <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Memuat DecisionDeck…</main>;
  }

  if (!user) return <WelcomePage />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 text-foreground" aria-label="DecisionDeck beranda">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Layers3 className="size-5" /></span>
            <span className="text-lg font-semibold">DecisionDeck</span>
          </Link>
          <div className="flex items-center gap-3">
            {isDemo && (
              <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-900 font-medium text-xs">
                Mode Demo Lokal
              </Badge>
            )}
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Keluar">Keluar</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-primary">RUANG PRIBADI</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Keputusan Saya</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Catat apa yang diputuskan, siapa penanggung jawabnya, dan alasan di baliknya.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openCreate} className="gap-2"><Plus className="size-4" /> Buat Keputusan</Button>
          </div>
        </div>

        {isDemo && (
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 sm:text-sm">
            💡 <strong>Mode Demo Aktif:</strong> Seluruh data disimpan terisolasi di browser (LocalStorage). Anda dapat menguji CRUD, pencarian kata kunci, filter tag, ringkasan AI, dan tautan eksternal tanpa batas.
          </div>
        )}

        {formError && !formOpen ? <p role="alert" className="mt-5 text-sm text-destructive">{formError}</p> : null}

        {decisionsQuery.isLoading ? (
          <div className="mt-10 border-y py-12 text-center text-sm text-muted-foreground">Memuat keputusan…</div>
        ) : decisionsQuery.isError ? (
          <div className="mt-10 border-y py-12 text-center" role="alert">
            <p className="font-medium">Daftar keputusan belum dapat dimuat.</p>
            <Button variant="outline" className="mt-4" onClick={() => void decisionsQuery.refetch()}>Coba lagi</Button>
          </div>
        ) : decisions.length === 0 ? (
          <div className="mt-10 border-y py-16 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-md bg-secondary text-primary"><FileText className="size-6" /></span>
            <h2 className="mt-5 text-xl font-semibold">Mulai catat keputusan pertama</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Simpan hasil diskusi dan alasannya agar mudah ditemukan kembali nanti.</p>
            <Button onClick={openCreate} className="mt-6 gap-2"><Plus className="size-4" /> Buat Keputusan</Button>
          </div>
        ) : (
          <>
            <section aria-label="Cari dan saring keputusan" className="mt-9 border-y py-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(130px,1fr))]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Cari keputusan" placeholder="Cari judul, isi, alasan, atau tag…" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} className="pl-9 pr-9" />
                  {filters.query ? <button type="button" aria-label="Hapus kata pencarian" onClick={() => setFilters((current) => ({ ...current, query: "" }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-4" /></button> : null}
                </div>
                <Select value={filters.status || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, status: value === "all" ? "" : value }))}>
                  <SelectTrigger aria-label="Saring berdasarkan status"><ListFilter className="mr-2 size-4 text-muted-foreground" /><SelectValue placeholder="Semua status" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Semua status</SelectItem><SelectItem value="proposed">Diusulkan</SelectItem><SelectItem value="decided">Diputuskan</SelectItem><SelectItem value="superseded">Digantikan</SelectItem></SelectContent>
                </Select>
                <Select value={filters.tag || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, tag: value === "all" ? "" : value }))}>
                  <SelectTrigger aria-label="Saring berdasarkan tag"><SlidersHorizontal className="mr-2 size-4 text-muted-foreground" /><SelectValue placeholder="Semua tag" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Semua tag</SelectItem>{allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}</SelectContent>
                </Select>
                <Input aria-label="Saring berdasarkan penanggung jawab" placeholder="Penanggung jawab" value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))} />
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" /><span>Tanggal keputusan</span></div>
                <Input aria-label="Tanggal mulai" type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} className="sm:max-w-44" />
                <span className="hidden text-muted-foreground sm:inline">hingga</span>
                <Input aria-label="Tanggal akhir" type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} className="sm:max-w-44" />
                <Button variant="ghost" size="sm" className="sm:ml-auto" onClick={() => setFilters(defaultFilters)}>Atur ulang</Button>
              </div>
            </section>

            <div className="flex items-center justify-between gap-4 py-5">
              <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{visibleDecisions.length}</span> dari {decisions.length} keputusan</p>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><LockKeyhole className="size-3.5" /> Hanya terlihat oleh Anda</span>
            </div>

            {visibleDecisions.length ? (
              <div className="divide-y border-y">
                {visibleDecisions.map((decision) => (
                  <article key={decision.id} className="group grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <button type="button" className="min-w-0 text-left" onClick={() => setSelected(decision)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-lg font-semibold group-hover:text-primary">{decision.title}</h2>
                        <Badge variant="outline" className="shrink-0 font-medium">{statusLabel(decision.status)}</Badge>
                        {decision.creation_method === "ai_summarized" && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Sparkles className="size-3 text-amber-500" /> Ringkas AI
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{decision.decision_text || decision.context || decision.rationale || "Belum ada ringkasan isi."}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span>{decision.owner_name}</span><span>{formatDate(decision.decision_date)}</span>
                        {decision.tags.map((tag) => <span key={tag} className="rounded-sm bg-secondary px-2 py-1 text-secondary-foreground">{tag}</span>)}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 self-start sm:self-center">
                      <Button variant="ghost" size="icon" aria-label={`Ubah ${decision.title}`} title="Ubah" onClick={() => openEdit(decision)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Hapus ${decision.title}`} title="Hapus" onClick={() => setDeleteTarget(decision)}><Trash2 className="size-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Lihat ${decision.title}`} title="Lihat detail" onClick={() => setSelected(decision)}><ArrowUpRight className="size-4" /></Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="border-y py-12 text-center">
                <h2 className="font-semibold">Tidak ada keputusan yang cocok</h2>
                <p className="mt-2 text-sm text-muted-foreground">Coba kata kunci atau saringan yang berbeda.</p>
                <Button variant="outline" className="mt-4" onClick={() => setFilters(defaultFilters)}>Hapus pencarian dan saringan</Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Dialog Form Create / Edit Decision */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editing ? "Ubah keputusan" : "Buat keputusan"}</DialogTitle>
              {!editing && (
                <Button
                  type="button"
                  variant={aiMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setAiMode(!aiMode)}
                  className="gap-1.5 text-xs"
                >
                  <Sparkles className="size-3.5 text-primary" />
                  {aiMode ? "Beralih ke Form Manual" : "Ringkas dari Catatan (AI)"}
                </Button>
              )}
            </div>
            <DialogDescription>
              {aiMode
                ? "Tempel catatan rapat atau diskusi (hingga 10.000 karakter) untuk menghasilkan draf otomatis."
                : "Catat hasil diskusi dan alasan yang ingin Anda ingat."}
            </DialogDescription>
          </DialogHeader>

          {aiMode ? (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-raw-notes">Catatan Mentah / Notula Rapat</Label>
                  <span className="text-xs text-muted-foreground">{rawNotes.length.toLocaleString("id-ID")} / 10.000 karakter</span>
                </div>
                <Textarea
                  id="ai-raw-notes"
                  maxLength={10000}
                  rows={8}
                  placeholder="Tempel catatan rapat, diskusi chat, atau draf keputusan di sini..."
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setAiMode(false)}>
                  Batal
                </Button>
                <Button type="button" onClick={handleAiSummarize} disabled={!rawNotes.trim()} className="gap-2">
                  <Sparkles className="size-4" /> Hasilkan Draf Keputusan
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={(event) => void submitDecision(event)} className="space-y-5">
              {aiDraftBanner && (
                <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary shrink-0" />
                    <span>Draf keputusan berhasil dibuat dari catatan. Anda dapat meninjau dan melengkapinya sebelum disimpan.</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setForm(blankForm());
                      setAiDraftBanner(false);
                    }}
                  >
                    Tolak draf
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="decision-title">Judul</Label>
                <Input id="decision-title" autoFocus required maxLength={180} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Contoh: Fokus pada paket tahunan" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decision-context">Konteks</Label>
                <Textarea id="decision-context" value={form.context} onChange={(event) => setForm((current) => ({ ...current, context: event.target.value }))} placeholder="Apa yang memicu pembahasan ini?" rows={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decision-text">Keputusan</Label>
                <Textarea id="decision-text" value={form.decision_text} onChange={(event) => setForm((current) => ({ ...current, decision_text: event.target.value }))} placeholder="Apa yang diputuskan?" rows={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decision-rationale">Alasan</Label>
                <Textarea id="decision-rationale" value={form.rationale} onChange={(event) => setForm((current) => ({ ...current, rationale: event.target.value }))} placeholder="Mengapa pilihan ini diambil?" rows={3} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="decision-owner">Penanggung jawab</Label>
                  <Input id="decision-owner" required value={form.owner_name} onChange={(event) => setForm((current) => ({ ...current, owner_name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decision-date">Tanggal</Label>
                  <Input id="decision-date" type="date" required value={form.decision_date} onChange={(event) => setForm((current) => ({ ...current, decision_date: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(value: DecisionStatus) => setForm((current) => ({ ...current, status: value }))}>
                    <SelectTrigger aria-label="Status keputusan"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proposed">Diusulkan</SelectItem>
                      <SelectItem value="decided">Diputuskan</SelectItem>
                      <SelectItem value="superseded">Digantikan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.status !== "proposed" && !form.decision_text.trim() ? (
                <p className="text-xs text-muted-foreground">Isi keputusan diperlukan untuk status ini.</p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="decision-tags">Tag</Label>
                <Input id="decision-tags" value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Produk, Prioritas (pisahkan dengan koma)" />
              </div>

              <div className="space-y-3">
                <Label>Tautan referensi</Label>
                {form.links.map((link, index) => (
                  <div key={`${link.url}-${index}`} className="flex min-w-0 items-center gap-2 text-sm">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{link.label || link.url}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Hapus tautan ${link.label || index + 1}`}
                      onClick={() => setForm((current) => ({ ...current, links: current.links.filter((_, itemIndex) => itemIndex !== index) }))}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <Input aria-label="Nama tautan" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} placeholder="Nama tautan (mis. Notion, Linear)" />
                  <Input aria-label="Alamat tautan" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" />
                  <Button type="button" variant="outline" onClick={addLink}>Tambah</Button>
                </div>
              </div>

              {form.source_notes ? (
                <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs">
                  <p className="font-medium text-muted-foreground">Sumber Catatan Mentah (Tersimpan):</p>
                  <p className="line-clamp-2 italic text-muted-foreground">{form.source_notes}</p>
                </div>
              ) : null}

              {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
                <Button type="submit" disabled={saving} className="gap-2">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{statusLabel(selected.status)}</Badge>
                  <span className="text-sm text-muted-foreground">{formatDate(selected.decision_date)}</span>
                  {selected.creation_method === "ai_summarized" && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Sparkles className="size-3 text-amber-500" /> Diringkas AI
                    </Badge>
                  )}
                </div>
                <DialogTitle className="break-words pt-2 text-2xl">{selected.title}</DialogTitle>
                <DialogDescription>Penanggung jawab: {selected.owner_name}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-1">
                <DetailBlock title="Konteks" value={selected.context} />
                <DetailBlock title="Keputusan" value={selected.decision_text} />
                <DetailBlock title="Alasan" value={selected.rationale} />

                {selected.tags.length ? (
                  <div>
                    <h3 className="text-sm font-medium">Tag</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selected.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selected.links && Array.isArray(selected.links) && selected.links.length ? (
                  <div>
                    <h3 className="text-sm font-medium">Referensi & Tautan Eksternal</h3>
                    <ul className="mt-2 space-y-2">
                      {selected.links.map((link, index) => (
                        <li key={`${link.url}-${index}`}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-2 break-all text-sm text-primary underline-offset-4 hover:underline"
                          >
                            <Link2 className="size-4 shrink-0" />
                            {link.label || link.url}
                            <ArrowUpRight className="size-3.5 shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selected.source_notes ? (
                  <section className="rounded-md border bg-muted/40 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catatan Sumber Asli (AI Summarizer)</h3>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{selected.source_notes}</p>
                  </section>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => openEdit(selected)}>
                  <Pencil className="mr-2 size-4" /> Ubah
                </Button>
                <Button variant="destructive" onClick={() => setDeleteTarget(selected)}>
                  <Trash2 className="mr-2 size-4" /> Hapus
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Alert Dialog Delete Confirmation */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus keputusan ini?</AlertDialogTitle>
            <AlertDialogDescription>“{deleteTarget?.title}” akan dihapus permanen dari catatan pribadi Anda.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
    <section>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{value || "Belum diisi."}</p>
    </section>
  );
}

function WelcomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Layers3 className="size-5" /></span>
            <span className="text-lg font-semibold">DecisionDeck</span>
          </Link>
          <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">Masuk</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <section>
            <p className="text-sm font-medium text-primary">CATATAN KEPUTUSAN PRIBADI</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">Simpan keputusan. <span className="text-primary">Temukan kembali alasannya.</span></h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">Satu tempat untuk menyimpan hasil diskusi, konteks, dan alasan—agar keputusan penting tidak tenggelam di antara catatan.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="gap-2"><Link to="/auth">Mulai mencatat <ArrowRight className="size-4" /></Link></Button>
              <a href="#cara-kerja" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent">Lihat cara kerjanya <ChevronDown className="size-4" /></a>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-4" /> Catatan hanya dapat dilihat oleh akun Anda.</p>
          </section>
          <aside className="border-y py-6 lg:border-l lg:border-y-0 lg:pl-8">
            <div className="flex items-start gap-4 border-b pb-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><FileText className="size-5" /></span>
              <div><h2 className="font-semibold">Catat konteksnya</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Simpan keputusan, latar belakang, dan alasan dalam satu catatan.</p></div>
            </div>
            <div className="flex items-start gap-4 border-b py-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><Search className="size-5" /></span>
              <div><h2 className="font-semibold">Temukan saat dibutuhkan</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Cari berdasarkan kata kunci, status, tag, penanggung jawab, atau tanggal.</p></div>
            </div>
            <div className="flex items-start gap-4 pt-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><Link2 className="size-5" /></span>
              <div><h2 className="font-semibold">Simpan referensi</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Hubungkan catatan ke dokumen dan sumber terkait.</p></div>
            </div>
          </aside>
        </div>
        <section id="cara-kerja" className="mt-16 border-t pt-8 sm:mt-20">
          <p className="text-sm font-medium text-primary">ALUR SEDERHANA</p>
          <div className="mt-5 grid gap-6 md:grid-cols-3">
            {[
              { n: "01", title: "Tulis keputusan", text: "Catat hasil, konteks, penanggung jawab, dan tanggal." },
              { n: "02", title: "Tambahkan alasan", text: "Simpan pertimbangan dan tautan yang membantu menjelaskan pilihan." },
              { n: "03", title: "Cari kembali", text: "Gunakan pencarian dan saringan untuk menemukan catatan lama." },
            ].map((step) => (
              <div key={step.n} className="border-t pt-4">
                <span className="text-xs font-semibold text-primary">{step.n}</span>
                <h2 className="mt-3 font-semibold">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
