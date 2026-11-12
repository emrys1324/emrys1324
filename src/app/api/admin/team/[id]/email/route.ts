import { NextResponse } from "next/server";
import { adminContext, anonClient, fail, friendlyEmailError, inviteAccepted, loadMember, siteUrl } from "@/lib/team-admin";

export const runtime = "nodejs";

/** Email them a link to set a new password (or resend the invite if they never accepted it). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const m = await loadMember(ctx.db, id);
  if (!m?.email) return fail("Team member not found.", 404);
  if (!m.is_active) return fail("Switch their login back on first.");
  const redirectTo = `${siteUrl(req)}/welcome`;
  const { data: auth } = await ctx.db.auth.admin.getUserById(id);
  if (!inviteAccepted(auth?.user ?? undefined)) {
    const { error } = await ctx.db.auth.admin.inviteUserByEmail(m.email, { redirectTo, data: { full_name: m.full_name } });
    if (!error) return NextResponse.json({ sent: "invite" });
  }
  const { error } = await anonClient().auth.resetPasswordForEmail(m.email, { redirectTo });
  return error ? fail(friendlyEmailError(error.message)) : NextResponse.json({ sent: "reset" });
}
