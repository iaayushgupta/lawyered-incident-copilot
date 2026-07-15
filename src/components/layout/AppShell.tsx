"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Scale,
  BarChart3,
  AlertTriangle,
  PlayCircle,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useStore, USERS } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/types";
import { FLEETS } from "@/lib/data/master";
import { Toasts } from "./Toasts";

const NAV = [
  { href: "/", label: "Command Center", icon: LayoutDashboard, exact: true },
  { href: "/incidents", label: "Live Incidents", icon: ListChecks },
  { href: "/lawyers", label: "Lawyer Network", icon: Scale },
  { href: "/evaluation", label: "Evaluation", icon: BarChart3 },
  { href: "/evaluation/failures", label: "Failure Explorer", icon: AlertTriangle },
  { href: "/demo", label: "Demo Mode", icon: PlayCircle },
  { href: "/audit", label: "Audit & Observability", icon: ShieldCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[228px] flex-col bg-navy text-white">
        <div className="px-7 pb-6 pt-7">
          <div className="text-xl font-extrabold tracking-tight">LAWYERED</div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-500">
            AI Legal Ops
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href) && (item.href !== "/" );
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active ? "bg-navy-700 font-semibold text-white" : "text-slate-300 hover:bg-navy-700/60 hover:text-white",
                )}
              >
                <Icon size={17} strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-7 pb-6 pt-4 text-[11px] text-slate-500">
          <div className="mb-1 font-semibold text-slate-400">Concept prototype</div>
          Synthetic data · Not legal advice
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col pl-[228px]">
        <TopBar />
        <main className="flex-1 px-8 py-6">{children}</main>
        <footer className="border-t border-line px-8 py-3 text-xs text-ink-faint">
          This prototype uses synthetic data and synthetic legal sources. It does not provide legal advice and must not be
          used for real legal decisions.
        </footer>
      </div>

      <Toasts />
    </div>
  );
}

function TopBar() {
  const currentUserId = useStore((s) => s.currentUserId);
  const setUser = useStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const user = USERS.find((u) => u.id === currentUserId) ?? USERS[0];
  const fleet = FLEETS.find((f) => f.id === user.fleetId);
  const scope = user.fleetId === "*" ? "All fleets (cross-tenant)" : `${fleet?.name ?? "—"} only`;

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-canvas/85 px-8 py-3 backdrop-blur">
      <div className="flex items-center gap-2 text-xs">
        <span className="pill bg-amber-50 text-amber-700 border border-amber-200">
          Prototype · synthetic data · not legal advice
        </span>
        <span className="hidden text-ink-faint md:inline">Tenant scope: {scope}</span>
      </div>

      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-card hover:bg-slate-50"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">
            {user.name.slice(0, 1)}
          </span>
          <span className="hidden sm:inline">{user.name.replace(/\s*\(.+\)/, "")}</span>
          <span className="pill bg-slate-100 text-slate-600">{ROLE_LABEL[user.role]}</span>
          <ChevronDown size={15} className="text-ink-faint" />
        </button>
        {open && (
          <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-line bg-white p-2 shadow-pop">
            <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Switch role (RBAC demo)
            </div>
            {USERS.map((u) => {
              const f = FLEETS.find((x) => x.id === u.fleetId);
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    setUser(u.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50",
                    u.id === currentUserId && "bg-slate-100",
                  )}
                >
                  <span>
                    <span className="font-medium text-ink">{u.name.replace(/\s*\(.+\)/, "")}</span>
                    <span className="block text-xs text-ink-faint">
                      {ROLE_LABEL[u.role]} · {u.fleetId === "*" ? "all fleets" : f?.name}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
