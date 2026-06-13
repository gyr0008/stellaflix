import { createAdminClient } from "@/lib/supabase/admin";
import { sendPaymentConfirmation } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const subscriptionId = session.subscription as string;

      if (userId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;

        // Determine plan name
        let planName = "basic";
        if (priceId?.includes("standard")) planName = "standard";
        if (priceId?.includes("premium")) planName = "premium";

        await admin
          .from("profiles")
          .update({
            subscription_status: "active",
            subscription_plan: planName,
            stripe_subscription_id: subscriptionId,
            subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq("id", userId);

        // Send confirmation email
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .single();

        const { data: authUser } = await admin.auth.admin.getUserById(userId);
        if (authUser.user?.email) {
          await sendPaymentConfirmation(
            authUser.user.email,
            profile?.full_name || "用户",
            planName
          );
        }
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId = subscription.customer as string;

        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          await admin
            .from("profiles")
            .update({
              subscription_status: "active",
              subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq("id", profile.id);

          // Log payment
          await admin.from("payments").insert({
            user_id: profile.id,
            stripe_payment_id: invoice.payment_intent as string,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: "succeeded",
            plan: subscription.items.data[0]?.price.id,
          });
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile) {
        await admin
          .from("profiles")
          .update({
            subscription_status: "cancelled",
            subscription_plan: null,
            stripe_subscription_id: null,
          })
          .eq("id", profile.id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
