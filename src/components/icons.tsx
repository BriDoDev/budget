import type { ReactNode } from "react";

/** Stroke icons drawn on a 24px grid. They are decorative: the text next to them carries the meaning. */
const ICON_PATHS = {
  budget: (
    <>
      <path d="M3 7h18v12H3z" />
      <path d="M3 7l2-3h14l2 3" />
      <path d="M16 13h2" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <path d="M7.5 8.5h.01" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-7 9 7v9H3z" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  swap: <path d="M7 7h13l-3-3M17 17H4l3 3" />,
  alert: (
    <>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  card: <path d="M3 6h18v12H3zM3 10h18" />,
  spinner: <path d="M12 3a9 9 0 109 9" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICON_PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
