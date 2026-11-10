"use client";
import Link from "next/link";
import { Sheet, ItemPhoto, Badge } from "@/components/ui";
import { useCart, type CartLine } from "@/lib/cart";
import { formatPeso } from "@/lib/format";
import { QtyStepper } from "./ItemSheet";

export function optionSummary(l: Pick<CartLine, "options">) {
  return l.options.map((o) => o.name).join(" · ");
}

export function CartLines({ soldOutIds, compact = false }: { soldOutIds: Set<string>; compact?: boolean }) {
  const { lines, setQty, setNotes } = useCart();
  return (
    <ul className="divide-y divide-coffee-100">
      {lines.map((l) => {
        const soldOut = soldOutIds.has(l.menu_item_id);
        return (
          <li key={l.key} className="flex gap-3 py-4">
            {!compact && <ItemPhoto src={l.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold leading-snug">{l.name}</p>
                  {l.options.length > 0 && <p className="text-sm text-coffee-700">{optionSummary(l)}</p>}
                  {soldOut && (
                    <div className="mt-1">
                      <Badge tone="red">Sold out — please remove</Badge>
                    </div>
                  )}
                </div>
                <span className="shrink-0 font-bold tabular-nums">{formatPeso(l.unit_price * l.quantity)}</span>
              </div>
              <input
                aria-label={`Notes for ${l.name}`}
                className="mt-2 block min-h-[40px] w-full rounded-xl border border-dashed border-coffee-200 bg-transparent px-3 text-sm placeholder:text-coffee-500 focus:border-coffee-500 focus:outline-none"
                placeholder="+ Add a note (e.g. less ice)"
                value={l.notes}
                maxLength={200}
                onChange={(e) => setNotes(l.key, e.target.value)}
              />
              <div className="mt-2 flex items-center justify-between">
                <QtyStepper value={l.quantity} onChange={(n) => setQty(l.key, n)} min={0} label={`Quantity of ${l.name}`} />
                <button className="btn-ghost btn-sm text-red-700" onClick={() => setQty(l.key, 0)}>
                  Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CartDrawer({ open, onClose, soldOutIds, canOrder }: { open: boolean; onClose: () => void; soldOutIds: Set<string>; canOrder: boolean }) {
  const { lines, subtotal } = useCart();
  const blocked = lines.some((l) => soldOutIds.has(l.menu_item_id));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your order"
      footer={
        lines.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">Subtotal</span>
              <span className="font-bold tabular-nums">{formatPeso(subtotal)}</span>
            </div>
            {canOrder && !blocked ? (
              <Link href="/checkout" className="btn-primary w-full">
                Checkout
              </Link>
            ) : (
              <button className="btn-primary w-full" disabled>
                {blocked ? "Remove sold-out items to continue" : "Ordering is closed right now"}
              </button>
            )}
          </div>
        )
      }
    >
      <div className="px-5">
        {lines.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-4xl" aria-hidden>
              ☕
            </p>
            <p className="mt-2 font-semibold">Your cart is empty</p>
            <p className="text-coffee-600">Add something delicious from the menu.</p>
          </div>
        ) : (
          <CartLines soldOutIds={soldOutIds} />
        )}
      </div>
    </Sheet>
  );
}
