"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BarChart3, ExternalLink, LogOut, Plus, Share2, ShieldCheck, Sparkles, Store, WalletCards } from "lucide-react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { normalizeSocialUrl, sanitizeSocialLinks, socialPlatforms, type SocialLinks } from "@/lib/social-links";
import { CreatorShare } from "@/components/creator-share";
import { TransactionsGrid, type RevenueRow } from "@/components/transactions-grid";

type Profile = { id: string; username: string; display_name: string; bio: string; social_links: unknown };
type Product = { id: string; title: string; description: string; kind: string; price_cents: number; currency: string; is_published: boolean; cover_url: string | null };
type Recommendation = { title: string; description: string; recommendedPriceCents: number; requiredSales: number; targetGapCents: number };
type Plan = { strategies: Array<{ title: string; rationale: string }>; productIdeas: Recommendation[]; campaignPosts: Array<{ channel: string; copy: string }>; launchPlan: string[]; assumptions: string[]; revenueGapCents: number };
type Metrics = { audienceSize: number; monthlyViews: number; currentMonthlyRevenueCents: number; monthlyTargetCents: number; existingProducts: string };

async function loadCreatorData(client: SupabaseClient, userId: string) {
  const [profileResult, productResult, transactionResult] = await Promise.all([
    client.from("profiles").select("id,username,display_name,bio,social_links").eq("id", userId).maybeSingle(),
    client.from("products").select("id,title,description,kind,price_cents,currency,is_published,cover_url").eq("creator_id", userId).order("created_at", { ascending: false }),
    client.from("payment_transactions").select("id,product_id,amount_cents,refunded_amount_cents,currency,source,status,captured_at,paypal_capture_id").eq("creator_id", userId).order("captured_at", { ascending: false }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (productResult.error) throw productResult.error;
  if (transactionResult.error) throw transactionResult.error;
  const products = (productResult.data ?? []) as Product[];
  const productNames = new Map(products.map((product) => [product.id, product.title]));
  const transactions: RevenueRow[] = (transactionResult.data ?? []).map((transaction) => ({
    ...transaction,
    productId: transaction.product_id,
    product: transaction.product_id ? productNames.get(transaction.product_id) ?? "Creator offer" : "Creator tip",
  }));
  return { profile: profileResult.data as Profile | null, products, transactions };
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
  const [planBusy, setPlanBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [insight, setInsight] = useState("");
  const [insightBusy, setInsightBusy] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("12");
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productBusy, setProductBusy] = useState(false);

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
        setLoading(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function refreshWorkspace(supabase: SupabaseClient, user: User) {
    try {
      const data = await loadCreatorData(supabase, user.id);
      setProfile(data.profile);
      setSocialLinks(sanitizeSocialLinks(data.profile?.social_links));
      setProducts(data.products);
      setTransactions(data.transactions);
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
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Could not generate a plan.");
    } finally {
      setPlanBusy(false);
    }
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
    setProductBusy(true);
    let coverUrl: string | null = null;
    let uploadedPath: string | null = null;
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
    const { error } = await client.from("products").insert({ creator_id: profile.id, title: productTitle.trim(), description: productDescription.trim(), kind: "digital_product", price_cents: priceCents, currency: "USD", is_published: true, cover_url: coverUrl });
    if (error && uploadedPath) await client.storage.from("product-assets").remove([uploadedPath]);
    if (error) setPageError(error.message);
    else {
      setProductTitle("");
      setProductDescription("");
      setProductPrice("12");
      setProductImage(null);
      setProductFormOpen(false);
      await refreshWorkspace(client, { id: profile.id } as User);
    }
    setProductBusy(false);
  }

  async function copyCampaign(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const visibleTransactions = transactions.filter((transaction) => {
    const productMatches = productFilter === "all" || (productFilter === "tips" ? !transaction.productId : transaction.productId === productFilter);
    const days = Number(periodFilter.replace("d", ""));
    const periodMatches = periodFilter === "all" || new Date(transaction.captured_at).getTime() >= Date.now() - days * 86400000;
    return productMatches && periodMatches;
  });
  const completed = visibleTransactions.filter((transaction) => ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(transaction.status));
  const grossCents = completed.filter((transaction) => transaction.currency === "USD").reduce((total, transaction) => total + transaction.amount_cents, 0);
  const refundedCents = completed.filter((transaction) => transaction.currency === "USD").reduce((total, transaction) => total + transaction.refunded_amount_cents, 0);
  const tipsCents = completed.filter((transaction) => transaction.product === "Creator tip" && transaction.currency === "USD").reduce((total, transaction) => total + transaction.amount_cents, 0);
  const feeRate = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_RATE || 0.05);
  const estimateMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

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
          {pageError && <p className="workspace-alert" role="alert">{pageError}</p>}
          {productFormOpen && <form className="product-form panel" onSubmit={createProduct}><div className="panel-heading"><div><p className="eyebrow">NEW STOREFRONT OFFER</p><h2>Publish a product</h2></div><button type="button" className="text-button" onClick={() => setProductFormOpen(false)}>Close</button></div><div className="product-form-fields"><label>Product name<input required minLength={2} maxLength={100} value={productTitle} onChange={(event) => setProductTitle(event.target.value)} /></label><label>Price (USD)<input required type="number" min="1" max="100000" step="0.01" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} /></label><label className="wide-field">Description<textarea required maxLength={1000} rows={3} value={productDescription} onChange={(event) => setProductDescription(event.target.value)} /></label><label className="wide-field">Cover image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setProductImage(event.target.files?.[0] ?? null)} /><small>Optional; PNG, JPEG or WebP, up to 5 MB.</small></label></div><button className="button button-dark" disabled={productBusy}>{productBusy ? "Publishing…" : "Publish offer"}</button></form>}

          <section className="stat-grid" aria-label="Verified revenue summary"><article className="stat-card stat-primary"><div className="stat-top"><span>Verified gross sales</span><span className="stat-icon"><WalletCards size={17} /></span></div><strong className="stat-value">{estimateMoney(grossCents)}</strong><div className="stat-foot"><span className="muted-label">{completed.length} completed capture{completed.length === 1 ? "" : "s"}</span></div><div className="stat-note">PayPal sandbox, verified server-side</div></article><article className="stat-card"><div className="stat-top"><span>Completed sales</span><span className="stat-icon"><BarChart3 size={17} /></span></div><strong className="stat-value">{completed.length}</strong><div className="stat-foot"><span className="muted-label">Products and tips</span></div><div className="stat-note">Refunds shown separately</div></article><article className="stat-card"><div className="stat-top"><span>Estimated net</span><span className="stat-icon"><WalletCards size={17} /></span></div><strong className="stat-value">{estimateMoney(Math.round((grossCents - refundedCents) * (1 - feeRate)))}</strong><div className="stat-foot"><span className="muted-label">After refunds and assumed {(feeRate * 100).toFixed(1)}% fee</span></div><div className="stat-note">Planning estimate, not payout statement</div></article></section>

          <section className="middle-grid"><article className="panel revenue-panel"><div className="panel-heading"><div><p className="eyebrow">COMPLETED CHECKOUTS</p><h2>Revenue summary</h2></div><span className="verified-label"><ShieldCheck size={14} /> Verified events</span></div><div className="stream-list"><div className="stream-row"><span className="stream-dot" /><span className="stream-label">Product and offer sales</span><strong>{estimateMoney(grossCents - tipsCents)}</strong><span className="change positive"><ArrowUpRight size={14} />{completed.length - completed.filter((transaction) => transaction.product === "Creator tip").length}</span></div><div className="stream-row"><span className="stream-dot tip-dot" /><span className="stream-label">Tips & support</span><strong>{estimateMoney(tipsCents)}</strong><span className="change positive"><ArrowDownRight size={14} />{completed.filter((transaction) => transaction.product === "Creator tip").length}</span></div><div className="stream-row"><span className="stream-dot refund-dot" /><span className="stream-label">Verified refunds</span><strong>−{estimateMoney(refundedCents)}</strong><span className="change negative"><ArrowDownRight size={14} />{completed.filter((transaction) => transaction.refunded_amount_cents > 0).length}</span></div></div><div className="revenue-caption"><span>Fee estimate is configurable and not a PayPal fee quote.</span><a className="text-button" href="#transactions">View transactions <span>→</span></a></div></article>
            <article className="agent-card insight-card"><div className="agent-content"><div className="agent-label"><Sparkles size={15} /> TRANSACTION INSIGHT</div><h2>Learn from what<br />supporters chose.</h2><p>{insight || "Ask AI for a next step based on your recent verified sales and refunds."}</p><button className="agent-button" onClick={generateInsight} disabled={insightBusy}>{insightBusy ? "Working…" : "Generate insight"}<span>↗</span></button><small>Refreshes from six months of verified history; no extra AI memory is saved</small></div><div className="agent-spark"><Sparkles size={24} /></div></article></section>

          <section className="panel offers-panel" id="storefront"><div className="panel-heading"><div><p className="eyebrow">STORE PERFORMANCE</p><h2>Your offers</h2></div><a className="text-button" href={profile ? `/creator/${profile.username}` : "#storefront"} target="_blank" rel="noreferrer">Open storefront <span>↗</span></a></div><div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>PRICE</th><th>SALES</th><th>STATUS</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><span className="product-art art-green">{product.title.slice(0, 1).toUpperCase()}</span><span className="product-cell"><strong>{product.title}</strong><small>{product.kind === "digital_product" ? "Digital product" : "Paid offer"}</small></span></td><td>{new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency }).format(product.price_cents / 100)}</td><td>{completed.filter((transaction) => transaction.productId === product.id).length}</td><td><span className={product.is_published ? "status-live" : "status-draft"}><i />{product.is_published ? "Live" : "Draft"}</span></td></tr>)}</tbody></table>{!products.length && <p className="empty-state">Your storefront is ready. Publish your first offer to get started.</p>}</div><div className="store-share"><span>Your public storefront</span><code>{typeof window === "undefined" || !profile ? "" : `${window.location.origin}/creator/${profile.username}`}</code><button className="text-button" onClick={() => profile && void navigator.clipboard.writeText(`${window.location.origin}/creator/${profile.username}`)}>Copy link</button></div></section>

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

          <section className="panel transactions-panel" id="transactions"><div className="panel-heading"><div><p className="eyebrow">PAYPAL SANDBOX</p><h2>Transaction activity</h2></div><span className="verified-label"><ShieldCheck size={14} /> Server-verified captures</span></div><div className="transaction-filters"><label>Period<select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option></select></label><label>Offer<select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">All offers</option><option value="tips">Tips</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label></div>{visibleTransactions.length ? <TransactionsGrid rows={visibleTransactions} /> : <p className="empty-state">No transactions match these filters. Completed PayPal captures only; browser redirects never count as paid.</p>}</section>

          <section className="agent-workspace panel" id="agent"><div className="agent-workspace-heading"><div><p className="eyebrow">AI REVENUE AGENT + CAMPAIGN STUDIO</p><h2>Find a next move that fits your numbers.</h2><p>Your estimates are combined with six months of verified sales/refunds and your product catalogue. The agent does not access or invent private audience analytics.</p></div><span className="ai-symbol"><Sparkles size={22} /></span></div><form className="metrics-form" onSubmit={generatePlan}><label>Audience size<input type="number" min="0" value={metrics.audienceSize} onChange={(event) => updateMetric("audienceSize", event.target.value)} /></label><label>Monthly views<input type="number" min="0" value={metrics.monthlyViews} onChange={(event) => updateMetric("monthlyViews", event.target.value)} /></label><label>Current monthly revenue (USD)<input type="number" min="0" step="0.01" value={(metrics.currentMonthlyRevenueCents / 100).toFixed(2)} onChange={(event) => updateMetric("currentMonthlyRevenueCents", String(Math.round(Number(event.target.value) * 100)))} /></label><label>Monthly target (USD)<input type="number" min="1" step="0.01" value={(metrics.monthlyTargetCents / 100).toFixed(2)} onChange={(event) => updateMetric("monthlyTargetCents", String(Math.round(Number(event.target.value) * 100)))} /></label><label className="wide-field">Existing products<textarea rows={2} value={metrics.existingProducts} onChange={(event) => updateMetric("existingProducts", event.target.value)} placeholder="Describe current products, or leave blank" /></label><p className="metrics-disclaimer">Creator-reported inputs only. Sales quantities are arithmetic scenarios, not forecasts or guarantees.</p><button className="button button-dark" disabled={planBusy}><Sparkles size={16} />{planBusy ? "Building your plan…" : "Generate monetisation plan"}</button>{aiError && <p className="workspace-alert" role="alert">{aiError}</p>}</form>
            {plan && <div className="plan-results"><div className="plan-summary"><strong>Target gap: {estimateMoney(plan.revenueGapCents)}</strong><span>AI suggestions are drafts. Review and edit before publishing.</span></div><div className="strategy-grid">{plan.strategies.map((strategy, index) => <article key={`${strategy.title}-${index}`}><span className="eyebrow">STRATEGY {index + 1}</span><h3>{strategy.title}</h3><p>{strategy.rationale}</p></article>)}</div><h3 className="result-section-title">Product ideas</h3><div className="idea-list">{plan.productIdeas.map((idea, index) => <article className="idea-card" key={`${idea.title}-${index}`}><label>Product name<input minLength={2} maxLength={100} value={idea.title} onChange={(event) => setPlan({ ...plan, productIdeas: plan.productIdeas.map((candidate, item) => item === index ? { ...candidate, title: event.target.value } : candidate) })} /></label><label>Price in USD<input type="number" min="1" max="100000" step="0.01" value={(idea.recommendedPriceCents / 100).toFixed(2)} onChange={(event) => setPlan({ ...plan, productIdeas: plan.productIdeas.map((candidate, item) => item === index ? { ...candidate, recommendedPriceCents: Math.round(Number(event.target.value) * 100) } : candidate) })} /></label><label className="wide-field">Description<textarea rows={2} maxLength={1000} value={idea.description} onChange={(event) => setPlan({ ...plan, productIdeas: plan.productIdeas.map((candidate, item) => item === index ? { ...candidate, description: event.target.value } : candidate) })} /></label><p className="idea-math">At this price: {Math.ceil(plan.revenueGapCents / Math.max(100, idea.recommendedPriceCents))} sales to cover the target gap. This is arithmetic, not a sales forecast.</p><button className="button button-dark" disabled={productBusy} onClick={() => void publishIdea(idea)}><Plus size={15} /> Publish this edited offer</button></article>)}</div><h3 className="result-section-title">Campaign Studio</h3><p className="campaign-disclaimer">Edit or copy the draft messages. Nothing is published automatically.</p><div className="campaign-list">{plan.campaignPosts.map((post, index) => <article key={`${post.channel}-${index}`}><label>{post.channel}<textarea rows={4} value={post.copy} onChange={(event) => setPlan({ ...plan, campaignPosts: plan.campaignPosts.map((candidate, item) => item === index ? { ...candidate, copy: event.target.value } : candidate) })} /></label><button className="text-button" onClick={() => void copyCampaign(post.copy)}>Copy draft</button></article>)}</div><h3 className="result-section-title">Launch plan</h3><ol className="launch-list">{plan.launchPlan.map((step, index) => <li key={index}>{step}</li>)}</ol><details className="assumptions"><summary>Assumptions & uncertainty</summary><ul>{plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul><p>Audience and revenue metrics were entered by you and are not independently verified. Demand, conversion, taxes, payment processing fees, and delivery costs are not represented in the sales quantity calculation.</p></details></div>}
          </section>
          <footer className="page-footer"><span>Sandbox transactions are for demonstration only. No creator payouts are implemented.</span><span>Built for creators, wherever your audience lives.</span></footer>
        </div>
      </section>
    </main>
  );
}