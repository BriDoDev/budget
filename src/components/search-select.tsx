"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./icons";
import { inputClass } from "./ui";

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Secondary text on the right, such as what a category has left. */
  hint?: string;
  disabled?: boolean;
}

export interface SearchSelectGroup {
  /** Heading of the group; omit it for options that stand on their own. */
  label?: string;
  options: SearchSelectOption[];
}

interface SearchSelectProps {
  /** Name of the form field that carries the chosen value. */
  name?: string;
  groups: SearchSelectGroup[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** What is being chosen; names the field and heads the picker. */
  label: string;
  disabled?: boolean;
  /** Classes of the button that shows the current choice. */
  className?: string;
}

/** Lowercase without accents, so "telefono" finds "Teléfono". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Select you can type in to narrow the list. It fills the screen on phones,
 * where the keyboard would cover a dropdown, and drops under the field on wide screens.
 */
export function SearchSelect({
  name,
  groups,
  value,
  defaultValue = "",
  onValueChange,
  label,
  disabled = false,
  className = `${inputClass} flex items-center justify-between gap-2 text-left`,
}: SearchSelectProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [ownValue, setOwnValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedValue = value ?? ownValue;
  const selected = groups.flatMap((group) => group.options).find((option) => option.value === selectedValue);

  const visibleGroups = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        options: normalize(group.label ?? "").includes(needle)
          ? group.options
          : group.options.filter((option) => normalize(option.label).includes(needle)),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);
  const visibleOptions = visibleGroups.flatMap((group) => group.options).filter((option) => !option.disabled);

  const open = () => {
    setQuery("");
    setActiveIndex(Math.max(0, visibleOptions.findIndex((option) => option.value === selectedValue)));
    setIsOpen(true);
  };
  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };
  const choose = (option: SearchSelectOption) => {
    setOwnValue(option.value);
    onValueChange?.(option.value);
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => Math.min(visibleOptions.length - 1, Math.max(0, current + step)));
    } else if (event.key === "Enter") {
      // Never submit the surrounding form from the search box.
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) {
        choose(option);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const activeValue = visibleOptions[activeIndex]?.value;

  return (
    <span className="relative block min-w-0">
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${label}: ${selected?.label ?? "sin elegir"}`}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        className={`${className} cursor-pointer disabled:cursor-default disabled:opacity-60`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? "Elegir…"}</span>
        <Icon name="chevronDown" size={16} className="text-muted" />
      </button>

      {isOpen ? (
        <>
          <span aria-hidden="true" onClick={close} className="fixed inset-0 z-40 max-md:bg-ink/45" />
          <span
            role="dialog"
            aria-label={label}
            className="z-50 flex flex-col overflow-hidden bg-surface text-sm font-normal text-ink shadow-2xl max-md:fixed max-md:inset-0 md:absolute md:top-full md:left-0 md:mt-1 md:max-h-80 md:w-80 md:max-w-[calc(100vw-2rem)] md:rounded-xl md:border md:border-line"
          >
            <span className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Icon name="search" className="text-muted" />
              <input
                autoFocus
                role="combobox"
                aria-controls={listId}
                aria-expanded="true"
                aria-activedescendant={activeValue === undefined ? undefined : `${listId}-${activeValue}`}
                aria-label={`Buscar ${label.toLowerCase()}`}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={`Buscar ${label.toLowerCase()}`}
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
              <button type="button" onClick={close} className="min-h-11 cursor-pointer px-2 font-medium text-accent md:hidden">
                Cancelar
              </button>
            </span>
            <span id={listId} role="listbox" aria-label={label} className="flex flex-1 flex-col overflow-y-auto overscroll-contain pb-4 md:pb-1">
              {visibleGroups.length === 0 ? <span className="px-4 py-6 text-center text-muted">Nada coincide con “{query}”.</span> : null}
              {visibleGroups.map((group, groupIndex) => (
                <span key={group.label ?? groupIndex} role="group" aria-label={group.label} className="flex flex-col">
                  {group.label ? (
                    <span className="sticky top-0 bg-subtle px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{group.label}</span>
                  ) : null}
                  {group.options.map((option) => {
                    const isSelected = option.value === selectedValue;
                    return (
                      <button
                        key={option.value}
                        id={`${listId}-${option.value}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={option.disabled}
                        onClick={() => choose(option)}
                        className={`flex min-h-12 cursor-pointer items-center gap-3 border-t border-hairline px-4 py-2 text-left disabled:cursor-default disabled:opacity-50 md:min-h-10 ${
                          option.value === activeValue ? "bg-accent-soft" : "hover:bg-subtle"
                        } ${isSelected ? "font-semibold text-accent-strong" : ""}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {option.hint ? <span className="shrink-0 text-xs font-normal text-muted tabular-nums">{option.hint}</span> : null}
                        {isSelected ? <Icon name="check" size={16} /> : null}
                      </button>
                    );
                  })}
                </span>
              ))}
            </span>
          </span>
        </>
      ) : null}
    </span>
  );
}
