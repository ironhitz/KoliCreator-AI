"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Copy, Download, QrCode, Share2 } from "lucide-react";

type Props = { path: string; username: string; compact?: boolean };

export function CreatorShare({ path, username, compact = false }: Props) {
  const [url, setUrl] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const publicUrl = new URL(path, window.location.origin).toString();
    let active = true;
    setUrl(publicUrl);
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(publicUrl, { width: 320, margin: 2, errorCorrectionLevel: "H" }))
      .then((image) => {
        if (active) setQrImage(image);
      })
      .catch(() => {
        if (active) setError("Could not create the QR code on this device.");
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the link. You can select and copy it manually.");
    }
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: `${username}'s creator page`, url });
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name !== "AbortError") {
        setError("Could not open your device's share menu.");
      }
    }
  }

  return (
    <div className={`creator-share${compact ? " creator-share-compact" : ""}`}>
      <div className="creator-share-copy">
        <p className="eyebrow"><QrCode size={14} /> ONE LINK, EVERYWHERE</p>
        <h3>Share your creator page</h3>
        <p>Use the same page from your social bios, posts, messages, or printed materials. Your audience can browse offers and check out here.</p>
        {url && <label className="creator-share-url">Public link<input readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label>}
        <div className="creator-share-actions">
          <button className="button button-dark" type="button" onClick={() => void shareLink()} disabled={!url}><Share2 size={15} /> Share</button>
          <button className="button button-light" type="button" onClick={() => void copyLink()} disabled={!url}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}</button>
          {qrImage && <a className="button button-light" href={qrImage} download={`${username}-creator-page-qr.png`}><Download size={15} /> Download QR</a>}
        </div>
        {error && <p className="creator-share-error" role="status">{error}</p>}
      </div>
      <div className="creator-qr">
        {qrImage ? <Image src={qrImage} alt={`QR code linking to ${username}'s creator page`} width={132} height={132} unoptimized /> : <span aria-label="Creating QR code"><QrCode size={34} /></span>}
        <small>Scan to open your page</small>
      </div>
    </div>
  );
}
