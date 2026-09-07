// server.js - PRODUCTION VERSION for getIMAGEpress
// Free image converter and compressor: HEIC, JPG, PNG, WebP, SVG
// sharp handles all decode/encode EXCEPT HEIC decode (patent-encumbered in
// prebuilt binaries), which goes through heic-convert (WASM libheif).

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const sharp = require("sharp");
const heicConvert = require("heic-convert");
const archiver = require("archiver");

const app = express();
const PORT = process.env.PORT || 3000;
app.disable("x-powered-by");

// ============================================
// PRODUCTION CONFIGURATION
// ============================================
const MAX_CONCURRENT_REQUESTS = 2; // 512MB instance: >2 heavy image jobs at once risks OOM restarts
const REQUEST_TIMEOUT = 90000; // 90 seconds
const MAX_INPUT_PIXELS = 80 * 1000 * 1000; // 80MP guard against decompression bombs

let activeRequests = 0;
let requestQueue = [];

// Memory monitoring
setInterval(() => {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const rssMB = Math.round(usage.rss / 1024 / 1024);

  console.log(`📊 Memory: RSS ${rssMB}MB / Heap ${heapUsedMB}MB`);

  if (rssMB > 400 && global.gc) {
    global.gc();
    console.log("🗑️ GC triggered");
  }
}, 30000);

// Create directories
const uploadsDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "output");

try {
  if (!fsSync.existsSync(uploadsDir)) {
    fsSync.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fsSync.existsSync(outputDir)) {
    fsSync.mkdirSync(outputDir, { recursive: true });
  }
} catch (err) {
  console.error("❌ Error creating directories:", err);
}

// File cleanup: runs every 5 minutes, deletes files older than 25 minutes,
// so every uploaded file is really gone within 30 minutes (the promise the
// site makes on every page).
setInterval(async () => {
  try {
    const now = Date.now();
    const maxAge = 25 * 60 * 1000;

    for (const dir of [uploadsDir, outputDir]) {
      const files = await fs.readdir(dir);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > maxAge) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch (err) {
          // File already deleted or permission error
        }
      }

      if (cleanedCount > 0) {
        console.log(`🗑️ Cleaned ${cleanedCount} files from ${dir}`);
      }
    }
  } catch (err) {
    console.error("❌ Cleanup error:", err);
  }
}, 5 * 60 * 1000);

// ============================================
// REQUEST QUEUE MIDDLEWARE
// ============================================
function requestQueueMiddleware(req, res, next) {
  // Batch conversions decode files one at a time and legitimately run longer.
  const timeoutMs = req.path.includes("convert-batch") ? 240000 : REQUEST_TIMEOUT;
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    console.log(`⏳ Queued (${requestQueue.length + 1} waiting)`);

    requestQueue.push({ req, res, next });

    const timeout = setTimeout(() => {
      const index = requestQueue.findIndex(item => item.req === req);
      if (index !== -1) {
        requestQueue.splice(index, 1);
        res.status(503).json({
          error: "Server busy",
          message: "Please try again in a moment.",
        });
      }
    }, 30000);

    req.on('close', () => clearTimeout(timeout));
    return;
  }

  activeRequests++;
  console.log(`▶️ Processing (${activeRequests}/${MAX_CONCURRENT_REQUESTS})`);

  const timeout = setTimeout(() => {
    console.error("⏱️ Timeout");
    if (!res.headersSent) {
      res.status(504).json({ error: "Request timeout" });
    }
  }, timeoutMs);

  const originalEnd = res.end;
  res.end = function(...args) {
    clearTimeout(timeout);
    activeRequests--;
    console.log(`✅ Done (${activeRequests} active, ${requestQueue.length} queued)`);

    if (requestQueue.length > 0) {
      const nextRequest = requestQueue.shift();
      setImmediate(() => requestQueueMiddleware(nextRequest.req, nextRequest.res, nextRequest.next));
    }

    originalEnd.apply(this, args);
  };

  next();
}

