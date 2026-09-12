"use client";
import { useEffect, useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  // Legacy fallback: clipboard API needs a secure context (localhost/HTTPS),
  // which plain-LAN test URLs are not. execCommand works on plain HTTP.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ShareButtons({ publicId, title }: { publicId: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // Origin is client-only: render the bare path (matches SSR) until mounted,
  // then upgrade to the absolute URL so shared links work everywhere.
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const path = `/n/${publicId}`;
  const url = `${origin}${path}`;
  const text = `${title} (bounty on NimbTy)`;

  const doCopy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    setCopyFailed(!ok);
    setTimeout(() => { setCopied(false); setCopyFailed(false); }, 2500);
  };

  const systemShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "NimbTy bounty", text, url }); } catch { /* dismissed */ }
      setOpen(false);
    }
  };

  const links = [
    ...(typeof navigator !== "undefined" && "share" in navigator
      ? [{ label: "Share…", action: "system" as const }]
      : []),
    { label: "Post to X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { label: "Discord", href: `https://discord.com/channels/@me` },
    { label: "Copy link", action: "copy" as const },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-h-touch rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-navy"
      >
        Share
      </button>
      {open && (
        <>
          <button aria-label="Close share menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
          <div role="menu" className="absolute left-0 z-50 mt-1 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {links.map((l) =>
              "href" in l ? (
                <a
                  key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                  role="menuitem" onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-left text-sm font-bold text-navy hover:bg-slate-50"
                >
                  {l.label}
                </a>
              ) : (
                <button
                  key={l.label}
                  onClick={() => { if (l.action === "copy") doCopy(); else systemShare(); }}
                  role="menuitem"
                  className="block w-full px-4 py-2.5 text-left text-sm font-bold text-navy hover:bg-slate-50"
                >
                  {l.action === "copy"
                    ? copied ? "Copied!" : copyFailed ? "Copy failed, long-press the URL" : "Copy link"
                    : l.label}
                </button>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
