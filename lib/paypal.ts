const PAYPAL_API = "https://api-m.sandbox.paypal.com";

type PayPalLink = { href: string; rel: string };

export type PayPalOrder = {
  id: string;
  status: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    payments?: { captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string } }> };
  }>;
};

async function getAccessToken() {
  if (process.env.PAYPAL_ENV !== "sandbox") {
    throw new Error("This build only permits PayPal sandbox credentials.");
  }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal sandbox credentials are not configured.");

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error("PayPal could not issue a sandbox access token.");
  return data.access_token as string;
}

export async function paypalRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(data.details) ? data.details[0]?.description : undefined;
    throw new Error(detail || data.message || "PayPal sandbox request failed.");
  }
  return data as T;
}