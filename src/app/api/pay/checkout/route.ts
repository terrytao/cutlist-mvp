import Stripe from "stripe";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });

export async function POST(req: NextRequest) {
  try {
    const { clientId, returnUrl } = await req.json();
    if (!process.env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }), { status: 400 });
    }
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
            unit_amount: 699 // $6.99
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
