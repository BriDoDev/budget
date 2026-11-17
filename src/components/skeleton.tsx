import type { ReactNode } from "react";
import { cardClass } from "./ui";

const ROW_WIDTHS = ["w-32", "w-44", "w-28", "w-40", "w-36", "w-48"];
const SURFACE_CLASS = "overflow-hidden rounded-[14px] border border-line bg-surface";

/** Placeholder block that pulses while the real content loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-track motion-reduce:animate-none ${className}`} />;
}

/** Wraps a group of placeholders and tells assistive technology what is loading. */
function SkeletonRegion({ label, className = "contents", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={label} className={className}>
      {children}
    </div>
  );
}

function times<T>(count: number, render: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => render(index));
}

/** A line with a name on the left and an amount on the right, the shape most rows share. */
function SkeletonRow({ index, hasDetail = false, className = "" }: { index: number; hasDetail?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-3 border-t border-hairline px-4 ${className}`}>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className={`h-3.5 max-w-full ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} />
        {hasDetail ? <Skeleton className="h-2.5 w-24" /> : null}
      </span>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

function SkeletonGroup({ rows, offset = 0, rowClassName = "min-h-15 py-2" }: { rows: number; offset?: number; rowClassName?: string }) {
  return (
    <div className={SURFACE_CLASS}>
      <div className="flex justify-between bg-subtle px-4 py-2.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      {times(rows, (index) => (
        <SkeletonRow key={index} index={index + offset} hasDetail className={rowClassName} />
      ))}
    </div>
  );
}

