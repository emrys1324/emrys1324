import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const metadata = { title: "Privacy policy — Padaya" };
export const revalidate = 3600;

async function getContact() {
  try {
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await s.from("store_settings").select("store_name, contact_phone, contact_email").eq("id", 1).single();
    return data;
  } catch {
    return null;
  }
}

export default async function PrivacyPage() {
  const c = await getContact();
  const name = c?.store_name ?? "Pahuway Cafe";
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <Link href="/" className="text-sm font-semibold text-coffee-700 underline">
        ← Back to menu
      </Link>
      <article className="card mt-4 space-y-4 p-6 leading-relaxed [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        <h1 className="font-display text-3xl font-bold">Privacy policy</h1>
        <p className="text-sm text-coffee-600">Applies to the {name} website and the Padaya home-screen app. Last updated: November 2026.</p>

        <p>
          {name} (&quot;we&quot;) is a café in San Agustin, Romblon, Philippines. We collect only what we need to prepare and deliver your order, and we
          handle it in line with the Philippine Data Privacy Act of 2012 (RA 10173).
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Order details:</strong> your name, mobile number, items ordered, order type and time.</li>
          <li><strong>Delivery details</strong> (delivery orders only): barangay, street/purok, landmark and notes for the rider.</li>
          <li><strong>GCash payment proof</strong> (if you pay by GCash): the reference number and the screenshot you upload.</li>
          <li><strong>Account details</strong> (optional, only if you create an account): email address, password (stored encrypted by our provider), and saved address.</li>
          <li><strong>Notification token</strong> (mobile app, only if you allow notifications): a device code used to send order updates.</li>
        </ul>
        <p>We do not use advertising trackers, sell your data, or share it for marketing.</p>

        <h2>How we use it</h2>
        <ul>
          <li>To prepare your order, deliver it, and contact you if there is a problem.</li>
          <li>To verify GCash payments.</li>
          <li>To show you your order status and, if you have an account, your order history.</li>
          <li>For simple sales records (daily totals and best-selling items).</li>
        </ul>

        <h2>Who can see it</h2>
        <ul>
          <li>Our staff, and the rider assigned to your delivery (name, mobile, address and amount to collect only).</li>
          <li>
            Our service providers, who store and process data on our behalf: Supabase (database, login and file storage, Singapore region), Vercel (website
            hosting) and Google Firebase (push notifications in the app).
          </li>
        </ul>

        <h2>How long we keep it</h2>
        <ul>
          <li>Order records are kept for up to 2 years for accounting, then deleted.</li>
          <li>GCash screenshots are kept for up to 90 days after the order.</li>
          <li>Account details are kept until you delete your account.</li>
        </ul>

        <h2>Your choices and rights</h2>
        <ul>
          <li>You can order without an account.</li>
          <li>
            <strong>Delete your account</strong> any time in the app or website under <Link href="/account" className="underline">My account → Delete account</Link>.
            This removes your login and saved details immediately; past orders are kept without being linked to you.
          </li>
          <li>You can turn notifications off in your phone&apos;s settings.</li>
          <li>You may ask us to access, correct or delete your personal data by contacting us below.</li>
        </ul>

        <h2>Contact</h2>
        <p>
          {name}, San Agustin, Romblon, Philippines
          {c?.contact_phone && (
            <>
              <br />
              Mobile: <a className="underline" href={`tel:${c.contact_phone}`}>{c.contact_phone}</a>
            </>
          )}
          {c?.contact_email && (
            <>
              <br />
              Email: <a className="underline" href={`mailto:${c.contact_email}`}>{c.contact_email}</a>
            </>
          )}
        </p>
      </article>
    </main>
  );
}
