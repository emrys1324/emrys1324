"use client";
// Order alert chime using the Web Audio API — no audio file to host.
// Browsers only allow sound after a tap, so staff press "Turn on sound" once per session.
let ctx: AudioContext | null = null;

export async function unlockAudio(): Promise<boolean> {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new Ctor();
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

export function playChime() {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  // three bright "ding" notes, loud enough for a busy café
  [0, 0.22, 0.44].forEach((offset, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "triangle";
    osc.frequency.value = [880, 1175, 1568][i];
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.6, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.5);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.55);
  });
  if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
}
