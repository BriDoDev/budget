"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

/**
 * Link that draws a progress bar across the top of the screen while its
 * navigation is still loading, so a tap never looks ignored.
 */
export default function AppLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <NavigationProgress />
    </Link>
  );
}

function NavigationProgress() {
  const { pending } = useLinkStatus();
  if (!pending) {
    return null;
  }
  // Fixed to the viewport, so it takes no room inside the link.
  return (
    <span aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 block h-[3px] overflow-hidden">
      <span className="block h-full w-1/3 animate-navigation-progress rounded-full bg-accent motion-reduce:w-full motion-reduce:animate-none" />
    </span>
  );
}
