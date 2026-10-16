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
  const deliveryToken = params.get("deliveryToken");
  const username = params.get("username");
  const storefrontHref = username && /^[a-z0-9_]{3,30}$/.test(username) ? `/creator/${username}` : null;
  const [message, setMessage] = useState("Verifying your PayPal payment…");
  const [complete, setComplete] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [downloadAvailable, setDownloadAvailable] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!checkoutId || !deliveryToken) return;
    localStorage.setItem(`delivery:${checkoutId}`, deliveryToken);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("deliveryToken");
    window.history.replaceState({}, "", cleanUrl);
  }, [checkoutId, deliveryToken]);

  useEffect(() => {
    if (!checkoutId || !paypalOrderId) {
      setVerificationFailed(true);
      setMessage("We could not match this return to a checkout. Please contact the creator before trying again.");
      return;
    }
    let active = true;
    setComplete(false);
    setVerificationFailed(false);
    setMessage("Verifying your PayPal payment…");
    fetch("/api/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId, paypalOrderId }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Payment verification is not complete yet.");
      if (!active) return;
      setComplete(true);
      setDownloadAvailable(Boolean(localStorage.getItem(`delivery:${checkoutId}`)));
      setMessage("PayPal confirmed your payment. Thanks for supporting the creator.");
    }).catch((error: unknown) => {
      if (!active) return;
      setVerificationFailed(true);
      setMessage(error instanceof Error ? error.message : "Payment verification is not complete yet.");
    });
    return () => { active = false; };
  }, [checkoutId, paypalOrderId, retryCount]);

  async function downloadPurchase() {
    if (!checkoutId) return;
    const token = deliveryToken || localStorage.getItem(`delivery:${checkoutId}`);
    if (!token) {
      setDownloadError("This download link is unavailable. Contact the creator for help.");
      return;
    }
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const response = await fetch("/api/deliveries/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId, deliveryToken: token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not prepare the download.");
      window.location.assign(result.downloadUrl);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not prepare the download.");
    } finally {
      setDownloadBusy(false);
    }
  }

  return <main className="checkout-result"><span className={complete ? "result-mark result-success" : "result-mark"}>{complete ? "✓" : "…"}</span><p className="eyebrow">PAYPAL SANDBOX CHECKOUT</p><h1>{complete ? "Payment verified" : verificationFailed ? "Payment not confirmed yet" : "Confirming payment"}</h1><p>{message}</p>{verificationFailed && checkoutId && paypalOrderId && <button className="button button-dark" onClick={() => setRetryCount((count) => count + 1)}>Retry payment verification</button>}{complete && downloadAvailable && <button className="button button-dark" onClick={() => void downloadPurchase()} disabled={downloadBusy}>{downloadBusy ? "Preparing download…" : "Download your purchase"}</button>}{downloadError && <p role="alert">{downloadError}</p>}<Link href={storefrontHref ?? "/"} className="button button-light">{storefrontHref ? "Return to storefront" : "Return to KoliCreator"}</Link></main>;
}