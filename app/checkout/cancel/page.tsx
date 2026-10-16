import { getSupabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

type Props = { searchParams: Promise<{ checkoutId?: string; username?: string }> };

export default async function CheckoutCancelled({ searchParams }: Props) {
  const { checkoutId, username } = await searchParams;
  const storefrontHref = username && /^[a-z0-9_]{3,30}$/.test(username) ? `/creator/${username}` : "/";
  if (checkoutId && /^[0-9a-f-]{36}$/i.test(checkoutId)) {
    try {
      const admin = getSupabaseAdmin();
      await admin.from("checkout_orders").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", checkoutId).in("status", ["CREATED", "APPROVED"]);
    } catch {
      // Cancellation is informational; a later verified capture still controls payment state.
    }
  }
  return <main className="checkout-result"><span className="result-mark">×</span><p className="eyebrow">PAYPAL SANDBOX CHECKOUT</p><h1>Checkout cancelled</h1><p>No payment was recorded. You can return to the storefront and try again.</p><Link href={storefrontHref} className="button button-dark">Return to storefront</Link></main>;
}