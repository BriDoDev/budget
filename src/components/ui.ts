/** Shared Tailwind class strings so forms, tables and cards look the same across screens. */

export const inputClass =
  "w-full min-h-11 rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none focus:border-accent";

export const labelClass = "flex flex-col gap-1.5 text-xs font-semibold text-muted";

export const primaryButtonClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-60";

export const linkButtonClass =
  "cursor-pointer text-sm font-medium text-muted underline underline-offset-4 hover:text-ink disabled:opacity-60";

export const cardClass = "rounded-[14px] border border-line bg-surface p-5";

/** Detail panel of the budget: a side card on wide screens, a bottom sheet on phones. */
export const detailPanelClass = `${cardClass} flex flex-[1_1_300px] scroll-mt-4 flex-col gap-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:max-h-[88dvh] max-md:overflow-y-auto max-md:rounded-t-[22px] max-md:rounded-b-none max-md:border-0 max-md:pt-2.5 max-md:pb-8 max-md:shadow-2xl`;

export const detailBackdropClass = "fixed inset-0 z-30 bg-ink/45 md:hidden";

export const mutedTextClass = "text-sm text-muted";

export const tableHeaderClass = "border-b border-line text-left text-xs font-semibold text-muted";

/** Page container; the bottom padding clears the fixed navigation bar on phones. */
export const pageClass = "mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-6 pb-28 sm:px-8 sm:pt-7 md:pb-8";

export const headingClass = "font-display text-[28px] leading-tight font-semibold";

export const sectionTitleClass = "font-display text-lg font-semibold";

export const eyebrowClass = "text-xs font-semibold tracking-wide text-muted uppercase";

export const statValueClass = "font-display text-2xl font-semibold tabular-nums";

const pillClass = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold tabular-nums";

/** Money available to spend. */
export const pillPositiveClass = `${pillClass} bg-accent-soft text-accent-strong`;
/** Nothing left, nothing owed. */
export const pillNeutralClass = `${pillClass} bg-neutral-soft text-ink-soft`;
/** Overspent or otherwise needing attention. */
export const pillWarnClass = `${pillClass} bg-warn-soft text-warn-ink`;
