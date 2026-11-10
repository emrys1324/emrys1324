# Delivery map (Google Maps)

The delivery address and the map work together:

| The customer… | …and the site |
|---|---|
| picks a **barangay** | moves the map to that barangay (no pin yet) |
| types the **street** | suggests matching addresses from Google; picking one **drops the pin there** and fills in the barangay and (for a shop/school/church) the landmark |
| taps the map, drags the pin or taps **Use my current location** | fills in any **empty** street, landmark and barangay from what's at that spot (shown with "please check") |

It **never overwrites** something the customer typed, and it never changes a barangay they chose (the barangay sets the delivery fee). The pin is still optional.

The same Google map is used on the **account page**, the **rider card** (with the Google Maps / Waze buttons) and the **staff order panel**.

**Without a Google key the site uses OpenStreetMap** (the map from the previous update; there are no address suggestions). It also switches back to OpenStreetMap automatically if Google rejects the key, so a key problem never breaks checkout.

## Your setup steps (about 15 minutes)

1. **Google Cloud account:** go to https://console.cloud.google.com, sign in with the café's Google account, create a project (e.g. "Pahuway Cafe").
2. **Billing:** Billing → link a billing account (a card is required, even though a small café normally stays inside the free monthly allowance — see Costs).
3. **Turn on 3 APIs** (APIs & Services → Library, search each, click Enable):
   - **Maps JavaScript API**
   - **Places API (New)**
   - **Geocoding API**
4. **Create the key:** APIs & Services → Credentials → **Create credentials → API key**.
5. **Lock the key to your website** (important — this key is visible in the page, so the restriction is what protects it). Edit the key:
   - **Application restrictions → Websites**, add:
     - `https://pahuway-cafe.vercel.app/*`
     - `https://*-emrys1324.vercel.app/*` (preview links)
     - `http://localhost:3000/*` (only if you develop locally)
   - **API restrictions → Restrict key** to the 3 APIs above.
6. **Set a safety cap (recommended):** APIs & Services → each API → Quotas: set a daily request limit (e.g. 500/day for Places and Geocoding), and Billing → Budgets & alerts: a ₱500 budget with email alerts.
7. **Add it to Vercel:** project → Settings → Environment Variables:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | your key |
   | `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | optional — a Map ID from Google Cloud → Map management (lets you style the map); leave empty for Google's default |

   Then **Deployments → Redeploy** (keys that start with `NEXT_PUBLIC_` are built into the page, so a redeploy is needed).
8. **Check:** on your phone open checkout → Delivery: the map should be Google's. Pick a barangay, type a street, tap the map, and confirm the fields fill in.

## Costs

Google charges per use, but each product has a **free monthly allowance** (10,000 requests per product per month for the basic ("Essentials") products such as maps and geocoding; check Google's price list for the exact allowance of each product). What this site uses:

- **Map loads** — each time a map appears (checkout, account, each rider card, staff panel).
- **Address suggestions** — one billing session per search (typing + picking), thanks to session tokens; lookups only start after 3 letters and wait for the customer to pause.
- **Geocoding** — when a pin moves and once per barangay (cached).

For a single café (say 30–50 delivery orders a day) this is normally well inside the free allowances. Set the budget alert in step 6 so you're told long before any charge. Pricing: https://mapsplatform.google.com/pricing/

## Notes

- **Rural addresses:** Google knows main streets, schools, churches and shops in San Agustin, but many puroks have no street names on Google. That's why the pin and landmark matter more than the street suggestion; riders navigate to the **pin**.
- **Barangay matching:** Google's barangay name is matched to your delivery zones by name (e.g. "Poblacion"). If a zone is named differently from Google, it just won't be auto-selected; customers choose it themselves.
- **Isla mobile app:** not changed.

## For developers
- `src/lib/google-maps.ts` (script loader, `gm_authFailure` → fallback), `src/lib/address-lookup.ts` (Places (New) `AutocompleteSuggestion` + `Place.fetchFields`, `Geocoder` reverse/barangay lookups, zone matching), `src/components/map/{MapView,GoogleMap,LeafletMap,MapPicker,StreetAutocomplete,useAddressSync}`.
- Tests: `npm run test:google-maps` (26 checks against a Google Maps stand-in, `tests/fixtures/mock-google-maps.js`; build/start the app with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=test-key`), and `npm run test:maps` for OpenStreetMap mode (no key).
