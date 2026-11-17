"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useOptimistic, useTransition, type MouseEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { detailBackdropClass, detailPanelClass, eyebrowClass } from "@/components/ui";

interface Selection {
  /** Category the person asked for, ahead of the server when a tap is still loading. */
  selectedId: string;
  select: (categoryId: string, href: string) => void;
}

const SelectionContext = createContext<Selection | null>(null);

/**
 * Tracks which category is open. A tap updates it at once and the server
 * catches up afterwards, so the detail opens and closes without waiting.
 */
export function CategorySelection({ selectedId, children }: { selectedId: string; children: ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticId, setOptimisticId] = useOptimistic(selectedId);

  const select = (categoryId: string, href: string) => {
    startTransition(() => {
      setOptimisticId(categoryId);
      router.push(href, { scroll: false });
    });
  };

  return <SelectionContext value={{ selectedId: optimisticId, select }}>{children}</SelectionContext>;
}

function useSelection(): Selection {
  const selection = use(SelectionContext);
  if (!selection) {
    throw new Error("Category links must be rendered inside CategorySelection.");
  }
  return selection;
}

interface CategoryLinkProps {
  /** Category to open, or an empty string to close the detail. */
  categoryId: string;
  href: string;
  children?: ReactNode;
  className?: string;
  /** Extra classes while this link's category is the open one. */
  selectedClassName?: string;
  "aria-label"?: string;
}

/** Link that opens (or closes) the category detail immediately. */
export function CategoryLink({ categoryId, href, children, className = "", selectedClassName = "", ...rest }: CategoryLinkProps) {
  const { selectedId, select } = useSelection();
  const isSelected = categoryId !== "" && categoryId === selectedId;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Leave new-tab and similar gestures to the browser.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    select(categoryId, href);
  };

  return (
    <a href={href} onClick={handleClick} aria-current={isSelected ? "true" : undefined} className={`${className} ${isSelected ? selectedClassName : ""}`} {...rest}>
      {children}
    </a>
  );
}

export interface CategoryPreview {
  name: string;
  groupName: string;
  caption: string;
  isWarning: boolean;
}

interface CategoryDetailSlotProps {
  /** Category the server rendered `children` for; empty when there is none. */
  renderedId: string;
  closeHref: string;
  /** What is already known about each category, shown while its detail loads. */
  previews: Record<string, CategoryPreview>;
  /** Shown on wide screens when no category is open. */
  placeholder: ReactNode;
  children: ReactNode;
}

/** Shows the detail the server sent, or a stand-in while the one just asked for is on its way. */
export function CategoryDetailSlot({ renderedId, closeHref, previews, placeholder, children }: CategoryDetailSlotProps) {
  const { selectedId } = useSelection();

  if (selectedId === renderedId) {
    return renderedId ? children : placeholder;
  }
  const preview = previews[selectedId];
  if (!preview) {
    return placeholder;
  }

  return (
    <>
      <CategoryLink categoryId="" href={closeHref} aria-label="Cerrar detalle" className={detailBackdropClass} />
      <aside id="detalle" aria-label={`Detalle de ${preview.name}`} aria-busy="true" className={detailPanelClass}>
        <span aria-hidden="true" className="h-1 w-10 shrink-0 self-center rounded-full bg-line-strong md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={eyebrowClass}>{preview.groupName}</span>
            <h2 className="font-display text-[22px] font-semibold">{preview.name}</h2>
            {preview.caption ? <span className={`text-sm ${preview.isWarning ? "text-warn-ink" : "text-muted"}`}>{preview.caption}</span> : null}
          </div>
          <CategoryLink
            categoryId=""
            href={closeHref}
            aria-label="Cerrar detalle"
            className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle md:hidden"
          >
            <Icon name="close" size={20} />
          </CategoryLink>
        </div>
        <Skeleton className="h-24 rounded-[10px]" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-32 rounded-[14px]" />
      </aside>
    </>
  );
}
