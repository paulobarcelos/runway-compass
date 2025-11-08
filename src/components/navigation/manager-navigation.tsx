"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  badge?: string;
};

const DEFAULT_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/managers/categories", label: "Categories" },
  { href: "/managers/accounts", label: "Accounts" },
  { href: "/managers/budget-plan", label: "Budget Plan" },
  { href: "/managers/ledger", label: "Ledger" },
  { href: "/managers/runway", label: "Runway", badge: "Soon" },
];

export function ManagerNavigation({ items = DEFAULT_ITEMS }: { items?: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="overflow-x-auto">
      <ul className="flex flex-wrap gap-3 rounded-2xl border border-zinc-200/70 bg-white/70 p-2 text-sm shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/60">
        {items.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-medium transition ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-sm shadow-zinc-900/20 dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                }`}
              >
                {item.label}
                {item.badge ? (
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
