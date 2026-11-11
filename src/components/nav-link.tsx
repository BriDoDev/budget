"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  children: ReactNode;
  /** Match only the exact path instead of any path below it. */
  exact?: boolean;
  className?: string;
}

/** Sidebar link that highlights itself when it points at the current page. */
export function NavLink({ href, children, exact = false, className = "" }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
        isActive
          ? "bg-neutral-200 font-medium dark:bg-neutral-800"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