// ============================================
// MULTER CONFIGURATION
// ============================================
const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const base = path.basename(file.originalname, ext);
    cb(null, `${Date.now()}-${sanitize(base)}${ext.toLowerCase()}`);
  },
});

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB cap on a 512MB instance
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(
  cors({
    // Same-origin requests bypass CORS entirely; this only stops other
    // websites from calling our processing API from their visitors' browsers.
    origin: ["https://getimagepress.com", "http://localhost:3000", "http://localhost:3456"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json({ limit: '1mb' }));

// Basic security and cache headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

// ============================================
// RATE LIMITING (in-memory, per client IP)
// ============================================
const rateBuckets = new Map();
function rateLimit(max, windowMs, label) {
  return (req, res, next) => {
    // Never rate-limit health checks: Render pings frequently and marks the
    // instance dead on 429, causing a restart loop. (req.path is relative to
    // the mount point, so check both forms.)
    if (req.path === "/health" || req.path === "/api/health") return next();
    // Behind Render's proxy every socket shares the proxy IP, so identify the
    // real client: Cloudflare header first, then the forwarded-for chain.
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = req.headers["cf-connecting-ip"] || fwd || req.socket.remoteAddress || "unknown";
    const key = `${label}:${ip}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      return res.status(429).json({
        error: "Too many requests",
        message: "You have reached the usage limit. Please wait a few minutes and try again.",
      });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > 30 * 60 * 1000) rateBuckets.delete(key);
  }
}, 10 * 60 * 1000);

// Processing endpoints: generous for humans, hostile to scripts.
app.use("/api/", rateLimit(80, 10 * 60 * 1000, "api"));

// ============================================
// UPLOAD CONTENT VALIDATION (magic bytes, not just filenames)
// ============================================
// Returns one of: "jpg", "png", "webp", "heic", "svg", or null.
async function detectImageType(filePath) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4096), 0, 4096, 0);
    const buf = buffer.subarray(0, bytesRead);
    if (buf.length < 12) return null;

    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";

    // HEIC/HEIF and AVIF: ISO BMFF "ftyp" box at offset 4. AVIF is separate
    // because sharp decodes it natively while HEIC needs the WASM decoder.
    if (buf.toString("ascii", 4, 8) === "ftyp") {
      const brand = buf.toString("ascii", 8, 12);
      if (brand === "avif" || brand === "avis") return "avif";
      const heifBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];
      if (heifBrands.includes(brand)) return "heic";
      return null;
    }

    // SVG: text document starting with < (after BOM/whitespace) that mentions <svg
    const text = buf.toString("utf8").replace(/^﻿/, "").trimStart();
    if (text.startsWith("<") && /<svg[\s>]/i.test(text)) return "svg";

    return null;
  } catch (_) {
    return null;
  } finally {
    if (handle) await handle.close();
  }
}

// SVGs can carry scripts and XML entity bombs. We never render them in a
// browser, only convert server-side, and we reject the dangerous ones outright.
async function svgIsSafe(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    if (/<script[\s>]/i.test(text)) return false;
    if (/<!ENTITY/i.test(text)) return false;
    if (/\son[a-z]+\s*=/i.test(text)) return false;
    if (/javascript:/i.test(text)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function requireImageType(allowed, label) {
  return async (req, res, next) => {
    const files = req.files || (req.file ? [req.file] : []);
    for (const f of files) {
      const kind = await detectImageType(f.path);
      if (!kind || !allowed.includes(kind)) {
        await cleanupFiles(...files.map((x) => x.path));
        return res.status(400).json({
          error: "Wrong file type",
          message: `${headerSafeName(f.originalname)} is not a valid ${label} file. Please upload a real ${label}.`,
        });
      }
      if (kind === "svg" && !(await svgIsSafe(f.path))) {
        await cleanupFiles(...files.map((x) => x.path));
        return res.status(400).json({
          error: "Unsafe SVG",
          message: "This SVG contains scripts or entities we do not process. Please export a plain SVG and try again.",
        });
      }
      f.detectedType = kind;
    }
    next();
  };
}

// Filenames echoed into headers must never carry header-breaking characters.
const headerSafeName = (name) => String(name || "file").replace(/[\r\n"'\\;]/g, "_").slice(0, 120);

// Canonical domain enforcement only in production.
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();

  const host = req.headers.host || '';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const isLocal = host.includes('localhost') || host.startsWith('127.');
  const isWWW = host.startsWith('www.');
  const isHTTP = protocol === 'http';

  if (!isLocal && (isWWW || isHTTP)) {
    const canonicalHost = host.replace(/^www\./, '');
    const canonicalURL = `https://${canonicalHost}${req.originalUrl}`;
    return res.redirect(301, canonicalURL);
  }
  next();
});


// Canonical page URLs: one 200 per sitemap path. .html twins and trailing
// slashes 301 so Google does not split indexing across duplicates or 404s.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const raw = req.originalUrl || req.url || "/";
  const qIndex = raw.indexOf("?");
  const pathname = (qIndex === -1 ? raw : raw.slice(0, qIndex)).split("#")[0];
  const qs = qIndex === -1 ? "" : raw.slice(qIndex);
  if (pathname.startsWith("/api/")) return next();

  if (pathname === "/index.html" || pathname === "/index") {
    return res.redirect(301, "/" + (qs.startsWith("?") ? qs.slice(1) === "" ? "" : qs : qs));
  }
  if (pathname.length > 1 && pathname.endsWith(".html")) {
    return res.redirect(301, pathname.slice(0, -5) + qs);
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return res.redirect(301, pathname.replace(/\/+$/, "") + qs);
  }
  next();
});