export function BudgetSkeleton() {
  return (
    <SkeletonRegion label="Calculando el mes…">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 max-md:w-full">
          <Skeleton className="h-9 w-44 max-md:hidden" />
          <Skeleton className="h-11 w-56 rounded-[10px] max-md:w-full" />
        </div>
        <Skeleton className="h-11 w-36 rounded-[10px]" />
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-[116px] flex-[1.3_1_240px] rounded-[14px]" />
        <Skeleton className="hidden h-[116px] flex-[1_1_200px] rounded-[14px] sm:block" />
        <Skeleton className="hidden h-[116px] flex-[1_1_200px] rounded-[14px] sm:block" />
        <Skeleton className="h-[116px] flex-[1.3_1_240px] rounded-[14px] max-md:h-14" />
      </div>
      <div className={SURFACE_CLASS}>
        {times(2, (group) => (
          <div key={group}>
            <div className="flex justify-between border-t border-line bg-subtle px-4 py-2.5 first:border-t-0">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            {times(5, (index) => (
              <div key={index} className="flex items-center gap-3 border-t border-hairline px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className={`h-3.5 max-w-full ${ROW_WIDTHS[(index + group) % ROW_WIDTHS.length]}`} />
                  <Skeleton className="h-1.5 w-full max-w-64 rounded-full" />
                </span>
                <Skeleton className="hidden h-11 w-28 rounded-lg sm:block" />
                <Skeleton className="hidden h-4 w-16 sm:block" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Movements of one account, or of all of them on a wide screen. */
export function RegisterSkeleton({ isAccountsHome = false }: { isAccountsHome?: boolean }) {
  return (
    <SkeletonRegion label="Cargando movimientos…">
      {isAccountsHome ? <AccountsOverviewSkeleton /> : null}
      <div className={isAccountsHome ? "hidden flex-col gap-5 md:flex" : "flex flex-col gap-5"}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-52" />
          </div>
          <Skeleton className="h-11 w-44 rounded-[10px] max-md:hidden" />
        </div>
        <Skeleton className="h-[76px] rounded-[14px] max-md:h-[104px]" />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-11 min-w-60 flex-1 rounded-[10px]" />
          <Skeleton className="h-11 w-72 max-w-full rounded-[10px]" />
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          <SkeletonGroup rows={3} />
          <SkeletonGroup rows={4} offset={2} />
        </div>
        <div className={`${SURFACE_CLASS} hidden md:block`}>
          <div className="flex gap-6 px-4 py-3.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
          {times(9, (index) => (
            <div key={index} className="flex items-center gap-6 border-t border-hairline px-4 py-4">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className={`h-3.5 ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} />
              <Skeleton className="h-3.5 w-32" />
              <span className="flex-1" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Phone-only summary of every account. */
function AccountsOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-[70px] rounded-[14px]" />
        <Skeleton className="h-[70px] rounded-[14px]" />
      </div>
      <SkeletonGroup rows={2} rowClassName="min-h-16 py-2" />
      <SkeletonGroup rows={2} offset={3} rowClassName="min-h-24 py-2" />
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <SkeletonRegion label="Calculando reportes…">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-[46px] w-72 max-w-full rounded-[10px]" />
      </div>
      <div className="flex flex-wrap gap-4">
        {times(4, (index) => (
          <Skeleton key={index} className="h-[74px] flex-[1_1_140px] rounded-[14px] sm:h-[86px] sm:flex-[1_1_200px]" />
        ))}
      </div>
      <div className="flex flex-wrap gap-5">
        {times(2, (card) => (
          <div key={card} className={`${cardClass} flex min-w-0 flex-[1_1_420px] flex-col gap-4`}>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-3 w-44" />
            </div>
            {times(6, (index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className={`h-5 ${ROW_WIDTHS[(index + card) % ROW_WIDTHS.length]}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Generic stack of cards with rows, for screens that are mostly lists and forms. */
export function ListSkeleton({ label, cards = 2, rows = 4 }: { label: string; cards?: number; rows?: number }) {
  return (
    <SkeletonRegion label={label}>
      {times(cards, (card) => (
        <div key={card} className={SURFACE_CLASS}>
          {times(rows, (index) => (
            <SkeletonRow key={index} index={index + card} className="min-h-14 py-3 first:border-t-0" />
          ))}
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function QuickFormSkeleton() {
  return (
    <SkeletonRegion label="Cargando…" className="flex flex-col gap-4">
      <div className="flex h-11 items-center justify-center">
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-[52px] rounded-[14px]" />
      <div className="flex flex-col items-center gap-3 py-4">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-[52px] w-40" />
      </div>
      <div className={SURFACE_CLASS}>
        {times(5, (index) => (
          <div key={index} className="flex min-h-15 items-center gap-3 border-t border-hairline px-3.5 py-2 first:border-t-0">
            <Skeleton className="size-5" />
            <span className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className={`h-3.5 ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} />
            </span>
          </div>
        ))}
      </div>
      <Skeleton className="h-14 rounded-2xl" />
    </SkeletonRegion>
  );
}

/** Sections and accounts, as the sidebar and the phone menu list them. */
export function SidebarSkeleton() {
  return (
    <SkeletonRegion label="Cargando cuentas…" className="flex flex-col gap-5 px-3.5 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <Skeleton className="size-8 rounded-[9px]" />
        <span className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-2.5 w-32" />
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {times(6, (index) => (
          <div key={index} className="flex min-h-11 items-center gap-2.5 px-3">
            <Skeleton className="size-[18px]" />
            <Skeleton className={`h-3.5 ${ROW_WIDTHS[index % ROW_WIDTHS.length]}`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between px-3 pb-1.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-2.5 w-14" />
        </div>
        {times(4, (index) => (
          <div key={index} className="flex min-h-11 items-center justify-between gap-3 px-3">
            <Skeleton className={`h-3.5 ${ROW_WIDTHS[(index + 2) % ROW_WIDTHS.length]}`} />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Empty bar that holds the place of the phone navigation until it renders. */
export function MobileNavSkeleton() {
  return <div aria-hidden="true" className="fixed inset-x-0 bottom-0 z-20 h-[68px] border-t border-line bg-surface md:hidden" />;
}
