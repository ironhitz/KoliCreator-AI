import { notFound } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CreatorShare } from "@/components/creator-share";
import { sanitizeSocialLinks, socialPlatforms } from "@/lib/social-links";

type Props = { params: Promise<{ username: string }> };

export default async function CreatorStorefront({ params }: Props) {
  const { username } = await params;
  let profile;
  let products: Array<{ id: string; title: string; description: string; price_cents: number; currency: string; kind: string; cover_url: string | null }> = [];
  try {
    const admin = getSupabaseAdmin();
    const result = await admin.from("profiles").select("id,username,display_name,bio,social_links").eq("username", username).maybeSingle();
    profile = result.data;
    if (profile) {
      const productResult = await admin.from("products").select("id,title,description,price_cents,currency,kind,cover_url").eq("creator_id", profile.id).eq("is_published", true).order("created_at", { ascending: false });
      products = productResult.data ?? [];
    }
  } catch {
    notFound();
  }
  if (!profile) notFound();
  const socialLinks = sanitizeSocialLinks(profile.social_links);

  return (
    <main className="storefront-page">
      <header className="storefront-header"><Link href="/" className="storefront-brand"><span className="brand-mark">k.</span>KoliCreator</Link><span>Creator storefront</span></header>
      <section className="store-hero"><span className="store-avatar">{profile.display_name.slice(0, 1).toUpperCase()}</span><p className="eyebrow">CREATOR STORE</p><h1>{profile.display_name}</h1><p>{profile.bio || "Independent creator sharing useful work with the world."}</p><span className="store-handle">@{profile.username}</span>{Object.keys(socialLinks).length > 0 && <nav className="store-social-links" aria-label={`${profile.display_name}'s social profiles`}>{socialPlatforms.filter((platform) => socialLinks[platform.key]).map((platform) => <a key={platform.key} href={socialLinks[platform.key]} target="_blank" rel="noopener noreferrer"><Link2 size={14} />{platform.label}<span className="sr-only"> (opens in a new tab)</span></a>)}</nav>}</section>
      <section className="store-products"><div className="store-section-heading"><div><p className="eyebrow">MADE WITH CARE</p><h2>Explore offers</h2></div><span>{products?.length ?? 0} offers</span></div>
        {products.length ? <div className="store-product-grid">{products.map((product) => <article className="store-product" key={product.id}>{product.cover_url && <div className="store-cover" role="img" aria-label={`${product.title} cover`} style={{ backgroundImage: `url("${product.cover_url.replaceAll('"', "")}")` }} />}<span className="store-product-kind">{product.kind === "digital_product" ? "DIGITAL PRODUCT" : "PAID OFFER"}</span><h3>{product.title}</h3><p>{product.description}</p><div className="store-product-bottom"><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency }).format(product.price_cents / 100)}</strong><CheckoutButton username={username} productId={product.id} label="Get this offer" /></div></article>)}</div> : <p className="store-empty">No published offers yet.</p>}
        <article className="tip-row"><div><span className="store-product-kind">SUPPORT THE CREATOR</span><h3>Enjoying the work?</h3><p>Leave a small tip to support what comes next.</p></div><div className="tip-options"><CheckoutButton username={username} tipAmountCents={500} label="Tip $5" /><CheckoutButton username={username} tipAmountCents={1000} label="Tip $10" /></div></article>
      </section>
      <section className="store-share-section"><CreatorShare path={`/creator/${profile.username}`} username={profile.username} compact /></section>
      <footer className="store-footer">Payments are processed in PayPal sandbox for this hackathon demo. No real money moves.</footer>
    </main>
  );
}