app.use(express.static("public", {
  maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
  etag: true,
  redirect: false, // don't 301 /learn -> /learn/; the explicit route serves it directly

  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// Learn section index (articles resolve via the clean-URL fallback below)
app.get("/learn", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "learn", "index.html"));
});

// Apply queue to processing endpoints
app.use('/api/convert', requestQueueMiddleware);
app.use('/api/convert-batch', requestQueueMiddleware);
app.use('/api/compress-image', requestQueueMiddleware);

// ============================================
// HELPER FUNCTIONS
// ============================================
async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_) {}
}

async function cleanupFiles(...filePaths) {
  for (const filePath of filePaths) {
    await safeUnlink(filePath);
  }
}

// Decode any supported upload into a Buffer sharp can read natively.
// HEIC goes through heic-convert (WASM libheif); everything else passes through.
async function decodeToSharpInput(filePath, detectedType) {
  const fileBuffer = await fs.readFile(filePath);
  if (detectedType === "heic") {
    // Decode HEIC to PNG in WASM, then hand the PNG to sharp. libheif applies
    // the irot/imir transforms, so orientation comes out right.
    const pngBuffer = await heicConvert({ buffer: fileBuffer, format: "PNG" });
    return Buffer.from(pngBuffer);
  }
  return fileBuffer;
}

function sharpFrom(inputBuffer, detectedType) {
  const options = { limitInputPixels: MAX_INPUT_PIXELS };
  if (detectedType === "svg") {
    // Rasterize SVG at higher density so small icons don't come out blurry.
    options.density = 150;
  }
  // .rotate() with no args applies EXIF orientation then strips the tag.
  return sharp(inputBuffer, options).rotate();
}

const OUTPUT_FORMATS = {
  jpg:  { ext: "jpg",  mime: "image/jpeg" },
  png:  { ext: "png",  mime: "image/png"  },
  webp: { ext: "webp", mime: "image/webp" },
};

async function encodeTo(pipeline, format, quality) {
  if (format === "jpg") {
    // JPEG has no alpha channel; flatten transparency onto white.
    return pipeline.flatten({ background: "#ffffff" }).jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
  }
  if (format === "png") {
    return pipeline.png({ compressionLevel: 9 }).toBuffer();
  }
  if (format === "webp") {
    return pipeline.webp({ quality }).toBuffer();
  }
  throw new Error(`Unsupported output format: ${format}`);
}

function outputName(originalname, ext) {
  const base = path.basename(originalname, path.extname(originalname));
  return `${headerSafeName(base)}.${ext}`;
}

// ============================================
// IMAGE CONVERT - HEIC/JPG/PNG/WebP/SVG in, JPG/PNG/WebP out
// ============================================
const CONVERT_INPUTS = ["heic", "avif", "jpg", "png", "webp", "svg"];

