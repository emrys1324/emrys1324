"use client";
import { useEffect } from "react";
import { initNativeShell, isNativeApp } from "@/lib/native";

/** Mounted once in the root layout; only does anything inside the Isla app. */
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("native-app");
    initNativeShell();
  }, []);
  return null;
}
