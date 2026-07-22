// build-pages.js - generates every HTML page, sitemap.xml, robots.txt, llms.txt
// Run: npm run build:pages
// Brand rules: no em dashes anywhere, honest copy only, real claims only.

const fs = require("fs");
const path = require("path");

const pub = path.join(__dirname, "..", "public");
const learnDir = path.join(pub, "learn");
fs.mkdirSync(learnDir, { recursive: true });

const SITE = "https://getimagepress.com";
const V = "20260721a"; // cache-bust version: bump on every asset change
const TODAY = "2026-07-21";

// ============================================
// SHARED CHROME
// ============================================
const brandSvg = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10.2" r="1.7" fill="currentColor"/><path d="M5.2 16.6l4.3-4.3 3.1 3.1 3.4-3.4 2.8 2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const header = `<header class="site-header"><div class="wrap nav"><a class="brand" href="/"><span class="brand-mark">${brandSvg}</span><span>getIMAGEpress</span></a><nav class="nav-links"><a href="/heic-to-jpg">HEIC to JPG</a><a href="/webp-to-jpg">WebP to JPG</a><a href="/compress-image-to-200kb">200KB</a><a href="/compress-image-to-100kb">100KB</a><a href="/learn">Learn</a></nav></div></header>`;

const footer = `<footer class="site-footer"><div class="wrap footer-grid"><div><a class="brand" href="/"><span class="brand-mark">${brandSvg}</span><span>getIMAGEpress</span></a><p class="small">Free image converter and compressor for iPhone photos, web formats, and strict upload limits. Files are processed temporarily and auto-delete within 30 minutes.</p></div><div><b>Convert</b><a href="/heic-to-jpg">HEIC to JPG</a><a href="/heic-to-png">HEIC to PNG</a><a href="/webp-to-jpg">WebP to JPG</a><a href="/jpg-to-webp">JPG to WebP</a><a href="/png-to-webp">PNG to WebP</a><a href="/svg-to-png">SVG to PNG</a><a href="/jpg-to-png">JPG to PNG</a><a href="/png-to-jpg">PNG to JPG</a></div><div><b>Compress</b><a href="/compress-image-to-200kb">Compress to 200KB</a><a href="/compress-image-to-100kb">Compress to 100KB</a><a href="/compress-image-to-50kb">Compress to 50KB</a></div><div><b>Company</b><a href="/learn">Learn</a><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a></div></div></footer>`;