app.post("/api/convert", upload.single("file"), requireImageType(CONVERT_INPUTS, "HEIC, AVIF, JPG, PNG, WebP, or SVG"), async (req, res) => {
  let inputPath;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    inputPath = req.file.path;
    const to = String(req.body.to || "").toLowerCase();
    const out = OUTPUT_FORMATS[to];
    if (!out) {
      return res.status(400).json({
        error: "Invalid output format",
        message: "Choose JPG, PNG, or WebP as the output format.",
      });
    }

    const from = req.file.detectedType;
    console.log(`🖼️ Convert: ${from} → ${to} (${Math.round(req.file.size / 1024)}KB)`);

    const inputBuffer = await decodeToSharpInput(inputPath, from);
    const pipeline = sharpFrom(inputBuffer, from);
    const quality = to === "webp" ? 82 : 90;
    const outputBuffer = await encodeTo(pipeline, to, quality);

    const name = outputName(req.file.originalname, out.ext);
    console.log(`✅ Converted: ${Math.round(req.file.size / 1024)}KB ${from} → ${Math.round(outputBuffer.length / 1024)}KB ${to}`);

    res.set({
      "Content-Type": out.mime,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": outputBuffer.length,
      "X-Original-Size": req.file.size,
      "X-Converted-Size": outputBuffer.length,
      "X-Input-Type": from,
    });

    // Must be a Buffer: express serializes a raw Uint8Array as JSON text
    return res.send(Buffer.from(outputBuffer));
  } catch (error) {
    console.error("❌ Convert error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Conversion failed",
        details: error.message,
      });
    }
  } finally {
    await cleanupFiles(inputPath);
  }
});

// ============================================
// BATCH IMAGE CONVERT - up to 30 files, ZIP output
// ============================================
const MAX_BATCH_FILES = 30;
const MAX_BATCH_TOTAL_BYTES = 150 * 1024 * 1024;

