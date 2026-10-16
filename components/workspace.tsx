"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BarChart3, Check, ExternalLink, LogOut, Plus, Share2, ShieldCheck, Sparkles, Store, WalletCards, X } from "lucide-react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { formatMoney } from "@/lib/money";
import { sumTransactionCurrencies } from "@/lib/transaction-analytics";
import { normalizeSocialUrl, sanitizeSocialLinks, socialPlatforms, type SocialLinks } from "@/lib/social-links";
import { CreatorShare } from "@/components/creator-share";
import type { RevenueRow } from "@/components/transactions-grid";

const TransactionsGrid = dynamic(
  () => import("@/components/transactions-grid").then((module) => module.TransactionsGrid),
  { ssr: false, loading: () => <p className="empty-state">Loading transaction table…</p> },
);

type Profile = { id: string; username: string; display_name: string; bio: string; social_links: unknown };
type Product = { id: string; title: string; description: string; kind: string; price_cents: number; currency: string; is_published: boolean; cover_url: string | null; has_delivery_file: boolean };
type Recommendation = { title: string; description: string; recommendedPriceCents: number; requiredSales: number; targetGapCents: number };
type Plan = { id: string; status: "draft" | "testing" | "completed"; createdAt: string; strategies: Array<{ title: string; rationale: string }>; productIdeas: Recommendation[]; campaignPosts: Array<{ channel: string; copy: string }>; launchPlan: string[]; assumptions: string[]; revenueGapCents: number; currency?: string; generatedAt?: string; learningWindow?: string; verifiedTransactionCount?: number };
type Metrics = { audienceSize: number; monthlyViews: number; currentMonthlyRevenueCents: number; monthlyTargetCents: number; existingProducts: string };
type TransactionSummary = { product_id: string | null; currency: string; capture_count: number; gross_cents: number; refunded_cents: number; refunded_capture_count: number };
const supportedCurrencies = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

