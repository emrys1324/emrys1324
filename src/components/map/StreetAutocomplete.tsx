"use client";
import { useEffect, useRef, useState } from "react";
import { suggestAddresses, type Suggestion } from "@/lib/address-lookup";

/** Street input; with Google Maps on it suggests addresses as you type (plain input otherwise). */
export function StreetAutocomplete({
  id,
  value,
  onChange,
  onPick,
  enabled,
  placeholder,
  className = "input",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (s: Suggestion) => void;
  enabled: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false); // only look up what the customer typed, not prefilled text
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !typed.current) return;
    const q = value.trim();
    if (q.length < 3) {
      setItems([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => {
      suggestAddresses(q)
        .then((r) => {
          if (n !== seq.current) return;
          setItems(r);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => setItems([]));
    }, 300);
    return () => clearTimeout(t);
  }, [value, enabled]);

  const pick = (s: Suggestion) => {
    typed.current = false;
    seq.current++;
    setOpen(false);
    setItems([]);
    onChange(s.main);
    onPick(s);
  };

  const show = enabled && open && items.length > 0;
  const listId = `${id}-suggestions`;
  return (
    <div className="relative">
      <input
        id={id}
        className={className}
        autoComplete={enabled ? "off" : "street-address"}
        value={value}
        maxLength={160}
        placeholder={placeholder}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        {...(enabled
          ? { role: "combobox", "aria-expanded": show, "aria-controls": listId, "aria-autocomplete": "list" as const, "aria-activedescendant": show && active >= 0 ? `${listId}-${active}` : undefined }
          : {})}
      />
      {show && (
        <ul id={listId} role="listbox" aria-label="Address suggestions" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-coffee-200 bg-white shadow-lg">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-4 py-2.5 ${i === active ? "bg-coffee-50" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              <span className="block font-medium">📍 {s.main}</span>
              {s.secondary && <span className="block text-sm text-coffee-600">{s.secondary}</span>}
            </li>
          ))}
          <li role="presentation" className="border-t border-coffee-100 px-4 py-1.5 text-right text-xs text-coffee-500">
            Suggestions by Google
          </li>
        </ul>
      )}
    </div>
  );
}
