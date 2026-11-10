import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { sendPush, pushConfigured, type PushMessage } from "@/lib/fcm";

/**
 * Called by the database (pg_net trigger on public.orders) whenever an order is
 * placed, assigned to a rider, or changes status. Sends native push notifications
 * to the right phones. Protected by a shared secret (PUSH_WEBHOOK_SECRET).
 */
export const runtime = "nodejs";

const STATUS_TEXT: Record<string, { title: string; body: string }> = {
  preparing: { title: "We're preparing your order ☕", body: "Our baristas are on it." },
  ready: { title: "Your order is ready!", body: "Come grab it at the counter." },
  out_for_delivery: { title: "On the way 🛵", body: "Your order is out for delivery." },
  completed: { title: "Enjoy! Salamat po.", body: "Your order is complete." },
  cancelled: { title: "Order cancelled", body: "Tap to see the reason." },
};

function secretOk(given: string | null): boolean {
  const expected = process.env.PUSH_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-push-secret"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await pushConfigured()) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ skipped: "push not configured (FIREBASE_SERVICE_ACCOUNT / APNS_* / SUPABASE_SERVICE_ROLE_KEY missing)" });
  }

  const evt = (await req.json().catch(() => null)) as {
    order_id?: string;
    new_order?: boolean;
    rider_assigned?: boolean;
    status_changed?: boolean;
  } | null;
  if (!evt?.order_id) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, public_token, status, order_type, total, customer_id, rider_id, customer_name, scheduled_for")
    .eq("id", evt.order_id)
    .single();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  type Device = { token: string; platform: string };
  const jobs: { devices: Device[]; msg: PushMessage }[] = [];
  const peso = `₱${Number(order.total).toLocaleString("en-PH")}`;
  const type = order.order_type === "dine_in" ? "Dine-in" : order.order_type === "delivery" ? "Delivery" : "Pickup";

  // 1. New order → every admin device
  if (evt.new_order) {
    const { data } = await db.from("push_tokens").select("token, platform, users!inner(role)").eq("users.role", "admin");
    jobs.push({
      devices: (data ?? []).map((r) => ({ token: r.token, platform: r.platform })),
      msg: { title: `🔔 New order ${order.order_number}`, body: `${type} · ${peso} · ${order.customer_name}`, url: "/admin", urgent: true },
    });
  }

  // 2. Assigned to a rider → that rider's devices
  if (evt.rider_assigned && order.rider_id) {
    const { data: rider } = await db.from("riders").select("user_id").eq("id", order.rider_id).single();
    if (rider?.user_id) {
      const { data } = await db.from("push_tokens").select("token, platform").eq("user_id", rider.user_id);
      jobs.push({
        devices: (data ?? []) as Device[],
        msg: { title: `🛵 New delivery ${order.order_number}`, body: `${order.customer_name} · tap for address`, url: "/rider", urgent: true },
      });
    }
  }

  // 3. Status change → the customer (account devices + guest devices that subscribed to this order)
  if (evt.status_changed && STATUS_TEXT[order.status]) {
    let text = STATUS_TEXT[order.status];
    if (order.status === "ready" && order.order_type === "delivery") text = { title: "Packed and ready", body: "Waiting for our rider." };
    if (order.status === "ready" && order.order_type === "dine_in") text = { title: "Your order is ready!", body: "See you at the café." };
    const devices = new Map<string, Device>();
    const { data: subs } = await db.from("order_push_subscriptions").select("push_tokens(token, platform)").eq("order_id", order.id);
    (subs ?? []).forEach((s) => {
      const d = s.push_tokens as unknown as Device | null;
      if (d) devices.set(d.token, d);
    });
    if (order.customer_id) {
      const { data } = await db.from("push_tokens").select("token, platform").eq("user_id", order.customer_id);
      (data ?? []).forEach((d) => devices.set(d.token, d as Device));
    }
    jobs.push({ devices: [...devices.values()], msg: { ...text, body: `${order.order_number} · ${text.body}`, url: `/order/${order.public_token}` } });
  }

  const results = (await Promise.all(jobs.map((j) => sendPush(j.devices, j.msg)))).flat();
  const dead = results.filter((r) => r.unregistered).map((r) => r.token);
  if (dead.length) await db.from("push_tokens").delete().in("token", dead);

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.unregistered).map((r) => r.error),
    removed: dead.length,
  });
}
