import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Layers3, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk atau Buat Akun — DecisionDeck" },
      { name: "description", content: "Masuk atau buat akun DecisionDeck untuk menyimpan catatan keputusan pribadi." },
      { property: "og:title", content: "Masuk ke DecisionDeck" },
      { property: "og:description", content: "Akses catatan keputusan pribadi Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage("Pendaftaran berhasil. Periksa email Anda untuk konfirmasi sebelum masuk.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      await navigate({ to: "/", replace: true });
    } catch {
      setErrorMessage(mode === "signup" ? "Akun belum dapat dibuat. Periksa data dan coba lagi." : "Email atau kata sandi tidak cocok.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-[#0c0d12] text-zinc-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(245,158,11,0.12),transparent_70%)]" />

      <header className="relative z-10 border-b border-white/[0.08] bg-[#0c0d12]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-zinc-950 font-bold shadow-md shadow-amber-500/20">
              <Layers3 className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-zinc-100">
              Decision<span className="text-amber-400">Deck</span>
            </span>
          </Link>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 items-start justify-center px-5 py-12 sm:items-center sm:py-16">
        <section className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#141620]/90 p-7 shadow-2xl shadow-black/80 backdrop-blur-xl sm:p-9">
          <div className="mb-8 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
              <LockKeyhole className="size-5" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-100">
              {mode === "login" ? "Selamat datang kembali" : "Buat akun DecisionDeck"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Catatan keputusan Anda bersifat pribadi dan hanya dapat diakses oleh akun ini.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMessage("");
                setErrorMessage("");
              }}
              className={`border-b-2 py-3 text-sm font-semibold transition-all ${
                mode === "login"
                  ? "border-amber-400 text-amber-400 shadow-[0_1px_0_0_#fbbf24]"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setMessage("");
                setErrorMessage("");
              }}
              className={`border-b-2 py-3 text-sm font-semibold transition-all ${
                mode === "signup"
                  ? "border-amber-400 text-amber-400 shadow-[0_1px_0_0_#fbbf24]"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Buat akun
            </button>
          </div>

          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="full-name" className="text-xs font-medium text-zinc-300">Nama Lengkap</Label>
                <Input
                  id="full-name"
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="h-11 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                  placeholder="Nama Anda"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium text-zinc-300">Alamat Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                placeholder="nama@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium text-zinc-300">Kata Sandi</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 rounded-xl border-white/10 bg-[#0c0d14] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                placeholder="Minimal 8 karakter"
              />
            </div>

            {message ? (
              <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-300">
                {message}
              </p>
            ) : null}

            {errorMessage ? (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm leading-6 text-red-300">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex gap-2.5 pt-2">
              <Button
                type="submit"
                className="h-11 flex-1 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 font-bold text-zinc-950 shadow-lg shadow-amber-500/20 transition-all hover:brightness-105 active:scale-[0.98]"
                disabled={busy}
              >
                {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Buat akun"}
              </Button>
              {mode === "login" && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 rounded-xl border border-amber-500/30 bg-amber-500/10 font-semibold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all hover:bg-amber-500/20 hover:text-amber-200 active:scale-[0.98]"
                  onClick={() => {
                    localStorage.setItem("demo_mode", "true");
                    localStorage.setItem("user", JSON.stringify({ email: "demo@decisiondeck.local" }));
                    void navigate({ to: "/", replace: true });
                  }}
                  disabled={busy}
                >
                  Demo Login
                </Button>
              )}
            </div>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-zinc-500">
            Dengan {mode === "signup" ? "membuat akun" : "masuk"}, Anda menggunakan ruang catatan pribadi.
          </p>
        </section>
      </div>
    </main>
  );
}