function head(title, desc, pagePath, extraSchema) {
  const canonical = SITE + pagePath;
  const schemas = [
    { "@context": "https://schema.org", "@type": "WebApplication", "name": "getIMAGEpress", "url": SITE + "/", "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" } },
  ];
  if (extraSchema) schemas.push(extraSchema);
  const ld = schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${desc}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"><meta property="og:image" content="${SITE}/og-imagepress.jpg"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/output.css?v=${V}">${ld}<script src="/ga.js?v=${V}" defer></script></head><body>`;
}

const trustPills = `<div class="trust-row"><span class="pill">🔒 TLS encrypted</span><span class="pill">🕒 Files auto-delete within 30 min</span><span class="pill">🚫 No signup, no watermarks</span><span class="pill">Honest results, real sizes</span></div>`;

// ============================================
// TOOL CARD
// ============================================
function toolCard({ mode, to, target, accept, btnLabel, note }) {
  const dataAttrs = mode === "convert"
    ? `data-tool="convert" data-to="${to}"`
    : `data-tool="compress" data-target="${target}"`;
  const targetNote = mode === "compress"
    ? `<p class="small">Target: ${target}KB. Best effort: if ${target}KB is not reachable at a usable size, you get the smallest usable result and an honest message.</p>`
    : "";
  return `<div class="tool-card img-tool" ${dataAttrs}><div class="uploader"><div class="upload-icon">🖼️</div><h3>Choose or drop your image</h3><p class="small">${note || "Files upload to the getIMAGEpress server for processing, then auto-delete within 30 minutes. Do not upload images you are not allowed to process."}</p><p class="file-name small">No file selected</p><input class="file-input" type="file" accept="${accept}"></div>${targetNote}<button class="btn primary run-btn" type="button" disabled>${btnLabel}</button><div class="status"></div><div class="result"><div class="stats"><div class="stat"><span class="small">Original</span><strong class="original-size">0 KB</strong></div><div class="stat"><span class="small">Result</span><strong class="final-size">0 KB</strong></div><div class="stat"><span class="small">Change</span><strong class="saved-size">0%</strong></div></div><a class="btn primary download-link" href="#" onclick="window.getIMAGEpressDownloadComplete&&window.getIMAGEpressDownloadComplete()">Download image</a></div></div>`;
}

// ============================================
// TOOL GRID (shared "all tools" section)
// ============================================
const allTools = [
  ["/heic-to-jpg", "📱", "HEIC to JPG", "Open iPhone photos anywhere"],
  ["/heic-to-png", "🍏", "HEIC to PNG", "Lossless PNG from iPhone photos"],
  ["/webp-to-jpg", "🌐", "WebP to JPG", "Make WebP images universal"],
  ["/jpg-to-webp", "⚡", "JPG to WebP", "Smaller images for the web"],
  ["/png-to-webp", "🚀", "PNG to WebP", "Shrink PNGs for fast pages"],
  ["/svg-to-png", "✏️", "SVG to PNG", "Rasterize vector graphics"],
  ["/jpg-to-png", "🔄", "JPG to PNG", "JPG into lossless PNG"],
  ["/png-to-jpg", "📉", "PNG to JPG", "Smaller files from PNGs"],
  ["/compress-image-to-200kb", "🗜️", "Compress to 200KB", "For portals and forms"],
  ["/compress-image-to-100kb", "🎯", "Compress to 100KB", "For strict upload limits"],
  ["/compress-image-to-50kb", "🪶", "Compress to 50KB", "For the tightest limits"],
];

function toolsGrid(excludePath) {
  return `<div class="tool-grid">` + allTools
    .filter(t => t[0] !== excludePath)
    .map(([u, i, t, d]) => `<a class="tool-link" href="${u}"><span style="font-size:28px">${i}</span><b>${t}</b><span class="small">${d}</span></a>`)
    .join("") + `</div>`;
}

// ============================================
// FAQ SECTION with FAQPage JSON-LD
// ============================================
function faqSection(faqs) {
  if (!faqs || !faqs.length) return { html: "", schema: null };
  const html = `<section class="section"><div class="wrap"><h2>Frequently asked questions</h2><div class="grid cards-2" style="margin-top:18px">` +
    faqs.map(([q, a]) => `<details class="faq-item"><summary>${q}</summary><p>${a}</p></details>`).join("") +
    `</div></div></section>`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } })),
  };
  return { html, schema };
}

// ============================================
// TOOL PAGE BUILDER
// ============================================
function toolPage(def) {
  const { slug, title, desc, eyebrow, h1, lead, faqs, tips } = def;
  const pagePath = slug === "index" ? "/" : `/${slug}`;
  const { html: faqHtml, schema: faqSchema } = faqSection(faqs);
  let html = head(title, desc, pagePath, faqSchema) + header;
  html += `<main><section class="hero"><div class="wrap hero-grid"><div><span class="eyebrow">${eyebrow || "Free, honest image tools"}</span><h1 class="h1">${h1}</h1><p class="lead">${lead}</p>${trustPills}</div>${toolCard(def)}</div></section>`;
  html += `<section class="section"><div class="wrap"><h2>${slug === "index" ? "All image tools" : "More image tools"}</h2>${toolsGrid(pagePath)}</div></section>`;
  if (tips && tips.length) {
    html += `<section class="section"><div class="wrap grid cards-3">` + tips.map(([t, b]) => `<article class="card"><h3>${t}</h3><p>${b}</p></article>`).join("") + `</div></section>`;
  }
  html += faqHtml;
  html += `</main>${footer}<script src="/app.js?v=${V}" defer></script></body></html>`;
  const file = slug === "index" ? "index.html" : `${slug}.html`;
  fs.writeFileSync(path.join(pub, file), html);
  return pagePath;
}

// ============================================
// TOOL DEFINITIONS
// ============================================
const ACCEPT_HEIC = ".heic,.heif,image/heic,image/heif";
const commonConvertTips = [
  ["Privacy first", "Your image uploads over an encrypted connection, gets converted on our server, and auto-deletes within 30 minutes. We never add watermarks and never ask you to sign up."],
  ["Real sizes, no games", "Every result shows the actual before and after file size. Converting between formats can make files bigger or smaller depending on the content, and we show you the truth either way."],
  ["25MB limit", "Uploads are capped at 25MB per image. That covers photos from every current phone camera. If your file is larger, resize it first and try again."],
];

const pages = [];

// Home: HEIC to JPG is the hero tool (the traffic magnet)
pages.push(toolPage({
  slug: "index",
  title: "Free Image Converter: HEIC to JPG, WebP to JPG | getIMAGEpress",
  desc: "Convert HEIC, WebP, SVG, JPG, and PNG free. Compress images to 200KB, 100KB, or 50KB for upload forms. No signup, no watermarks, files auto-delete.",
  eyebrow: "Free, honest image tools",
  h1: "Convert and compress images, free",
  lead: "HEIC to JPG, WebP to JPG, SVG to PNG, and compression to real upload limits like 200KB or 100KB. No signup, no watermarks, no fake promises.",
  mode: "convert", to: "jpg",
  accept: ACCEPT_HEIC + ",.webp,.png,.jpg,.jpeg,.svg,.avif",
  btnLabel: "Convert to JPG",
  note: "Drop any HEIC, WebP, PNG, JPG, SVG, or AVIF file here to get a JPG back. Files auto-delete within 30 minutes.",
  tips: [
    ["Built for real upload forms", "Job portals, government forms, passport applications, and school systems reject oversized images every day. The compress tools target the exact sizes those forms ask for."],
    ["iPhone photos welcome", "iPhones shoot HEIC by default and half the internet cannot open it. HEIC to JPG is the fastest fix, and it runs on every file you drop here."],
    ["Nothing to install", "Everything runs in your browser plus our server. No app, no account, no watermark, and your files auto-delete within 30 minutes."],
  ],
  faqs: [
    ["Is getIMAGEpress really free?", "Yes. Every tool on this site is free with no signup, no watermarks, and no file limits beyond the 25MB per-image cap."],
    ["What happens to my images?", "They upload over an encrypted connection, get processed on our server, and auto-delete within 30 minutes. We do not view, share, or keep them."],
    ["Which formats can I convert?", "Input: HEIC, HEIF, AVIF, WebP, JPG, PNG, and SVG. Output: JPG, PNG, or WebP. The compress tools output JPG, which is what upload forms expect."],
    ["Why did my converted file get bigger?", "Some conversions genuinely increase file size. HEIC and WebP are more efficient than JPG, so converting them to JPG usually grows the file. We always show the real before and after sizes."],
  ],
}));

pages.push(toolPage({
  slug: "heic-to-jpg",
  title: "HEIC to JPG Converter Free | getIMAGEpress",
  desc: "Convert iPhone HEIC photos to JPG online free. Works on Windows, Mac, and Android. No signup, no watermarks, files auto-delete within 30 minutes.",
  eyebrow: "For iPhone photos",
  h1: "Convert HEIC to JPG",
  lead: "Turn iPhone HEIC photos into JPG files that open anywhere: Windows, Android, web forms, email, and older apps.",
  mode: "convert", to: "jpg",
  accept: ACCEPT_HEIC,
  btnLabel: "Convert to JPG",
  tips: commonConvertTips,
  faqs: [
    ["What is a HEIC file?", "HEIC is the High Efficiency Image Container format that iPhones use by default. It stores photos at roughly half the size of JPG with the same quality, but many websites, Windows apps, and upload forms cannot open it."],
    ["Will converting HEIC to JPG lose quality?", "A small amount, because JPG re-encodes the photo. We use quality 90, which looks identical to the original in normal viewing. Expect the JPG to be larger than the HEIC, since JPG compression is less efficient."],
    ["How do I stop my iPhone from shooting HEIC?", "Open Settings, tap Camera, tap Formats, and choose Most Compatible. New photos will save as JPG. Existing HEIC photos still need converting, which is what this tool is for."],
    ["Is this private?", "Yes. Files upload over TLS, get converted on our server, and auto-delete within 30 minutes. No signup, no watermarks, and we never look at your photos."],
  ],
}));

pages.push(toolPage({
  slug: "heic-to-png",
  title: "HEIC to PNG Converter Free | getIMAGEpress",
  desc: "Convert iPhone HEIC photos to lossless PNG online free. No signup, no watermarks, files auto-delete within 30 minutes.",
  eyebrow: "For iPhone photos",
  h1: "Convert HEIC to PNG",
  lead: "Turn iPhone HEIC photos into lossless PNG files for editing, transparency work, or tools that only accept PNG.",
  mode: "convert", to: "png",
  accept: ACCEPT_HEIC,
  btnLabel: "Convert to PNG",
  tips: commonConvertTips,
  faqs: [
    ["When should I pick PNG instead of JPG?", "Pick PNG when you plan to edit the image further, need transparency support, or a tool specifically requires PNG. For sharing photos or uploading to forms, JPG is smaller and more widely accepted."],
    ["Why is the PNG so much bigger than my HEIC?", "PNG is lossless, so a 2MB HEIC photo can become a 10MB or larger PNG. That is normal and expected. If file size matters, use HEIC to JPG instead."],
    ["Does this keep photo quality?", "Yes. PNG is lossless, so every pixel decoded from your HEIC is preserved exactly."],
  ],
}));

pages.push(toolPage({
  slug: "webp-to-jpg",
  title: "WebP to JPG Converter Free | getIMAGEpress",
  desc: "Convert WebP images to JPG online free. Fix images saved from websites that other apps cannot open. No signup, files auto-delete.",
  eyebrow: "For images saved from the web",
  h1: "Convert WebP to JPG",
  lead: "Saved an image from a website and nothing will open it? Convert WebP to JPG and use it anywhere.",
  mode: "convert", to: "jpg",
  accept: ".webp,image/webp",
  btnLabel: "Convert to JPG",
  tips: commonConvertTips,
  faqs: [
    ["Why do websites use WebP?", "WebP files are around 25 to 35 percent smaller than equivalent JPGs, so pages load faster. Browsers handle WebP fine, but plenty of desktop apps, upload forms, and older tools still reject it."],
    ["Will the JPG be bigger than the WebP?", "Usually yes, because WebP compresses more efficiently. We encode at quality 90 so the JPG looks the same as the WebP you started with."],
    ["Can I convert animated WebP?", "This tool converts the first frame only. Animated WebP to video or GIF is a different job that we do not currently support."],
  ],
}));

pages.push(toolPage({
  slug: "jpg-to-webp",
  title: "JPG to WebP Converter Free | getIMAGEpress",
  desc: "Convert JPG images to WebP online free for faster websites. Typically 25 to 35 percent smaller. No signup, files auto-delete.",
  eyebrow: "For faster websites",
  h1: "Convert JPG to WebP",
  lead: "Shrink JPG images into WebP for faster page loads and better Core Web Vitals. Same visible quality, smaller files.",
  mode: "convert", to: "webp",
  accept: ".jpg,.jpeg,image/jpeg",
  btnLabel: "Convert to WebP",
  tips: commonConvertTips,
  faqs: [
    ["How much smaller will my WebP be?", "Typically 25 to 35 percent smaller than the JPG at similar visible quality. We encode at quality 82, a sweet spot for web images. Your result shows the real numbers."],
    ["Where does WebP work?", "Every modern browser: Chrome, Safari, Firefox, and Edge all support WebP. Some email clients and desktop apps still do not, so keep JPGs for those."],
    ["Should I convert every image on my site?", "For content images, usually yes. Keep an original-format fallback if you support very old browsers, or use the picture element to serve both."],
  ],
}));

pages.push(toolPage({
  slug: "png-to-webp",
  title: "PNG to WebP Converter Free | getIMAGEpress",
  desc: "Convert PNG images to WebP online free. Big savings for screenshots and graphics. No signup, files auto-delete within 30 minutes.",
  eyebrow: "For faster websites",
  h1: "Convert PNG to WebP",
  lead: "PNG screenshots and graphics are often huge. WebP keeps them sharp at a fraction of the size, transparency included.",
  mode: "convert", to: "webp",
  accept: ".png,image/png",
  btnLabel: "Convert to WebP",
  tips: commonConvertTips,
  faqs: [
    ["Does WebP keep PNG transparency?", "Yes. WebP fully supports alpha transparency, so logos and UI graphics convert cleanly."],
    ["How much smaller will it be?", "Screenshots and flat graphics often shrink 60 to 80 percent. Detailed photos saved as PNG shrink even more. Your result shows the real before and after."],
    ["Is WebP lossy or lossless?", "It can be either. This tool uses high-quality lossy encoding at quality 82, which is visually clean for screenshots, graphics, and photos alike."],
  ],
}));

pages.push(toolPage({
  slug: "svg-to-png",
  title: "SVG to PNG Converter Free | getIMAGEpress",
  desc: "Convert SVG vector graphics to PNG online free. Clean rasterization with transparency. No signup, files auto-delete within 30 minutes.",
  eyebrow: "For vector graphics",
  h1: "Convert SVG to PNG",
  lead: "Turn SVG logos and icons into PNG images for apps, documents, and platforms that do not accept vectors.",
  mode: "convert", to: "png",
  accept: ".svg,image/svg+xml",
  btnLabel: "Convert to PNG",
  tips: [
    ["Rendered server-side, safely", "SVGs can contain scripts, so we never display your SVG in the browser. It is rasterized on the server, and SVGs containing scripts or event handlers are rejected outright."],
    ["Transparency preserved", "The PNG output keeps full alpha transparency, so logos drop cleanly onto any background."],
    ["Sharp at 1.5x scale", "We rasterize above the SVG's nominal size so output stays crisp. Text inside SVGs renders with standard fonts."],
  ],
  faqs: [
    ["What size PNG do I get?", "The PNG is rendered at about 1.5 times the SVG's declared size so it stays sharp. If your SVG declares 400 by 300, expect roughly 600 by 450 pixels."],
    ["Why was my SVG rejected?", "We reject SVGs containing script tags, event handlers, or XML entities, because those are the vectors for SVG-based attacks. Export a plain SVG from your design tool and it will convert fine."],
    ["Does text in my SVG render correctly?", "Text renders with standard server fonts. If your SVG uses a custom font, convert the text to outlines in your design tool first for a pixel-perfect match."],
  ],
}));

pages.push(toolPage({
  slug: "jpg-to-png",
  title: "JPG to PNG Converter Free | getIMAGEpress",
  desc: "Convert JPG images to lossless PNG online free. No signup, no watermarks, files auto-delete within 30 minutes.",
  eyebrow: "Format conversion",
  h1: "Convert JPG to PNG",
  lead: "Convert JPG photos into lossless PNG for editing pipelines and tools that require PNG input.",
  mode: "convert", to: "png",
  accept: ".jpg,.jpeg,image/jpeg",
  btnLabel: "Convert to PNG",
  tips: commonConvertTips,
  faqs: [
    ["Does JPG to PNG improve quality?", "No, and any tool that claims otherwise is lying. PNG preserves exactly what is in the JPG, including any compression artifacts already there. It stops future quality loss from re-saving, which is useful for editing."],
    ["Why is the PNG so much bigger?", "PNG is lossless, so photos routinely grow 5 to 10 times over the JPG size. That is expected. Use PNG when a tool requires it, not to save space."],
    ["When do I actually need PNG?", "Editing workflows, adding transparency later, or uploading to tools that only accept PNG. For everything else, JPG or WebP is the better choice."],
  ],
}));

pages.push(toolPage({
  slug: "png-to-jpg",
  title: "PNG to JPG Converter Free | getIMAGEpress",
  desc: "Convert PNG images to JPG online free. Much smaller files for photos and screenshots. No signup, files auto-delete within 30 minutes.",
  eyebrow: "Format conversion",
  h1: "Convert PNG to JPG",
  lead: "Shrink bulky PNG files into JPGs for sharing, email, and upload forms. Transparent areas become white.",
  mode: "convert", to: "jpg",
  accept: ".png,image/png",
  btnLabel: "Convert to JPG",
  tips: commonConvertTips,
  faqs: [
    ["What happens to transparency?", "JPG does not support transparency, so transparent areas are flattened onto a white background. If you need transparency kept, use PNG to WebP instead."],
    ["How much smaller will the JPG be?", "Photos saved as PNG often shrink 80 to 90 percent. Screenshots with lots of flat color shrink less but still meaningfully. We encode at quality 90."],
    ["Will text in screenshots stay readable?", "At quality 90, yes. JPG can slightly soften sharp edges of text. If a screenshot must stay pixel-perfect, keep it PNG or use PNG to WebP."],
  ],
}));

// Compress pages
function compressPage(target, extra) {
  const usedFor = { 200: "job portals, government forms, and application systems", 100: "passport photo uploads, visa applications, and strict web forms", 50: "the tightest upload limits: forums, avatars, and legacy systems" }[target];
  return toolPage({
    slug: `compress-image-to-${target}kb`,
    title: `Compress Image to ${target}KB Free | getIMAGEpress`,
    desc: `Compress JPG, PNG, WebP, or HEIC images to ${target}KB online free. Built for ${usedFor.split(",")[0]} and strict upload limits. Honest best-effort results.`,
    eyebrow: "Hit a real upload limit",
    h1: `Compress image to ${target}KB`,
    lead: `For ${usedFor}. We compress toward ${target}KB and tell you the truth about the result.`,
    mode: "compress", target: String(target),
    accept: ".jpg,.jpeg,.png,.webp," + ACCEPT_HEIC,
    btnLabel: `Compress to ${target}KB`,
    tips: [
      ["Closed-loop compression", `We encode, measure the real bytes, and retry at adjusted settings until your image fits ${target}KB or cannot go smaller at a usable size. No guessing, no fake success messages.`],
      ["Output is JPG", "Upload forms with size limits want JPG, so that is what you get, at the highest quality that fits the byte budget. Transparent areas become white."],
      ["Never a bigger file", "If your image is already at or under the target, or recompression would grow it, you get your original back unchanged with a clear message."],
    ],
    faqs: [
      [`Can every image reach ${target}KB?`, `Most photos can. Extremely detailed images may bottom out slightly above very small targets at usable dimensions. When that happens we return the smallest usable result and say so plainly, instead of pretending it worked.`],
      ["What quality will I get?", `The best quality that fits the byte budget. We search for the highest JPG quality that lands under ${target}KB, downscaling dimensions only when necessary (output is capped at 2400 pixels wide, plenty for any upload form).`],
      ["Which input formats work?", "JPG, PNG, WebP, and iPhone HEIC photos. Whatever you upload, the result comes back as a JPG under the target when reachable."],
      ...(extra || []),
    ],
  });
}
pages.push(compressPage(200));
pages.push(compressPage(100, [["Is 100KB enough for a passport photo upload?", "Yes for most systems. Passport and visa portals typically ask for 50KB to 300KB. Check your portal's exact requirement, then pick the matching tool: we have 50KB, 100KB, and 200KB targets."]]));
pages.push(compressPage(50));

// ============================================
// INFO PAGES
// ============================================
function infoPage(slug, title, desc, h1, bodyHtml) {
  const pagePath = `/${slug}`;
  let html = head(title, desc, pagePath) + header;
  html += `<main><section class="section"><div class="wrap" style="max-width:820px"><h1 class="h1" style="font-size:clamp(32px,5vw,52px)">${h1}</h1>${bodyHtml}</div></section></main>${footer}<script src="/app.js?v=${V}" defer></script></body></html>`;
  fs.writeFileSync(path.join(pub, `${slug}.html`), html);
  pages.push(pagePath);
}

infoPage("about", "About | getIMAGEpress", "What getIMAGEpress is, how it works, and the promises we make.", "About getIMAGEpress",
  `<p class="lead">getIMAGEpress is a free image converter and compressor built around one idea: tell users the truth.</p>
  <div class="card" style="margin-top:18px"><h3>What we promise</h3><ul class="checklist"><li>Real before and after file sizes on every result, even when a conversion makes the file bigger.</li><li>Best-effort targets, honestly reported. If your image cannot reach 50KB at a usable size, we say so.</li><li>Files auto-delete within 30 minutes. The cleanup job runs every 5 minutes and removes anything older than 25 minutes.</li><li>No signup, no watermarks, no fake urgency, no invented user counts.</li></ul></div>
  <div class="card" style="margin-top:18px"><h3>How it works</h3><p>Your image uploads over an encrypted connection to our server, where it is converted or compressed using the sharp image library (plus a WASM HEIC decoder for iPhone photos). The result streams straight back to your browser. Uploads are capped at 25MB.</p></div>
  <p style="margin-top:18px">getIMAGEpress is the sister site of <a href="https://getpdfpress.com">getPDFpress</a>, which does the same honest job for PDF files.</p>`);

infoPage("contact", "Contact | getIMAGEpress", "How to reach getIMAGEpress.", "Contact",
  `<p class="lead">Questions, bug reports, or a tool you wish existed? Email us.</p>
  <div class="card" style="margin-top:18px"><h3>Email</h3><p><a href="mailto:antwonterell@gmail.com">antwonterell@gmail.com</a></p><p class="small">We read everything. Bug reports with the original file size and the tool you used are the fastest to fix.</p></div>`);

infoPage("privacy", "Privacy Policy | getIMAGEpress", "What getIMAGEpress collects, what it does not, and how long files live.", "Privacy Policy",
  `<p class="small">Last updated: July 21, 2026</p>
  <div class="card" style="margin-top:18px"><h3>Your files</h3><p>Uploaded images are stored temporarily on our server only for processing. A cleanup job runs every 5 minutes and deletes any file older than 25 minutes, so every upload is gone within 30 minutes. We do not view, share, sell, or back up your files.</p></div>
  <div class="card" style="margin-top:18px"><h3>What we collect</h3><p>Standard server logs (IP address, request path, timestamp) for abuse prevention and debugging, retained briefly. We use Google Analytics 4 with IP anonymization to understand which tools people use. No accounts exist, so we hold no personal profiles.</p></div>
  <div class="card" style="margin-top:18px"><h3>Cookies</h3><p>We set no cookies ourselves. Google Analytics may set its own cookies; see Google's privacy documentation for details.</p></div>
  <div class="card" style="margin-top:18px"><h3>Contact</h3><p>Privacy questions: <a href="mailto:antwonterell@gmail.com">antwonterell@gmail.com</a></p></div>`);

infoPage("terms", "Terms of Service | getIMAGEpress", "The terms for using getIMAGEpress.", "Terms of Service",
  `<p class="small">Last updated: July 21, 2026</p>
  <div class="card" style="margin-top:18px"><h3>The service</h3><p>getIMAGEpress provides free, best-effort image conversion and compression. The service is provided as is, without warranties. Results depend on your input files, and exact size targets are not guaranteed.</p></div>
  <div class="card" style="margin-top:18px"><h3>Your responsibilities</h3><p>Only upload images you have the right to process. Do not upload malware, attempt to abuse the service, or use automated scripts to bulk-process files. Uploads are limited to 25MB per image and rate limits apply.</p></div>
  <div class="card" style="margin-top:18px"><h3>Liability</h3><p>We are not liable for lost files, missed deadlines, or damages arising from use of the service. Keep your originals: we never modify the file on your device.</p></div>`);

// 404
{
  let html = head("Page not found | getIMAGEpress", "That page does not exist, but the tools do.", "/404") + header;
  html += `<main><section class="hero"><div class="wrap"><span class="eyebrow">404</span><h1 class="h1">That page slipped out of frame</h1><p class="lead">The page you are looking for does not exist. These tools definitely do.</p><div class="hero-actions"><a class="btn primary" href="/heic-to-jpg">HEIC to JPG</a><a class="btn secondary" href="/compress-image-to-100kb">Compress to 100KB</a><a class="btn ghost" href="/">All tools</a></div></div></section></main>${footer}<script src="/app.js?v=${V}" defer></script></body></html>`;
  fs.writeFileSync(path.join(pub, "404.html"), html);
}

// ============================================
// LEARN ARTICLES
// ============================================
const articles = [];
function article(slug, title, desc, h1, sections, faqs) {
  const pagePath = `/learn/${slug}`;
  const toc = sections.map(([hid, htext]) => `<a href="#${hid}">${htext}</a>`).join("");
  const body = sections.map(([hid, htext, ...paras]) => `<h2 id="${hid}">${htext}</h2>` + paras.map(p => p.startsWith("<") ? p : `<p>${p}</p>`).join("")).join("");
  const articleSchema = {
    "@context": "https://schema.org", "@type": "Article", "headline": h1,
    "datePublished": TODAY, "dateModified": TODAY,
    "author": { "@type": "Organization", "name": "getIMAGEpress", "url": SITE + "/" },
    "publisher": { "@type": "Organization", "name": "getIMAGEpress" },
    "mainEntityOfPage": SITE + pagePath,
  };
  const { html: faqHtml, schema: faqSchema } = faqSection(faqs);
  let html = head(title, desc, pagePath, articleSchema) + (faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : "") + header;
  html += `<main><section class="article"><div class="wrap article-layout"><aside class="toc"><b class="small">On this page</b>${toc}</aside><article class="prose"><h1>${h1}</h1>${body}</article></div></section>${faqHtml}</main>${footer}<script src="/app.js?v=${V}" defer></script></body></html>`;
  fs.writeFileSync(path.join(learnDir, `${slug}.html`), html);
  articles.push({ slug, title: h1, desc });
  pages.push(pagePath);
}

article("why-are-my-iphone-photos-heic",
  "Why Are My iPhone Photos HEIC? | getIMAGEpress",
  "iPhones save photos as HEIC to halve storage use. Here is what HEIC is, why Windows struggles with it, and the fastest ways to get JPGs.",
  "Why are my iPhone photos HEIC files?",
  [
    ["what-is-heic", "What HEIC actually is",
      "Since iOS 11 in 2017, iPhones save photos in HEIC (High Efficiency Image Container) by default instead of JPG. HEIC uses the HEVC video codec's still-image mode to store a photo at roughly half the file size of an equivalent JPG, with the same visible quality.",
      "For Apple this is a clear win: your 128GB phone holds twice as many photos, iCloud syncs faster, and backups shrink. Inside the Apple ecosystem you never notice the format at all, because every Apple app reads HEIC natively."],
    ["why-it-breaks", "Why HEIC breaks everywhere else",
      "The problem starts the moment a HEIC file leaves Apple's world. Windows needs paid codec extensions to preview HEIC. Many websites, job portals, government upload forms, and older applications simply reject the format. Email a HEIC to someone on a Windows PC and there is a good chance they cannot open it.",
      "This is not your phone being broken and not the receiving computer being broken. It is a format licensing gap: the HEVC codec inside HEIC carries patent licensing costs that much of the software world declined to pay, so support stayed patchy."],
    ["fastest-fix", "The fastest fix: convert to JPG",
      "When a HEIC file will not open somewhere, convert it to JPG. JPG opens on effectively every device and website built since the 1990s.",
      `<p>Drop your photo into our free <a href="/heic-to-jpg">HEIC to JPG converter</a>. It decodes the HEIC on our server, re-encodes it as a quality-90 JPG, and hands it straight back. No signup, no watermark, and the file auto-deletes within 30 minutes. If you need lossless output for editing, <a href="/heic-to-png">HEIC to PNG</a> does the same job.</p>`,
      "Expect the JPG to be larger than the HEIC, usually 1.5 to 2 times. That is the price of compatibility: JPG's 1992-era compression cannot match HEVC."],
    ["stop-shooting-heic", "How to make your iPhone shoot JPG instead",
      "If you regularly send photos to Windows users or upload to picky forms, you can switch the camera to JPG permanently: open Settings, tap Camera, tap Formats, and choose Most Compatible instead of High Efficiency.",
      "The trade-off is real: JPG photos take roughly twice the storage. If space is tight, a better pattern is to leave the camera on High Efficiency and convert only the photos you actually need to share.",
      "One more trick: when you share via Mail or many apps, iOS often converts to JPG automatically. It is direct transfers (USB, AirDrop to a Mac, cloud drive sync) that hand over raw HEIC files."],
  ],
  [
    ["Does converting HEIC to JPG reduce quality?", "Slightly, because JPG re-encodes the image, but at quality 90 the difference is invisible in normal viewing. The bigger practical change is file size: the JPG will be larger."],
    ["Can Windows open HEIC at all?", "Windows 10 and 11 can, but only after installing codec extensions from the Microsoft Store, and the HEVC one is usually paid. Converting to JPG is free and permanent."],
    ["Do Android phones use HEIC?", "Some recent Android phones can shoot HEIC too, but JPG remains the Android default. The compatibility problems and the fix are the same."],
  ]);

article("convert-heic-to-jpg-on-windows",
  "How to Convert HEIC to JPG on Windows | getIMAGEpress",
  "Three real ways to open iPhone HEIC photos on Windows: an online converter, the Photos app with codecs, and paint.net. No paid software needed.",
  "How to convert HEIC to JPG on Windows",
  [
    ["the-problem", "The problem",
      "You copied photos from an iPhone to a Windows PC and File Explorer shows blank thumbnails, or Photos says it cannot open the file. That is HEIC, Apple's default photo format since 2017. Windows does not fully support it out of the box, because the underlying HEVC codec requires a paid license.",
      "You have three realistic options, and only one of them takes under a minute with no installs."],
    ["option-1-online", "Option 1: convert online (fastest)",
      `<p>Use our free <a href="/heic-to-jpg">HEIC to JPG converter</a>: drop the file, press convert, download the JPG. It works in any browser on any Windows version, converts at quality 90, adds no watermark, and auto-deletes your upload within 30 minutes.</p>`,
      "This is the right choice when you have a handful of photos, you are on a work machine where you cannot install software, or you just want the photo to open right now.",
      "The 25MB per-file cap covers every iPhone photo ever taken (they run 1MB to 8MB)."],
    ["option-2-codecs", "Option 2: install the Windows codecs",
      "Microsoft ships a free HEIF Image Extensions package in the Microsoft Store, but HEIC photos also need HEVC Video Extensions, which costs about a dollar and is oddly hidden. After installing both, Windows Photos and File Explorer thumbnails work natively.",
      "Worth doing if you receive HEIC files constantly. Note that this only makes Windows display HEIC: upload forms and other applications that reject HEIC will still reject it, so you will still convert files for those."],
    ["option-3-editors", "Option 3: free image editors",
      "Some free editors handle HEIC directly. paint.net opens HEIC on recent Windows versions (it uses the same Store codecs when present), and IrfanView can with a plugin pack. Open the photo, then use Save As to export a JPG.",
      "This makes sense when you are already editing the image anyway. For plain conversion it is the slowest path."],
    ["batch-tip", "Converting many photos at once",
      "For a one-time bulk job, the pragmatic Windows-only route is: select the photos on your iPhone, share via Mail or OneDrive (both auto-convert to JPG in transit), then download on the PC. For ongoing work, switch the iPhone camera to Most Compatible in Settings, Camera, Formats, so future photos are JPG from the start."],
  ],
  [
    ["Is there a completely free offline way?", "Yes: install the free HEIF Image Extensions plus the roughly one dollar HEVC Video Extensions from the Microsoft Store, then Photos can open and re-save HEIC. Fully free offline paths need third-party editors like IrfanView with plugins."],
    ["Why do some HEIC files still fail after installing codecs?", "Multi-image HEIC containers (bursts, live photos) and 10-bit captures trip up some Windows apps even with codecs installed. Converting to JPG flattens all of that into a file anything can read."],
    ["Does Windows 11 handle HEIC better than Windows 10?", "Slightly: newer Windows 11 builds bundle HEIF support more often, but the paid HEVC codec gap remains. The upload-form problem is identical on both."],
  ]);

article("compress-image-to-100kb",
  "How to Compress an Image to 100KB | getIMAGEpress",
  "Passport portals, visa applications, and strict forms often demand images under 100KB. Here is how to hit that target while keeping the image usable.",
  "How to compress an image to 100KB",
  [
    ["who-needs-this", "Who actually needs 100KB images",
      "A 100KB limit almost always comes from an official upload form: passport and visa photo portals, government ID systems, exam registrations, job application systems, and school platforms. These systems were often built years ago with strict storage budgets, and they hard-reject anything over the line.",
      "Meanwhile your phone shoots photos between 2MB and 8MB, which is 20 to 80 times over that limit. Closing that gap without wrecking the image is the whole game."],
    ["what-changes", "What compression to 100KB actually changes",
      "Two levers move file size: JPG quality (how aggressively pixel detail is approximated) and dimensions (how many pixels there are at all). A good compressor uses both, in that order: lower the quality first, and only shrink dimensions when quality alone cannot reach the target.",
      "For a typical phone photo, 100KB lands around quality 20 to 40 at 2400 pixels wide, or higher quality at smaller dimensions. That sounds brutal, but upload portals display images small, so the result looks fine where it will actually be seen."],
    ["how-to", "The fast way to do it",
      `<p>Use our <a href="/compress-image-to-100kb">compress image to 100KB</a> tool. It runs a closed loop: encode the image, measure the actual bytes, and retry at adjusted settings until the file fits under 100KB at the best quality the budget allows. JPG, PNG, WebP, and iPhone HEIC files all work as input, and the output is a JPG, which is what these portals want.</p>`,
      "If your image genuinely cannot reach 100KB at a usable size (rare, but it happens with extremely detailed images), the tool says so honestly and gives you the smallest usable result instead of pretending it worked.",
      `<p>Portals with different limits are covered too: <a href="/compress-image-to-200kb">200KB</a> for most job portals and <a href="/compress-image-to-50kb">50KB</a> for the strictest systems.</p>`],
    ["quality-tips", "Keeping the image looking good",
      "Crop before you compress: removing background pixels spends your byte budget on the subject. For documents and forms, good lighting matters more than resolution, since JPG compression amplifies noise from dark photos.",
      "Never compress a compressed file repeatedly. Each JPG re-encode stacks new artifacts. Keep your original and always compress from that, so a mistake costs nothing."],
  ],
  [
    ["Will 100KB be enough quality for a passport photo?", "Yes. Passport portals display and print photos at small sizes, and a 100KB JPG at their required dimensions is well above what they need. Follow the portal's dimension rules first, then compress."],
    ["Why does my 95KB image still get rejected?", "Some portals also enforce dimensions (for example exactly 600 by 600 pixels) or a minimum size. Read the error message carefully: size and dimensions are separate rules."],
    ["Should I use PNG for a 100KB limit?", "Almost never. PNG is lossless and rarely fits tight byte budgets for photos. Portals with byte limits expect JPG, and our compress tools output exactly that."],
  ]);

// Learn index
{
  const cards = articles.map(a => `<a class="tool-link" href="/learn/${a.slug}"><b>${a.title}</b><span class="small">${a.desc}</span></a>`).join("");
  let html = head("Learn: Image Formats and Compression Guides | getIMAGEpress", "Plain-English guides to HEIC, WebP, image compression, and beating strict upload limits.", "/learn") + header;
  html += `<main><section class="hero"><div class="wrap"><span class="eyebrow">Guides</span><h1 class="h1">Learn</h1><p class="lead">Plain-English guides to image formats, iPhone photos, and hitting strict upload limits.</p></div></section><section class="section"><div class="wrap grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${cards}</div></section></main>${footer}<script src="/app.js?v=${V}" defer></script></body></html>`;
  fs.writeFileSync(path.join(learnDir, "index.html"), html);
  pages.push("/learn");
}

