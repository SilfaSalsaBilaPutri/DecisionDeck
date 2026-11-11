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
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card"><div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8"><Link to="/" className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Layers3 className="size-5" /></span><span className="text-lg font-semibold">DecisionDeck</span></Link></div></header>
      <div className="flex flex-1 items-start justify-center px-5 py-12 sm:items-center sm:py-16">
        <section className="w-full max-w-md">
          <div className="mb-8 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-md bg-secondary text-primary"><LockKeyhole className="size-5" /></span><h1 className="mt-5 text-2xl font-semibold">{mode === "login" ? "Selamat datang kembali" : "Buat akun DecisionDeck"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Catatan keputusan Anda bersifat pribadi dan hanya dapat diakses oleh akun ini.</p></div>
          <div className="mb-6 grid grid-cols-2 border-b">
            <button type="button" onClick={() => { setMode("login"); setMessage(""); setErrorMessage(""); }} className={`border-b-2 py-3 text-sm font-medium ${mode === "login" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Masuk</button>
            <button type="button" onClick={() => { setMode("signup"); setMessage(""); setErrorMessage(""); }} className={`border-b-2 py-3 text-sm font-medium ${mode === "signup" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Buat akun</button>
          </div>
          <form onSubmit={(event) => void submit(event)} className="space-y-5">
            {mode === "signup" ? <div className="space-y-2"><Label htmlFor="full-name">Nama</Label><Input id="full-name" autoComplete="name" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /></div> : null}
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="password">Kata sandi</Label><Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            {message ? <p role="status" className="text-sm leading-6 text-primary">{message}</p> : null}
            {errorMessage ? <p role="alert" className="text-sm leading-6 text-destructive">{errorMessage}</p> : null}
            <div className="flex space-x-2">
  <Button type="submit" className="flex-1" disabled={busy}>
    {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Buat akun"}
  </Button>
  {mode === "login" && (
    <Button type="button" variant="outline" className="flex-1" onClick={() => {
      localStorage.setItem("demo_mode", "true");
      localStorage.setItem("user", JSON.stringify({ email: "demo@decisiondeck.local" }));
      void navigate({ to: "/", replace: true });
    }} disabled={busy}>
      Demo Login
    </Button>
  )}
</div>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">Dengan {mode === "signup" ? "membuat akun" : "masuk"}, Anda menggunakan ruang catatan pribadi.</p>
        </section>
      </div>
    </main>
  );
}