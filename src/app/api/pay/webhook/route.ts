import Stripe from "stripe";
import { grantEntitlementByClientId } from "@/lib/trial";

export const runtime = "nodejs";

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "STRIPE_WEBHOOK_SECRET missing" }), { status: 400 });
    }

    const stripe = getStripe();
    const raw = await req.text();
    const sig = req.headers.get("stripe-signature") || "";

    const evt = stripe.webhooks.constructEvent(raw, sig, webhookSecret);

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object as Stripe.Checkout.Session;
      const clientId = session.metadata?.clientId || null;
      if (clientId) {
        await grantEntitlementByClientId(clientId, 30);
      }
    }

    return new Response("ok");
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "webhook error" }), { status: 400 });
  }
}
