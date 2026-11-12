import { NextResponse } from "next/server";
import { adminContext, fail, loadMember, siteUrl, welcomeLink } from "@/lib/team-admin";

export const runtime = "nodejs";

/** A one-time link to set (or reset) their password — for sharing by Messenger/SMS. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const m = await loadMember(ctx.db, id);
  if (!m?.email) return fail("Team member not found.", 404);
  if (!m.is_active) return fail("Switch their login back on first.");
  const site = siteUrl(req);
  const { data, error } = await ctx.db.auth.admin.generateLink({ type: "recovery", email: m.email, options: { redirectTo: `${site}/welcome` } });
  if (error) return fail(error.message, 500);
  return NextResponse.json({ link: welcomeLink(site, data.properties.hashed_token, "recovery") });
}