app.post("/api/convert-batch", upload.array("files", MAX_BATCH_FILES), requireImageType(CONVERT_INPUTS, "HEIC, AVIF, JPG, PNG, WebP, or SVG"), async (req, res) => {
  const inputPaths = (req.files || []).map((f) => f.path);

  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({
        error: "Need at least 2 files",
        message: "Batch conversion needs 2 or more files. For a single file, use the regular converter.",
      });
    }

    const totalBytes = req.files.reduce((n, f) => n + f.size, 0);
    if (totalBytes > MAX_BATCH_TOTAL_BYTES) {
      return res.status(413).json({
        error: "Batch too large",
        message: `Total upload is ${Math.round(totalBytes / 1024 / 1024)}MB. Batches are capped at ${Math.round(MAX_BATCH_TOTAL_BYTES / 1024 / 1024)}MB. Split into smaller batches.`,
      });
    }

    const to = String(req.body.to || "").toLowerCase();
    const out = OUTPUT_FORMATS[to];
    if (!out) {
      return res.status(400).json({
        error: "Invalid output format",
        message: "Choose JPG, PNG, or WebP as the output format.",
      });
    }

    console.log(`📦 Batch convert: ${req.files.length} files → ${to} (${Math.round(totalBytes / 1024 / 1024)}MB total)`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="getimagepress-${to}.zip"`,
    });
    archive.pipe(res);

    // Process strictly one file at a time: a single HEIC decode can take
    // 100MB+ of working memory and the whole container only has 512MB.
    const failures = [];
    const usedNames = new Set();
    let converted = 0;

    for (const f of req.files) {
      try {
        const inputBuffer = await decodeToSharpInput(f.path, f.detectedType);
        const pipeline = sharpFrom(inputBuffer, f.detectedType);
        const quality = to === "webp" ? 82 : 90;
        const outputBuffer = await encodeTo(pipeline, to, quality);

        // De-duplicate names inside the ZIP (two IMG_0001.heic uploads)
        let name = outputName(f.originalname, out.ext);
        let n = 2;
        while (usedNames.has(name)) {
          name = outputName(f.originalname, `${n}.${out.ext}`);
          n++;
        }
        usedNames.add(name);

        archive.append(Buffer.from(outputBuffer), { name });
        converted++;
      } catch (err) {
        console.error(`   ⚠️ Batch file failed: ${f.originalname}: ${err.message}`);
        failures.push(f.originalname);
      }
    }

    if (converted === 0) {
      // Nothing succeeded; abort the archive rather than sending an empty ZIP.
      archive.abort();
      if (!res.headersSent) {
        return res.status(500).json({ error: "Conversion failed", message: "None of the files could be converted." });
      }
      return res.end();
    }

    // Be honest inside the download too: list any files that failed.
    if (failures.length > 0) {
      const report = `${failures.length} of ${req.files.length} files could not be converted:\n` +
        failures.map((x) => `- ${x}`).join("\n") +
        `\nThe other ${converted} files converted normally.\n`;
      archive.append(report, { name: "FAILED-FILES.txt" });
    }

    await archive.finalize();
    console.log(`✅ Batch done: ${converted}/${req.files.length} converted${failures.length ? `, ${failures.length} failed` : ""}`);
  } catch (error) {
    console.error("❌ Batch convert error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Batch conversion failed",
        details: error.message,
      });
    }
  } finally {
    await cleanupFiles(...inputPaths);
  }
});

// ============================================
// IMAGE COMPRESS TO TARGET SIZE - closed loop: encode, measure, retry
// ============================================
const COMPRESS_INPUTS = ["heic", "avif", "jpg", "png", "webp"];

app.post("/api/compress-image", upload.single("file"), requireImageType(COMPRESS_INPUTS, "HEIC, JPG, PNG, or WebP"), async (req, res) => {
  let inputPath;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    inputPath = req.file.path;
    const targetKB = parseInt(req.body.targetSize, 10);
    if (!targetKB || targetKB < 10 || targetKB > 5000) {
      return res.status(400).json({
        error: "Invalid target size",
        message: "Choose a target between 10KB and 5000KB.",
      });
    }
    const targetBytes = targetKB * 1024;
    const originalSize = req.file.size;
    const originalSizeKB = Math.round(originalSize / 1024);
    const from = req.file.detectedType;

    console.log(`🎯 Compress: ${originalSizeKB}KB ${from} → target ${targetKB}KB`);

    // Already under target: return the file unchanged. Honest, and never
    // returns a bigger file than the original.
    if (originalSize <= targetBytes && from === "jpg") {
      const originalBuffer = await fs.readFile(inputPath);
      res.set({
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="${outputName(req.file.originalname, "jpg")}"`,
        "Content-Length": originalBuffer.length,
        "X-Original-Size": originalSize,
        "X-Compressed-Size": originalBuffer.length,
        "X-Compression-Method": "original",
        "X-Warning-Message": `This image is already ${originalSizeKB}KB, under the ${targetKB}KB target. Your original file is returned unchanged.`,
      });
      return res.send(originalBuffer);
    }

    const inputBuffer = await decodeToSharpInput(inputPath, from);
    const meta = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().metadata();
    // Cap at 2400px wide: upload forms never need more, and the saved bytes
    // buy visibly higher JPEG quality inside the same byte budget.
    let width = Math.min(meta.width || 0, 2400);

    // Closed loop, output JPEG (what upload forms want). Per pass: binary
    // search quality for the largest result that still fits the target, so
    // the user gets the best quality the byte budget allows. If even q10 at
    // this size overshoots, downscale and repeat.
    async function encodeAt(passWidth, q) {
      return sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: passWidth, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: q, progressive: true, mozjpeg: true })
        .toBuffer();
    }

    let best = null;
    let scale = 1.0;

    for (let pass = 0; pass < 4; pass++) {
      const passWidth = Math.max(200, Math.round(width * scale));
      let lo = 10, hi = 88;
      let passBest = null; // best fit under target at this size

      for (let iter = 0; iter < 7 && lo <= hi; iter++) {
        const q = Math.round((lo + hi) / 2);
        const candidate = await encodeAt(passWidth, q);

        if (!best || candidate.length < best.bytes.length) {
          best = { bytes: candidate, quality: q, width: passWidth };
        }
        if (candidate.length <= targetBytes) {
          if (!passBest || q > passBest.quality) passBest = { bytes: candidate, quality: q, width: passWidth };
          lo = q + 1; // fits: try higher quality
        } else {
          hi = q - 1; // too big: lower quality
        }
      }

      if (passBest) {
        best = passBest;
        break;
      }
      if (passWidth <= 200) break;
      // Scale dimensions toward the byte target for the next pass
      scale = scale * Math.max(0.5, Math.sqrt(targetBytes / best.bytes.length) * 0.95);
    }

    const hitTarget = best.bytes.length <= targetBytes;
    const bestKB = Math.round(best.bytes.length / 1024);

    // GUARANTEE: never return more bytes than we were given.
    if (best.bytes.length >= originalSize) {
      const originalBuffer = await fs.readFile(inputPath);
      const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", avif: "image/avif" }[from];
      console.log(`↩️ Recompression would grow the file - returning original (${originalSizeKB}KB)`);
      res.set({
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${headerSafeName(req.file.originalname)}"`,
        "Content-Length": originalBuffer.length,
        "X-Original-Size": originalSize,
        "X-Compressed-Size": originalBuffer.length,
        "X-Compression-Method": "original",
        "X-Target-Miss": "true",
        "X-Warning-Message": `This image is already efficiently compressed at ${originalSizeKB}KB - recompressing it toward ${targetKB}KB only made it bigger, so your original file is returned unchanged.`,
      });
      return res.send(originalBuffer);
    }

    const reduction = Math.round(((originalSize - best.bytes.length) / originalSize) * 100);
    console.log(`${hitTarget ? "✅ Hit target" : "⚠️ Best effort"}: ${originalSizeKB}KB → ${bestKB}KB (q${best.quality}, ${best.width}px, -${reduction}%)`);

    const headers = {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${outputName(req.file.originalname, "jpg")}"`,
      "Content-Length": best.bytes.length,
      "X-Original-Size": originalSize,
      "X-Compressed-Size": best.bytes.length,
      "X-Compression-Method": "closed-loop-jpeg",
      "X-Compression-Quality": best.quality,
      "X-Target-Size": targetBytes,
    };
    if (!hitTarget) {
      headers["X-Target-Miss"] = "true";
      headers["X-Warning-Message"] = `Compressed to ${bestKB}KB, the smallest this image can go while staying usable. The ${targetKB}KB target was not reachable without shrinking below 200px.`;
    }
    res.set(headers);

    // Must be a Buffer: express serializes a raw Uint8Array as JSON text
    return res.send(Buffer.from(best.bytes));
  } catch (error) {
    console.error("❌ Compress error:", error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Compression failed",
        details: error.message,
      });
    }
  } finally {
    await cleanupFiles(inputPath);
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", (req, res) => {
  const usage = process.memoryUsage();

  res.json({
    status: "OK",
    version: "1.0-production",
    timestamp: new Date().toISOString(),
    memory: {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024),
    },
    requests: {
      active: activeRequests,
      queued: requestQueue.length,
      maxConcurrent: MAX_CONCURRENT_REQUESTS,
    },
    features: {
      convert: "sharp + heic-convert (HEIC/JPG/PNG/WebP/SVG in, JPG/PNG/WebP out)",
      compress: "closed-loop JPEG targeting (encode, measure, retry)",
    },
  });
});

// ============================================
// ERROR HANDLERS
// ============================================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        message: "Max file size is 25MB. Resize or compress the image first, then try again.",
      });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Clean URL fallback for static HTML pages and Learn articles.
app.get("*", async (req, res, next) => {
  if (req.path.includes(".") || req.path.startsWith("/api/")) return next();
  const candidate = path.join(__dirname, "public", `${req.path}.html`);
  try {
    await fs.access(candidate);
    return res.sendFile(candidate);
  } catch (_) {
    return next();
  }
});

// ============================================
// 404 HANDLER (must be after all routes)
// ============================================
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log(`🚀 getIMAGEpress Production v1.0`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`💾 Max concurrent: ${MAX_CONCURRENT_REQUESTS}`);
  console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on("SIGTERM", () => {
  console.log("📴 SIGTERM - shutting down...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("⚠️ Forced shutdown");
    process.exit(1);
  }, 10000);
});

process.on("SIGINT", () => {
  console.log("📴 SIGINT - shutting down...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
