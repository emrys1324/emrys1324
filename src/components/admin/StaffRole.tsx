"use client";
import { createContext, useContext } from "react";

export type StaffRole = "admin" | "staff";
const Ctx = createContext<StaffRole>("staff");
export const StaffRoleProvider = Ctx.Provider;
/** Role of the signed-in person in the staff area ("staff" = Orders only). */
export const useStaffRole = () => useContext(Ctx);
