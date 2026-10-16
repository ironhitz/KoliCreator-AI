"use client";

import { useState } from "react";

type CheckoutButtonProps = {
  username: string;
  productId?: string;
  tipAmountCents?: number;
  label: string;
};

export function CheckoutButton({ username, productId, tipAmountCents, label }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function beginCheckout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/paypal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, productId, tipAmountCents }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start checkout.");
      window.location.assign(data.approvalUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout.");
      setLoading(false);
    }
  }

  return <div className="checkout-action"><button className="button button-dark checkout-button" onClick={beginCheckout} disabled={loading}>{loading ? "Connecting to PayPal…" : label}</button>{error && <p className="checkout-error" role="alert">{error}</p>}</div>;
}