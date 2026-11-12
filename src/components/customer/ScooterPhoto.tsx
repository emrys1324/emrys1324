"use client";
/** Scooter photo, or a 🛵 tile when there's none (instead of the café placeholder). */
export function ScooterPhoto({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src)
    return (
      <span aria-hidden className={`flex items-center justify-center bg-sky-100 text-3xl ${className}`}>
        🛵
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}
