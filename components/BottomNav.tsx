"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/explore", label: "Explore", icon: "🔎" },
  { href: "/post", label: "Post", icon: "＋", fab: true },
  { href: "/work", label: "Work", icon: "💼" },
  { href: "/me", label: "Me", icon: "🙂" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          if (t.fab) {
            return (
              <li key={t.href} className="flex justify-center">
                <Link
                  href={t.href}
                  aria-label="Post a bounty"
                  className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-white shadow-lg active:scale-95"
                >
                  {t.icon}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-touch flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${active ? "text-primary" : "text-slate2"}`}
              >
                <span className="text-xl" aria-hidden>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
