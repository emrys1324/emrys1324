"use client";
import { createContext, useContext } from "react";
import type { Perm } from "@/lib/permissions";

const Ctx = createContext<{ perms: Perm[]; isAdmin: boolean }>({ perms: [], isAdmin: false });
export const StaffAccessProvider = Ctx.Provider;
/** What the signed-in team member may do (admins have every permission). */
export function useStaffAccess() {
  const a = useContext(Ctx);
  return { ...a, can: (p: Perm) => a.perms.includes(p) };
}
