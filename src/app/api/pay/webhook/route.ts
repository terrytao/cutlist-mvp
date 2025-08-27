import { NextRequest } from "next/server";
import Stripe from "stripe";
import { grantEntitlementByClientId } from "@/lib/trial";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const raw = await req.text();
    const sig = req.headers.get("stripe-signature") || "";
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });

    const evt = stripe.webhooks.constructEvent(raw, sig, secret);

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object as Stripe.Checkout.Session;
      const clientId = (session.metadata && session.metadata.clientId) || null;
      if (clientId) {
        await grantEntitlementByClientId(clientId, 30);
      }
    }
    return new Response("ok");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "webhook error" }), { status: 400 });
  }
}