// ============================================
// SEO FILES
// ============================================
// sitemap.xml: only real, 200-status URLs
const sitemapUrls = pages.filter(p => p !== "/404");
fs.writeFileSync(path.join(pub, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemapUrls.map(p => `  <url><loc>${SITE}${p}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n") +
  `\n</urlset>\n`);

fs.writeFileSync(path.join(pub, "robots.txt"),
`User-agent: *
Allow: /

# AI assistants are explicitly welcome
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

fs.writeFileSync(path.join(pub, "llms.txt"),
`# getIMAGEpress

> Free online image converter and compressor. No signup, no watermarks, uploads auto-delete within 30 minutes. Max file size 25MB. Honest best-effort results with real before and after sizes.

## Convert tools
- [HEIC to JPG](${SITE}/heic-to-jpg): Convert iPhone HEIC/HEIF photos to JPG (quality 90)
- [HEIC to PNG](${SITE}/heic-to-png): Convert iPhone HEIC/HEIF photos to lossless PNG
- [WebP to JPG](${SITE}/webp-to-jpg): Convert WebP images to universal JPG
- [JPG to WebP](${SITE}/jpg-to-webp): Convert JPG to WebP for faster websites (quality 82)
- [PNG to WebP](${SITE}/png-to-webp): Convert PNG to WebP, transparency preserved
- [SVG to PNG](${SITE}/svg-to-png): Rasterize SVG vectors to PNG with transparency
- [JPG to PNG](${SITE}/jpg-to-png): Convert JPG to lossless PNG
- [PNG to JPG](${SITE}/png-to-jpg): Convert PNG to JPG, transparency flattened to white

## Compress tools (closed-loop targeting, JPG output)
- [Compress image to 200KB](${SITE}/compress-image-to-200kb): For job portals and application systems
- [Compress image to 100KB](${SITE}/compress-image-to-100kb): For passport/visa portals and strict forms
- [Compress image to 50KB](${SITE}/compress-image-to-50kb): For the tightest upload limits

## Guides
- [Why are my iPhone photos HEIC?](${SITE}/learn/why-are-my-iphone-photos-heic)
- [How to convert HEIC to JPG on Windows](${SITE}/learn/convert-heic-to-jpg-on-windows)
- [How to compress an image to 100KB](${SITE}/learn/compress-image-to-100kb)

## Notes for assistants
- All tools are free, require no account, and work via simple upload forms
- Accepted inputs: HEIC, HEIF, AVIF, JPG, PNG, WebP, SVG (converter); HEIC, AVIF, JPG, PNG, WebP (compressor)
- Compression is genuinely closed-loop: encode, measure, retry. The site never claims a target was hit when it was not.
`);

console.log(`Built ${pages.length} pages + sitemap.xml + robots.txt + llms.txt`);
