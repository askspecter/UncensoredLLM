"use client";
import { useState } from "react";
import { useAuth } from "./Providers";

export default function AuthButton() {
  const { ready, authenticated, label, login, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!ready) return <span className="btn btn-ghost text-sm opacity-50">…</span>;
  if (!authenticated) return <button onClick={login} className="btn btn-primary text-sm">Sign in</button>;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="btn btn-ghost text-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-moss" />
        <span className="max-w-[9rem] truncate">{label}</span>
      </button>
      {open && (
        <div className="card absolute right-0 mt-2 w-44 p-1 text-sm" onMouseLeave={() => setOpen(false)}>
          <a href="/dashboard" className="block rounded-lg px-3 py-2 hover:bg-panel-2">Dashboard</a>
          <button onClick={() => { setOpen(false); logout(); }} className="block w-full rounded-lg px-3 py-2 text-left text-ember-soft hover:bg-panel-2">Sign out</button>
        </div>
      )}
    </div>
  );
}
