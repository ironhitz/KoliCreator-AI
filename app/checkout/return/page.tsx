"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

export default function CheckoutReturnPage() {
  return <Suspense fallback={<main className="checkout-result"><p>Loading payment status…</p></main>}><CheckoutReturnContent /></Suspense>;
}

function CheckoutReturnContent() {
  const params = useSearchParams();
  const checkoutId = params.get("checkoutId");
  const paypalOrderId = params.get("token");
  const [message, setMessage] = useState("Verifying your PayPal payment…");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!checkoutId || !paypalOrderId) {
      setMessage("We could not match this return to a checkout. Please contact the creator before trying again.");
      return;
    }
    fetch("/api/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId, paypalOrderId }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment verification is not complete yet.");
      setComplete(true);
      setMessage("PayPal confirmed your payment. Thanks for supporting the creator.");
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Payment verification is not complete yet.");
    });
  }, [checkoutId, paypalOrderId]);

  return <main className="checkout-result"><span className={complete ? "result-mark result-success" : "result-mark"}>{complete ? "✓" : "…"}</span><p className="eyebrow">PAYPAL SANDBOX CHECKOUT</p><h1>{complete ? "Payment verified" : "Confirming payment"}</h1><p>{message}</p><Link href="/" className="button button-dark">Return to KoliCreator</Link></main>;
}