async function loadCreatorData(client: SupabaseClient, userId: string) {
  const [profileResult, productResult, planResult] = await Promise.all([
    client.from("profiles").select("id,username,display_name,bio,social_links").eq("id", userId).maybeSingle(),
    client.from("products").select("id,title,description,kind,price_cents,currency,is_published,cover_url,has_delivery_file").eq("creator_id", userId).order("created_at", { ascending: false }),
    client.from("creator_ai_plans").select("id,status,result,created_at").eq("creator_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (productResult.error) throw productResult.error;
  if (planResult.error) throw planResult.error;
  const products = (productResult.data ?? []) as Product[];
  const savedPlans: Plan[] = (planResult.data ?? []).map((savedPlan) => ({ ...savedPlan.result as Omit<Plan, "id" | "status" | "createdAt">, id: savedPlan.id, status: savedPlan.status, createdAt: savedPlan.created_at }));
  return { profile: profileResult.data as Profile | null, products, savedPlans };
}

export function Workspace() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
  const [socialBusy, setSocialBusy] = useState(false);
  const [socialMessage, setSocialMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<RevenueRow[]>([]);
  const [transactionSummary, setTransactionSummary] = useState<TransactionSummary[]>([]);
  const [productSalesSummary, setProductSalesSummary] = useState<TransactionSummary[]>([]);
  const [transactionTotalCount, setTransactionTotalCount] = useState(0);
  const [transactionPage, setTransactionPage] = useState(0);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionError, setTransactionError] = useState("");
  const [periodFilter, setPeriodFilter] = useState("30d");
  const [productFilter, setProductFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [pageError, setPageError] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [metrics, setMetrics] = useState<Metrics>({ audienceSize: 0, monthlyViews: 0, currentMonthlyRevenueCents: 0, monthlyTargetCents: 250000, existingProducts: "" });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [savedPlans, setSavedPlans] = useState<Plan[]>([]);
  const [planBusy, setPlanBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [insight, setInsight] = useState("");
  const [insightBusy, setInsightBusy] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("12");
  const [productCurrency, setProductCurrency] = useState<(typeof supportedCurrencies)[number]>("USD");
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [productBusy, setProductBusy] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductTitle, setEditProductTitle] = useState("");
  const [editProductDescription, setEditProductDescription] = useState("");
  const [editProductPrice, setEditProductPrice] = useState("");
  const [editProductCurrency, setEditProductCurrency] = useState<(typeof supportedCurrencies)[number]>("USD");
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [locale, setLocale] = useState("en-US");

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setConfigured(false);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowser();
    setClient(supabase);
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await refreshWorkspace(supabase, data.session.user);
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setLoading(true);
        window.setTimeout(() => void refreshWorkspace(supabase, nextSession.user), 0);
      } else {
        setProfile(null);
        setSocialLinks({});
        setProducts([]);
        setTransactions([]);
        setSavedPlans([]);
        setPlan(null);
        setLoading(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    setOnboardingDismissed(localStorage.getItem(`onboarding-dismissed:${profile.id}`) === "true");
  }, [profile?.id]);

  useEffect(() => {
    setLocale(navigator.language || "en-US");
  }, []);

  useEffect(() => {
    if (!client || !session?.access_token) return;
    const accessToken = session.access_token;
    let active = true;
    async function loadTransactions() {
      setTransactionsLoading(true);
      setTransactionError("");
      const query = new URLSearchParams({ period: periodFilter, product: productFilter, page: String(transactionPage) });
      try {
        const response = await fetch(`/api/creator/transactions?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load transactions.");
        if (!active) return;
        const productNames = new Map(products.map((product) => [product.id, product.title]));
        setTransactions((result.rows ?? []).map((transaction: Omit<RevenueRow, "product" | "productId"> & { product_id: string | null }) => ({
          ...transaction,
          productId: transaction.product_id,
          product: transaction.product_id ? productNames.get(transaction.product_id) ?? "Creator offer" : "Creator tip",
        })));
        setTransactionSummary(result.summary ?? []);
        setProductSalesSummary(result.productSummary ?? []);
        setTransactionTotalCount(result.totalCount ?? 0);
      } catch (error) {
        if (active) setTransactionError(error instanceof Error ? error.message : "Could not load transactions.");
      } finally {
        if (active) setTransactionsLoading(false);
      }
    }
    void loadTransactions();
    return () => { active = false; };
  }, [client, session?.access_token, products, periodFilter, productFilter, transactionPage]);

  async function refreshWorkspace(supabase: SupabaseClient, user: User) {
    try {
      const data = await loadCreatorData(supabase, user.id);
      setProfile(data.profile);
      setSocialLinks(sanitizeSocialLinks(data.profile?.social_links));
      setProducts(data.products);
      setTransactions([]);
      setTransactionSummary([]);
      setProductSalesSummary([]);
      setTransactionTotalCount(0);
      setTransactionPage(0);
      setSavedPlans(data.savedPlans);
      setPlan((current) => current ?? data.savedPlans[0] ?? null);
      setPageError(data.profile ? "" : "Creator profile is not ready. Check the profile trigger in the Supabase migration.");
    } catch {
      setPageError("Could not load your workspace. Check your Supabase migration and RLS policies.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setAuthBusy(true);
    setAuthMessage("");
    const result = authMode === "signin"
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.signUp({ email, password, options: { data: { username: username.trim().toLowerCase(), display_name: displayName.trim() } } });
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email to confirm your account, then sign in.");
    else setAuthMessage(authMode === "signup" ? "Account created." : "Signed in.");
    setAuthBusy(false);
  }

  async function signOut() {
    await client?.auth.signOut();
    setPlan(null);
    setInsight("");
  }

  function updateMetric(field: keyof Metrics, value: string) {
    setMetrics((current) => ({ ...current, [field]: field === "existingProducts" ? value : Number(value) }));
  }

  async function generatePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setPlanBusy(true);
    setAiError("");
    setPlan(null);
    try {
      const response = await fetch("/api/ai/plan", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(metrics) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate a plan.");
      setPlan(result as Plan);
      setSavedPlans((current) => [result as Plan, ...current.filter((savedPlan) => savedPlan.id !== (result as Plan).id)].slice(0, 10));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Could not generate a plan.");
    } finally {
      setPlanBusy(false);
    }
  }

  async function savePlan() {
    if (!client || !profile || !plan) return;
    setPlanBusy(true);
    setPageError("");
    const { id, status, ...result } = plan;
    const { error } = await client.from("creator_ai_plans").update({ result, status, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", profile.id);
    if (error) setPageError("Could not save this Revenue Agent plan. Please try again.");
    else setSavedPlans((current) => current.map((savedPlan) => savedPlan.id === id ? plan : savedPlan));
    setPlanBusy(false);
  }

  async function generateInsight() {
    if (!session) return;
    setInsightBusy(true);
    setInsight("");
    try {
      const response = await fetch("/api/ai/insights", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate an insight.");
      setInsight(result.insight);
    } catch (error) {
      setInsight(error instanceof Error ? error.message : "Could not generate an insight.");
    } finally {
      setInsightBusy(false);
    }
  }

  async function publishIdea(idea: Recommendation) {
    if (!client || !profile) return;
    const title = idea.title.trim();
    const description = idea.description.trim();
    if (title.length < 2 || title.length > 100 || description.length > 1000 || !Number.isSafeInteger(idea.recommendedPriceCents) || idea.recommendedPriceCents < 100 || idea.recommendedPriceCents > 10000000) {
      setPageError("Use a 2–100 character product name, a description of no more than 1,000 characters, and a price from $1 to $100,000.");
      return;
    }
    setProductBusy(true);
    setPageError("");
    const { error } = await client.from("products").insert({ creator_id: profile.id, title, description, kind: "digital_product", price_cents: idea.recommendedPriceCents, currency: "USD", is_published: true });
    if (error) setPageError(error.message);
    else await refreshWorkspace(client, { id: profile.id } as User);
    setProductBusy(false);
  }

  async function saveSocialLinks(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !profile) return;
    setSocialBusy(true);
    setPageError("");
    setSocialMessage("");
    const links: SocialLinks = {};
    for (const platform of socialPlatforms) {
      const value = socialLinks[platform.key]?.trim();
      if (!value) continue;
      const normalized = normalizeSocialUrl(platform.key, value);
      if (!normalized) {
        setPageError(`Enter a secure ${platform.label} profile link for the ${platform.label} field.`);
        setSocialBusy(false);
        return;
      }
      links[platform.key] = normalized;
    }
    const { error } = await client.from("profiles").update({ social_links: links }).eq("id", profile.id);
    if (error) setPageError("Could not save your social links. Please try again.");
    else {
      setSocialLinks(links);
      setSocialMessage("Your links are saved and visible on your public creator page.");
    }
    setSocialBusy(false);
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !profile) return;
    const priceCents = Math.round(Number(productPrice) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 100) {
      setPageError("Set a price of at least $1.00.");
      return;
    }
    if (productImage && (!productImage.type.match(/^image\/(png|jpeg|webp)$/) || productImage.size > 5 * 1024 * 1024)) {
      setPageError("Choose a PNG, JPEG or WebP image under 5 MB.");
      return;
    }
    const allowedProductTypes = ["application/pdf", "application/epub+zip", "application/zip", "audio/mpeg", "audio/mp4", "video/mp4"];
    if (!productFile || !allowedProductTypes.includes(productFile.type) || productFile.size > 50 * 1024 * 1024) {
      setPageError("Choose a PDF, EPUB, ZIP, MP3, M4A or MP4 product file under 50 MB.");
      return;
    }
    setProductBusy(true);
    let coverUrl: string | null = null;
    let uploadedPath: string | null = null;
    let deliveryFilePath: string | null = null;
    if (productImage) {
      const safeName = productImage.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      uploadedPath = `${profile.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await client.storage.from("product-assets").upload(uploadedPath, productImage, { contentType: productImage.type, upsert: false });
      if (uploadError) {
        setPageError(uploadError.message);
        setProductBusy(false);
        return;
      }
      coverUrl = client.storage.from("product-assets").getPublicUrl(uploadedPath).data.publicUrl;
    }
    deliveryFilePath = `${profile.id}/${crypto.randomUUID()}-${productFile.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { error: deliveryUploadError } = await client.storage.from("product-deliveries").upload(deliveryFilePath, productFile, { contentType: productFile.type, upsert: false });
    if (deliveryUploadError) {
      if (uploadedPath) await client.storage.from("product-assets").remove([uploadedPath]);
      setPageError(deliveryUploadError.message);
      setProductBusy(false);
      return;
    }
    const { error } = await client.from("products").insert({ creator_id: profile.id, title: productTitle.trim(), description: productDescription.trim(), kind: "digital_product", price_cents: priceCents, currency: productCurrency, is_published: true, cover_url: coverUrl, delivery_file_path: deliveryFilePath });
    if (error && uploadedPath) await client.storage.from("product-assets").remove([uploadedPath]);
    if (error && deliveryFilePath) await client.storage.from("product-deliveries").remove([deliveryFilePath]);
    if (error) setPageError(error.message);
    else {
      setProductTitle("");
      setProductDescription("");
      setProductPrice("12");
      setProductCurrency("USD");
      setProductImage(null);
      setProductFile(null);
      setProductFormOpen(false);
      await refreshWorkspace(client, { id: profile.id } as User);
    }
    setProductBusy(false);
  }

  function beginProductEdit(product: Product) {
    setEditingProductId(product.id);
    setEditProductTitle(product.title);
    setEditProductDescription(product.description);
    setEditProductPrice((product.price_cents / 100).toFixed(2));
    setEditProductCurrency(supportedCurrencies.includes(product.currency as (typeof supportedCurrencies)[number]) ? product.currency as (typeof supportedCurrencies)[number] : "USD");
    setPageError("");
  }

  async function saveProductEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !profile || !editingProductId) return;
    const title = editProductTitle.trim();
    const description = editProductDescription.trim();
    const priceCents = Math.round(Number(editProductPrice) * 100);
    if (title.length < 2 || title.length > 100 || description.length > 1000 || !Number.isSafeInteger(priceCents) || priceCents < 100 || priceCents > 10000000) {
      setPageError("Use a 2–100 character product name, a description of no more than 1,000 characters, and a price from $1 to $100,000.");
      return;
    }
    setSavingProductId(editingProductId);
    setPageError("");
    const { error } = await client.from("products").update({ title, description, price_cents: priceCents, currency: editProductCurrency }).eq("id", editingProductId).eq("creator_id", profile.id);
    if (error) setPageError("Could not update this offer. Please try again.");
    else {
      setProducts((current) => current.map((product) => product.id === editingProductId ? { ...product, title, description, price_cents: priceCents, currency: editProductCurrency } : product));
      setEditingProductId(null);
    }
    setSavingProductId(null);
  }

  async function toggleProductPublished(product: Product) {
    if (!client || !profile) return;
    if (!product.is_published && !product.has_delivery_file) {
      setPageError("Attach a digital product file before publishing this offer.");
      return;
    }
    setSavingProductId(product.id);
    setPageError("");
    const isPublished = !product.is_published;
    const { error } = await client.from("products").update({ is_published: isPublished }).eq("id", product.id).eq("creator_id", profile.id);
    if (error) setPageError("Could not change this offer's storefront status.");
    else setProducts((current) => current.map((item) => item.id === product.id ? { ...item, is_published: isPublished } : item));
    setSavingProductId(null);
  }

  async function copyCampaign(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const visibleTransactions = transactions;
  const currencyTotals = sumTransactionCurrencies(transactionSummary);
  const usdSummary = currencyTotals.get("USD") ?? { grossCents: 0, refundedCents: 0, tipsCents: 0 };
  const grossCents = usdSummary.grossCents;
  const refundedCents = usdSummary.refundedCents;
  const tipsCents = usdSummary.tipsCents;
  const completedCount = transactionSummary.reduce((total, summary) => total + summary.capture_count, 0);
  const productCount = transactionSummary.filter((summary) => summary.product_id !== null).reduce((total, summary) => total + summary.capture_count, 0);
  const tipCount = transactionSummary.filter((summary) => summary.product_id === null).reduce((total, summary) => total + summary.capture_count, 0);
  const refundCount = transactionSummary.reduce((total, summary) => total + summary.refunded_capture_count, 0);
  const feeRate = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_RATE || 0.05);
  const estimateMoney = (cents: number, currency = "USD") => formatMoney(cents, currency, locale);
  const displayCurrencyTotals = (selectAmount: (amounts: { grossCents: number; refundedCents: number; tipsCents: number }) => number) => [...currencyTotals.entries()].map(([currency, amounts]) => `${estimateMoney(selectAmount(amounts), currency)} ${currency}`).join(" · ") || `${estimateMoney(0)} USD`;
  const onboardingSteps = [
    { label: "Set up your public creator profile", complete: Boolean(profile?.display_name && profile.username), href: "#connect", action: "Review profile links" },
    { label: "Publish an offer with a delivery file", complete: products.some((product) => product.is_published && product.has_delivery_file), action: "Create an offer" },
    { label: "Add at least one social profile", complete: Object.keys(socialLinks).length > 0, href: "#connect", action: "Add profile links" },
    { label: "Complete a sandbox purchase", complete: completedCount > 0, href: profile ? `/creator/${profile.username}` : undefined, action: "Open storefront" },
  ];
  const completedOnboardingSteps = onboardingSteps.filter((step) => step.complete).length;

  function dismissOnboarding() {
    if (profile?.id) localStorage.setItem(`onboarding-dismissed:${profile.id}`, "true");
    setOnboardingDismissed(true);
  }

  if (!configured) return <main className="setup-screen"><span className="brand-mark">k.</span><p className="eyebrow">KOLICREATOR AI</p><h1>Connect your workspace.</h1><p>Add your Supabase project URL and anon key to the server environment, then apply the database migration. Payment and AI secrets stay server-side.</p><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="button button-dark">Open Supabase <ExternalLink size={15} /></a></main>;
  if (loading) return <main className="setup-screen"><span className="brand-mark">k.</span><p>Loading your workspace…</p></main>;
  if (!session) return (
    <main className="auth-screen">
      <section className="auth-story"><Link className="brand" href="/"><span className="brand-mark">k.</span><span>KoliCreator</span></Link><div><span className="eyebrow">A BETTER BUSINESS FOR YOUR CREATIVE WORK</span><h1>Make your<br />audience work<br />for you.</h1><p>See the value in your work. Shape a new offer. Let your community show up for it.</p></div><span className="auth-story-note">Built for creators, wherever your audience lives.</span></section>
      <section className="auth-panel"><div className="auth-card"><p className="eyebrow">CREATOR WORKSPACE</p><h2>{authMode === "signin" ? "Welcome back" : "Start your storefront"}</h2><p className="auth-hint">{authMode === "signin" ? "Sign in to see your offers and earnings." : "Create a creator account to set up your public store."}</p>
        <form onSubmit={submitAuth} className="auth-form">
          {authMode === "signup" && <><label>Creator name<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Amara Mensah" autoComplete="name" /></label><label>Store username<input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="amara_creates" autoComplete="username" /><small>Your public link will be /creator/{username || "username"}</small></label></>}
          <label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>Password<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === "signin" ? "current-password" : "new-password"} /></label>
          {authMessage && <p className="form-message" role="status">{authMessage}</p>}<button className="button button-dark auth-submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}</button>
        </form><button className="auth-switch" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? "New to KoliCreator? Create an account" : "Already have an account? Sign in"}</button><p className="sandbox-note"><ShieldCheck size={14} />PayPal checkout runs in sandbox. No card data is stored here.</p></div></section>
    </main>
  );

  return (
    <main className="workspace">
      <aside className="rail"><a className="brand" href="#home"><span className="brand-mark">k.</span><span>KoliCreator</span></a><nav className="nav" aria-label="Main navigation"><a className="nav-link active" href="#overview"><BarChart3 size={18} />Overview</a><a className="nav-link" href="#storefront"><Store size={18} />Storefront</a><a className="nav-link" href="#connect"><Share2 size={18} />Share & connect</a><a className="nav-link" href="#agent"><Sparkles size={18} />Revenue agent</a></nav><div className="rail-footer"><span className="avatar">{profile?.display_name.slice(0, 1).toUpperCase() ?? "C"}</span><div><strong>{profile?.display_name ?? "Creator"}</strong><small>@{profile?.username}</small></div><button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={16} /></button></div></aside>
      <section className="content" id="home"><header className="topbar"><div className="crumb">Workspace <span>/</span> Overview</div><div className="top-actions"><span className="sandbox"><i />Sandbox demo</span><button className="avatar avatar-small" aria-label="Creator account">{profile?.display_name.slice(0, 1).toUpperCase() ?? "C"}</button></div></header>
        <div className="page-body" id="overview">
          <section className="welcome-row"><div><p className="eyebrow">YOUR CREATOR WORKSPACE</p><h1>{profile ? `Good to see you, ${profile.display_name.split(" ")[0]}.` : "Your work, earning more."}</h1><p className="subhead">Completed PayPal sandbox captures only. No simulated earnings are included.</p></div><button className="button button-dark" onClick={() => setProductFormOpen(!productFormOpen)}><Plus size={17} /> Create an offer</button></section>
          {!onboardingDismissed && <section className="onboarding-panel" aria-labelledby="onboarding-heading"><div className="onboarding-heading"><div><p className="eyebrow">GETTING STARTED · {completedOnboardingSteps} OF {onboardingSteps.length}</p><h2 id="onboarding-heading">Set up your creator storefront</h2></div><button type="button" className="icon-button" aria-label="Dismiss getting started" onClick={dismissOnboarding}><X size={16} /></button></div><ol className="onboarding-steps">{onboardingSteps.map((step) => <li key={step.label} className={step.complete ? "onboarding-step is-complete" : "onboarding-step"}><span className="onboarding-check">{step.complete ? <Check size={15} /> : null}</span><span>{step.label}</span>{step.complete ? <span className="onboarding-state">Done</span> : step.href ? <a className="text-button" href={step.href}>{step.action} <span aria-hidden="true">→</span></a> : <button className="text-button" type="button" onClick={() => { setProductFormOpen(true); document.getElementById("storefront")?.scrollIntoView({ behavior: "smooth" }); }}>{step.action} <span aria-hidden="true">→</span></button>}</li>)}</ol></section>}
          {pageError && <p className="workspace-alert" role="alert">{pageError}</p>}
          {productFormOpen && (
            <form className="product-form panel" onSubmit={createProduct}>
              <div className="panel-heading">
                <div><p className="eyebrow">NEW STOREFRONT OFFER</p><h2>Publish a product</h2></div>
                <button type="button" className="text-button" onClick={() => setProductFormOpen(false)}>Close</button>
              </div>
              <div className="product-form-fields">
                <label>Product name<input required minLength={2} maxLength={100} value={productTitle} onChange={(event) => setProductTitle(event.target.value)} /></label>
                <label>Price<input required type="number" min="1" max="100000" step="0.01" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} /></label>
                <label>Currency<select value={productCurrency} onChange={(event) => setProductCurrency(event.target.value as (typeof supportedCurrencies)[number])}>{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
                <label className="wide-field">Description<textarea required maxLength={1000} rows={3} value={productDescription} onChange={(event) => setProductDescription(event.target.value)} /></label>
                <label className="wide-field">Cover image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setProductImage(event.target.files?.[0] ?? null)} /><small>Optional; PNG, JPEG or WebP, up to 5 MB.</small></label>
                <label className="wide-field">Digital product file<input required type="file" accept=".pdf,.epub,.zip,.mp3,.m4a,.mp4,application/pdf,application/epub+zip,application/zip,audio/mpeg,audio/mp4,video/mp4" onChange={(event) => setProductFile(event.target.files?.[0] ?? null)} /><small>Required for checkout; PDF, EPUB, ZIP, MP3, M4A or MP4, up to 50 MB. Buyers receive a short-lived download link after verified payment.</small></label>
              </div>
              <button className="button button-dark" disabled={productBusy}>{productBusy ? "Publishing…" : "Publish offer"}</button>
            </form>
          )}

          <section className="stat-grid" aria-label="Verified revenue summary">
            <article className="stat-card stat-primary"><div className="stat-top"><span>Captured gross</span><span className="stat-icon"><WalletCards size={17} /></span></div><strong className="stat-value currency-breakdown">{displayCurrencyTotals((amounts) => amounts.grossCents)}</strong><div className="stat-foot"><span className="muted-label">{completedCount} verified captures</span></div><div className="stat-note">Includes captures later refunded</div></article>
            <article className="stat-card"><div className="stat-top"><span>Retained after refunds</span><span className="stat-icon"><BarChart3 size={17} /></span></div><strong className="stat-value currency-breakdown">{displayCurrencyTotals((amounts) => amounts.grossCents - amounts.refundedCents)}</strong><div className="stat-foot"><span className="muted-label">Before estimated fee</span></div><div className="stat-note">Refund amounts are verified separately</div></article>
            <article className="stat-card"><div className="stat-top"><span>Estimated after fee</span><span className="stat-icon"><WalletCards size={17} /></span></div><strong className="stat-value currency-breakdown">{displayCurrencyTotals((amounts) => Math.round((amounts.grossCents - amounts.refundedCents) * (1 - feeRate)))}</strong><div className="stat-foot"><span className="muted-label">Assumes {(feeRate * 100).toFixed(1)}% after refunds</span></div><div className="stat-note">Planning estimate, not payout statement</div></article>
          </section>

          <section className="middle-grid"><article className="panel revenue-panel"><div className="panel-heading"><div><p className="eyebrow">FILTERED CHECKOUTS · PER-CURRENCY TOTALS</p><h2>Revenue summary</h2></div><span className="verified-label"><ShieldCheck size={14} /> Verified events</span></div><div className="stream-list"><div className="stream-row"><span className="stream-dot" /><span className="stream-label">Product captures</span><strong>{displayCurrencyTotals((amounts) => amounts.grossCents - amounts.tipsCents)}</strong><span className="change positive"><ArrowUpRight size={14} />{productCount}</span></div><div className="stream-row"><span className="stream-dot tip-dot" /><span className="stream-label">Tip captures</span><strong>{displayCurrencyTotals((amounts) => amounts.tipsCents)}</strong><span className="change positive"><ArrowDownRight size={14} />{tipCount}</span></div><div className="stream-row"><span className="stream-dot refund-dot" /><span className="stream-label">Refunded captures</span><strong>{displayCurrencyTotals((amounts) => amounts.refundedCents)}</strong><span className="change negative"><ArrowDownRight size={14} />{refundCount}</span></div></div><div className="revenue-caption"><span>Fee estimate is configurable and not a PayPal fee quote.</span><a className="text-button" href="#transactions">View transactions <span>→</span></a></div></article>
            <article className="agent-card insight-card"><div className="agent-content"><div className="agent-label"><Sparkles size={15} /> TRANSACTION INSIGHT</div><h2>Learn from what<br />supporters chose.</h2><p>{insight || "Ask AI for a next step based on your recent verified sales and refunds."}</p><button className="agent-button" onClick={generateInsight} disabled={insightBusy}>{insightBusy ? "Working…" : "Generate insight"}<span>↗</span></button><small>Refreshes from six months of verified history; no extra AI memory is saved</small></div><div className="agent-spark"><Sparkles size={24} /></div></article></section>

          <section className="panel offers-panel" id="storefront">
            <div className="panel-heading"><div><p className="eyebrow">STORE PERFORMANCE</p><h2>Your offers</h2></div><a className="text-button" href={profile ? `/creator/${profile.username}` : "#storefront"} target="_blank" rel="noreferrer">Open storefront <span>↗</span></a></div>
            <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>PRICE</th><th>SALES</th><th>STATUS</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><span className="product-art art-green">{product.title.slice(0, 1).toUpperCase()}</span><span className="product-cell"><strong>{product.title}</strong><small>{product.kind === "digital_product" ? "Digital product" : "Paid offer"}</small></span></td><td>{estimateMoney(product.price_cents, product.currency)}</td><td>{productSalesSummary.filter((summary) => summary.product_id === product.id).reduce((total, summary) => total + summary.capture_count, 0)}</td><td><span className={product.is_published ? "status-live" : "status-draft"}><i />{product.is_published ? "Live" : "Draft"}</span></td></tr>)}</tbody></table>{!products.length && <p className="empty-state">Your storefront is ready. Publish your first offer to get started.</p>}</div>
            <div className="store-share"><span>Your public storefront</span><code>{typeof window === "undefined" || !profile ? "" : `${window.location.origin}/creator/${profile.username}`}</code><button className="text-button" onClick={() => profile && void navigator.clipboard.writeText(`${window.location.origin}/creator/${profile.username}`)}>Copy link</button></div>
          </section>

          <section className="panel offer-management-panel">
            <div className="panel-heading"><div><p className="eyebrow">OFFER CONTROLS</p><h2>Edit or pause offers</h2></div></div>
            <div className="offer-management-list">
              {products.map((product) => (
                <article className="offer-management-row" key={product.id}>
                  <div className="offer-management-summary">
                    <div><strong>{product.title}</strong><small>{product.has_delivery_file ? "Digital file attached" : "Digital file required before checkout"}</small></div>
                    <span className={product.is_published ? "status-live" : "status-draft"}><i />{product.is_published ? "Live" : "Paused"}</span>
                    <div className="offer-management-actions">
                      <button className="text-button" type="button" onClick={() => editingProductId === product.id ? setEditingProductId(null) : beginProductEdit(product)}>{editingProductId === product.id ? "Close editor" : "Edit details"}</button>
                      <button className="text-button" type="button" disabled={savingProductId === product.id || (!product.is_published && !product.has_delivery_file)} onClick={() => void toggleProductPublished(product)}>{savingProductId === product.id ? "Saving…" : product.is_published ? "Pause offer" : "Publish offer"}</button>
                    </div>
                  </div>
                  {editingProductId === product.id && (
                    <form className="offer-edit-form" onSubmit={saveProductEdits}>
                      <label>Product name<input required minLength={2} maxLength={100} value={editProductTitle} onChange={(event) => setEditProductTitle(event.target.value)} /></label>
                      <label>Price<input required type="number" min="1" max="100000" step="0.01" value={editProductPrice} onChange={(event) => setEditProductPrice(event.target.value)} /></label>
                      <label>Currency<select value={editProductCurrency} onChange={(event) => setEditProductCurrency(event.target.value as (typeof supportedCurrencies)[number])}>{supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
                      <label className="wide-field">Description<textarea maxLength={1000} rows={2} value={editProductDescription} onChange={(event) => setEditProductDescription(event.target.value)} /></label>
                      <button className="button button-dark" disabled={savingProductId === product.id}>{savingProductId === product.id ? "Saving…" : "Save changes"}</button>
                    </form>
                  )}
                </article>
              ))}
              {!products.length && <p className="empty-state">Publish your first offer to manage its details and storefront status here.</p>}
            </div>
          </section>

          <section className="panel creator-social-panel" id="connect">
            <div className="panel-heading"><div><p className="eyebrow">MEET YOUR AUDIENCE WHERE THEY ARE</p><h2>Share & connect</h2></div><Share2 size={19} /></div>
            <p className="creator-social-intro">Keep creating and building your audience on the platforms you already use. Add your profile links so supporters can find you, then share one KoliCreator page for offers and checkout. No account connection or automatic posting required.</p>
            <form className="creator-social-form" onSubmit={saveSocialLinks}>
              {socialPlatforms.map((platform) => <label key={platform.key}>{platform.label} profile link<input type="url" inputMode="url" placeholder={`https://${platform.key === "x" ? "x.com" : platform.key === "website" ? "your-site.com" : `${platform.key}.com`}/…`} value={socialLinks[platform.key] ?? ""} onChange={(event) => setSocialLinks((current) => ({ ...current, [platform.key]: event.target.value }))} /></label>)}
              <button className="button button-dark" disabled={socialBusy}>{socialBusy ? "Saving…" : "Save profile links"}</button>
            </form>
            {socialMessage && <p className="creator-social-message" role="status">{socialMessage}</p>}
            {profile && <CreatorShare path={`/creator/${profile.username}`} username={profile.username} />}
          </section>

          <section className="panel saved-plans-panel" aria-labelledby="saved-plans-heading">
            <div className="panel-heading"><div><p className="eyebrow">REVENUE AGENT HISTORY</p><h2 id="saved-plans-heading">Saved plans</h2></div></div>
            {savedPlans.length ? (
              <div className="saved-plan-controls">
                <label>Plan<select value={plan?.id ?? ""} onChange={(event) => setPlan(savedPlans.find((savedPlan) => savedPlan.id === event.target.value) ?? null)}>{savedPlans.map((savedPlan) => <option key={savedPlan.id} value={savedPlan.id}>{new Date(savedPlan.createdAt).toLocaleDateString()} · {savedPlan.status} · {estimateMoney(savedPlan.revenueGapCents)} gap</option>)}</select></label>
                {plan && <label>Status<select value={plan.status} onChange={(event) => setPlan({ ...plan, status: event.target.value as Plan["status"] })}><option value="draft">Draft</option><option value="testing">Testing</option><option value="completed">Completed</option></select></label>}
                <button className="button button-dark" type="button" disabled={!plan || planBusy} onClick={() => void savePlan()}>{planBusy ? "Saving…" : "Save plan changes"}</button>
              </div>
            ) : <p className="empty-state">Generated plans are saved here so you can return to them and track experiments.</p>}
          </section>

          <section className="panel transactions-panel" id="transactions">
            <div className="panel-heading"><div><p className="eyebrow">PAYPAL SANDBOX</p><h2>Transaction activity</h2></div><span className="verified-label"><ShieldCheck size={14} /> Server-verified captures</span></div>
            <div className="transaction-filters"><label>Period<select value={periodFilter} onChange={(event) => { setPeriodFilter(event.target.value); setTransactionPage(0); }}><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option></select></label><label>Offer<select value={productFilter} onChange={(event) => { setProductFilter(event.target.value); setTransactionPage(0); }}><option value="all">All offers</option><option value="tips">Tips</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label></div>
            {transactionError && <p className="workspace-alert" role="alert">{transactionError}</p>}
            {transactionsLoading ? <p className="empty-state">Loading transactions…</p> : visibleTransactions.length ? <TransactionsGrid rows={visibleTransactions} locale={locale} /> : <p className="empty-state">No transactions match these filters. Completed PayPal captures only; browser redirects never count as paid.</p>}
            {transactionTotalCount > 0 && <nav className="transaction-pagination" aria-label="Transaction pages"><span>Showing {transactionPage * 25 + 1}–{Math.min((transactionPage + 1) * 25, transactionTotalCount)} of {transactionTotalCount}</span><div><button className="button button-light" type="button" disabled={transactionPage === 0 || transactionsLoading} onClick={() => setTransactionPage((page) => Math.max(0, page - 1))}>Previous</button><span>Page {transactionPage + 1} of {Math.ceil(transactionTotalCount / 25)}</span><button className="button button-light" type="button" disabled={(transactionPage + 1) * 25 >= transactionTotalCount || transactionsLoading} onClick={() => setTransactionPage((page) => page + 1)}>Next</button></div></nav>}
          </section>

          <section className="agent-workspace panel" id="agent"><div className="agent-workspace-heading"><div><p className="eyebrow">AI REVENUE AGENT + CAMPAIGN STUDIO</p><h2>Find a next move that fits your numbers.</h2><p>Your estimates are combined with six months of verified sales/refunds and your product catalogue. The agent does not access or invent private audience analytics.</p></div><span className="ai-symbol"><Sparkles size={22} /></span></div><form className="metrics-form" onSubmit={generatePlan}><label>Audience size<input type="number" min="0" value={metrics.audienceSize} onChange={(event) => updateMetric("audienceSize", event.target.value)} /></label><label>Monthly views<input type="number" min="0" value={metrics.monthlyViews} onChange={(event) => updateMetric("monthlyViews", event.target.value)} /></label><label>Current monthly revenue (USD)<input type="number" min="0" step="0.01" value={(metrics.currentMonthlyRevenueCents / 100).toFixed(2)} onChange={(event) => updateMetric("currentMonthlyRevenueCents", String(Math.round(Number(event.target.value) * 100)))} /></label><label>Monthly target (USD)<input type="number" min="1" step="0.01" value={(metrics.monthlyTargetCents / 100).toFixed(2)} onChange={(event) => updateMetric("monthlyTargetCents", String(Math.round(Number(event.target.value) * 100)))} /></label><label className="wide-field">Existing products<textarea rows={2} value={metrics.existingProducts} onChange={(event) => updateMetric("existingProducts", event.target.value)} placeholder="Describe current products, or leave blank" /></label><p className="metrics-disclaimer">Creator-reported inputs only. Sales quantities are arithmetic scenarios, not forecasts or guarantees.</p><button className="button button-dark" disabled={planBusy}><Sparkles size={16} />{planBusy ? "Building your plan…" : "Generate monetisation plan"}</button>{aiError && <p className="workspace-alert" role="alert">{aiError}</p>}</form>
            {plan && <div className="plan-results"><div className="plan-summary"><strong>Target gap: {estimateMoney(plan.revenueGapCents)}</strong><span>AI suggestions are drafts. Review and edit before publishing.</span></div><div className="strategy-grid">{plan.strategies.map((strategy, index) => <article key={`${strategy.title}-${index}`}><span className="eyebrow">STRATEGY {index + 1}</span><h3>{strategy.title}</h3><p>{strategy.rationale}</p></article>)}</div><h3 className="result-section-title">Product ideas</h3><div className="idea-list">{plan.productIdeas.map((idea, index) => <article className="idea-card" key={`${idea.title}-${index}`}><label>Product name<input minLength={2} maxLength={100} value={idea.title} onChange={(event) => setPlan({ ...plan, productIdeas: plan.productIdeas.map((candidate, item) => item === index ? { ...candidate, title: event.target.value } : candidate) })} /></label><label>Price in USD<input type="number" min="1" max="100000" step="0.01" value={(idea.recommendedPriceCents / 100).toFixed(2)} onChange={(event) => setPlan({ ...plan, productIdeas: plan.productIdeas.map((candidate, item) => item === index ? { ...candidate, recommendedPriceCents: Math.round(Number(event.target.value) * 100) } : candidate) })} /></label><label className="wide-field">Description<textarea rows={2} maxLength={1000} value={idea.description} onChange={(event) => setPlan({ ...plan, productIdeas: plan.productIdeas.map((candidate, item) => item === index ? { ...candidate, description: event.target.value } : candidate) })} /></label><p className="idea-math">At this price: {Math.ceil(plan.revenueGapCents / Math.max(100, idea.recommendedPriceCents))} sales to cover the target gap. This is arithmetic, not a sales forecast.</p><button className="button button-dark" disabled={productBusy} onClick={() => void publishIdea(idea)}><Plus size={15} /> Publish this edited offer</button></article>)}</div><h3 className="result-section-title">Campaign Studio</h3><p className="campaign-disclaimer">Edit or copy the draft messages. Nothing is published automatically.</p><div className="campaign-list">{plan.campaignPosts.map((post, index) => <article key={`${post.channel}-${index}`}><label>{post.channel}<textarea rows={4} value={post.copy} onChange={(event) => setPlan({ ...plan, campaignPosts: plan.campaignPosts.map((candidate, item) => item === index ? { ...candidate, copy: event.target.value } : candidate) })} /></label><button className="text-button" onClick={() => void copyCampaign(post.copy)}>Copy draft</button></article>)}</div><h3 className="result-section-title">Launch plan</h3><ol className="launch-list">{plan.launchPlan.map((step, index) => <li key={index}>{step}</li>)}</ol><details className="assumptions"><summary>Assumptions & uncertainty</summary><ul>{plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul><p>Audience and revenue metrics were entered by you and are not independently verified. Demand, conversion, taxes, payment processing fees, and delivery costs are not represented in the sales quantity calculation.</p></details></div>}
          </section>
          <footer className="page-footer"><span>Sandbox transactions are for demonstration only. No creator payouts are implemented.</span><span>Built for creators, wherever your audience lives.</span></footer>
        </div>
      </section>
    </main>
  );
}