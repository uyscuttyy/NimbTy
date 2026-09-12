"use client";
import { useEffect, useState } from "react";

export function ShareButtons({ publicId, title }: { publicId: string; title: string }) {
  const [copied, setCopied] = useState(false);
  // Origin is client-only: render the bare path (matches SSR) until mounted,
  // then upgrade to the absolute URL so shared links work everywhere.
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const path = `/n/${publicId}`;
  const url = `${origin}${path}`;
  const text = `${title} — bounty on NimbTy`;

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "NimbTy bounty", text, url }); } catch { /* dismissed */ }
      return;
    }
    await copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard denied */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const links = [
    { label: "Post to X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { label: "Discord", href: `https://discord.com/channels/@me` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={share} className="min-h-touch rounded-2xl bg-navy px-4 py-2 text-sm font-bold text-white">🔗 Share</button>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="min-h-touch rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-navy">
          {l.label}
        </a>
      ))}
      <button onClick={copy} className="min-h-touch rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-navy">
        {copied ? "✓ Copied!" : "Copy link"}
      </button>
    </div>
  );
}
