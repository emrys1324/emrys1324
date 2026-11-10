// Renders the Isla icon + splash source PNGs, then @capacitor/assets makes every size.
// Run: node mobile/make-assets.mjs && npx capacitor-assets generate --assetPath mobile/assets
import sharp from "sharp";
const BROWN = "#5a3a25", CREAM = "#fbf7f0", SAGE = "#c9d6c1", GREEN = "#6b8462";

// cup artwork on a 64-unit grid (same as the web logo, without the circle)
const cup = (stroke = CREAM) => `
  <path d="M18 27h24v9a12 12 0 0 1-12 12h0a12 12 0 0 1-12-12z" fill="${stroke}"/>
  <path d="M42 30h3a5 5 0 0 1 0 10h-4" fill="none" stroke="${stroke}" stroke-width="3"/>
  <path d="M24 22c0-3 3-3 3-6M31 22c0-3 3-3 3-6" stroke="${SAGE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M22 33c3 3 13 3 16 0" stroke="${GREEN}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;

// Full icon (iOS + legacy Android): brown square, cup centred & a little larger
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BROWN}"/><g transform="translate(-8.8 -4.8) scale(1.2)">${cup()}</g></svg>`;
// Android adaptive icon foreground: cup inside the 66% safe zone, transparent background
const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64">
  <g transform="translate(9.6 11.52) scale(0.66)">${cup()}</g></svg>`;
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BROWN}"/></svg>`;
// Splash: cream background, round logo + wordmark
const splash = (bgc, text) => `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="${bgc}"/>
  <g transform="translate(1066 966) scale(9.375)"><circle cx="32" cy="32" r="32" fill="${BROWN}"/>${cup()}</g>
  <text x="1366" y="1830" text-anchor="middle" font-family="Georgia, serif" font-size="200" font-weight="700" fill="${text}">Isla</text>
  <text x="1366" y="1950" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="72" fill="${text}" opacity=".75">by Pahuway Cafe</text></svg>`;

const out = "mobile/assets/";
await sharp(Buffer.from(icon)).png().toFile(out + "icon-only.png");
await sharp(Buffer.from(fg)).png().toFile(out + "icon-foreground.png");
await sharp(Buffer.from(bg)).png().toFile(out + "icon-background.png");
await sharp(Buffer.from(splash(CREAM, BROWN))).png().toFile(out + "splash.png");
await sharp(Buffer.from(splash("#2e1e14", CREAM))).png().toFile(out + "splash-dark.png");
// Store listing assets
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile(out + "store-icon-512.png");
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="${CREAM}"/><circle cx="880" cy="60" r="220" fill="#efe4d8"/>
  <g transform="translate(90 120) scale(4)"><circle cx="32" cy="32" r="32" fill="${BROWN}"/>${cup()}</g>
  <text x="400" y="230" font-family="Georgia, serif" font-size="110" font-weight="700" fill="#2e1e14">Isla</text>
  <text x="404" y="300" font-family="Helvetica, Arial, sans-serif" font-size="38" fill="${BROWN}">Order from Pahuway Cafe</text>
  <text x="404" y="345" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="${GREEN}">Pickup · Dine-in · Delivery</text><text x="404" y="385" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="${GREEN}">San Agustin, Romblon</text></svg>`;
await sharp(Buffer.from(feature)).png().toFile(out + "play-feature-graphic-1024x500.png");
console.log("source assets written to", out);
