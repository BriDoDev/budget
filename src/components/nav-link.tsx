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
  /** Classes for the current page; defaults to the sidebar highlight. */
  activeClassName?: string;
  inactiveClassName?: string;
}

/** Navigation link that highlights itself when it points at the current page. */
export function NavLink({
  href,
  children,
  exact = false,
  className = "flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
  activeClassName = "bg-accent-soft font-semibold text-accent",
  inactiveClassName = "font-medium text-ink-soft hover:bg-subtle hover:text-ink",
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`${className} ${isActive ? activeClassName : inactiveClassName}`}
    >
      {children}
    </Link>
  );
}
