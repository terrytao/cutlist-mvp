import Stripe from "stripe";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, returnUrl } = await req.json();
    const stripe = getStripe();

    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId required" }), { status: 400 });
    }
    const base = returnUrl || process.env.PUBLIC_BASE_URL || new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      metadata: { clientId },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Cut-List Export (SVG/G-code)" },
            unit_amount: 699
          },
          quantity: 1
        }
      ],
      success_url: `${base}/?paid=1`,
      cancel_url: `${base}/?canceled=1`
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "checkout failed" }), { status: 400 });
  }
}
