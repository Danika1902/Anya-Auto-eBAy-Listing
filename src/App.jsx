import { useState, useEffect, useRef, useCallback } from "react";

/* ─── CONFIG ─── */
const N8N_FORM_URL =
  "https://n8n.srv1249219.hstgr.cloud/webhook/ebay-listing-submit";

const N8N_STATUS_URL =
  "https://n8n.srv1249219.hstgr.cloud/webhook/ebay-listing-status";

const POLL_INTERVAL = 5000; // 5 seconds
const STORAGE_KEY = "heltmade-listings-local";

const SHIPPING_OPTIONS = [
  { id: "paket_s", label: "Paket S", de: "6,19 €", int: "26,49 €", weight: "max 2 kg", icon: "📦" },
  { id: "paket_m", label: "Paket M", de: "7,69 €", int: "47,99 €", weight: "max 5 kg", icon: "📦" },
  { id: "paket_l", label: "Paket L", de: "10,49 €", int: "77,99 €", weight: "max 10 kg", icon: "🏷️" },
  { id: "paket_xl", label: "Paket XL", de: "18,99 €", int: "142,99 €", weight: "max 20 kg", icon: "🚚" },
];

const STATUS_CONFIG = {
  submitted:  { label: "Beküldve",        color: "#E8A838", progress: 10 },
  processing: { label: "Feldolgozás",     color: "#3B82F6", progress: 40 },
  creating:   { label: "eBay létrehozás", color: "#F59E0B", progress: 70 },
  created:    { label: "Létrehozva",      color: "#10B981", progress: 90 },
  live:       { label: "Élő az eBay-en",  color: "#8B5CF6", progress: 100 },
  error:      { label: "Hiba",            color: "#E54D2E", progress: 0 },
};

/* ─── Helpers ─── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocal(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

function timeAgo(ts) {
  if (!ts) return "";
  const date = typeof ts === "string" ? new Date(ts) : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff} mp`;
  if (diff < 3600) return `${Math.floor(diff / 60)} perc`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} óra`;
  return `${Math.floor(diff / 86400)} nap`;
}

async function statusAPI(body) {
  try {
    const res = await fetch(N8N_STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.warn("Status API error:", err);
    return null;
  }
}

/* ─────────────────────────── App ─────────────────────────── */

export default function App() {
  const [view, setView] = useState("form");
  const [countdown, setCountdown] = useState(10);
  const [listings, setListings] = useState(() => loadLocal());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formAnim, setFormAnim] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [pollActive, setPollActive] = useState(true);
  const fileInputRef = useRef(null);

  const emptyForm = {
    images: [],
    description: "",
    material: "",
    sizeChart: "",
    quantity: "",
    price: "",
    shipping: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [imagePreviews, setImagePreviews] = useState([]);

  /* ── Poll n8n status API ── */
  const pollStatuses = useCallback(async () => {
    const data = await statusAPI({ action: "read" });
    if (!data?.listings) return;

    setListings((prev) => {
      const remoteMap = {};
      data.listings.forEach((l) => { remoteMap[l.id] = l; });

      // Merge: update existing with remote data, keep local-only entries
      const merged = prev.map((local) => {
        const remote = remoteMap[local.id];
        if (remote) {
          delete remoteMap[local.id];
          return {
            ...local,
            status: remote.status || local.status,
            progress: remote.progress ?? STATUS_CONFIG[remote.status]?.progress ?? local.progress,
            step_label: remote.step_label || "",
            updatedAt: remote.updatedAt,
          };
        }
        return local;
      });

      // Add any remote-only entries (shouldn't normally happen)
      Object.values(remoteMap).forEach((r) => {
        merged.unshift({
          id: r.id,
          title: r.title || "Ismeretlen",
          price: "",
          quantity: "",
          shipping: "",
          imageCount: 0,
          status: r.status || "submitted",
          progress: r.progress ?? 0,
          step_label: r.step_label || "",
          timestamp: r.createdAt,
          updatedAt: r.updatedAt,
        });
      });

      saveLocal(merged);
      return merged;
    });
  }, []);

  useEffect(() => {
    if (!pollActive || listings.length === 0) return;

    // Initial poll
    pollStatuses();

    const id = setInterval(pollStatuses, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [pollActive, listings.length, pollStatuses]);

  /* ── Countdown for success view ── */
  useEffect(() => {
    if (view !== "success") return;
    if (countdown <= 0) {
      resetToForm();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [view, countdown]);

  function resetToForm() {
    setView("form");
    setCountdown(10);
    setFormAnim(false);
    requestAnimationFrame(() => setFormAnim(true));
  }

  /* ── Images ── */
  function addImages(files) {
    const next = [...form.images, ...files];
    setForm((f) => ({ ...f, images: next }));
    setImagePreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  }

  function removeImage(i) {
    URL.revokeObjectURL(imagePreviews[i]);
    setForm((f) => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));
    setImagePreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) addImages(files);
  }

  /* ── Validation ── */
  function validate() {
    const e = {};
    if (!form.images.length) e.images = "Legalább egy kép szükséges";
    if (!form.description.trim()) e.description = "Kötelező mező";
    if (!form.material.trim()) e.material = "Kötelező mező";
    if (!form.sizeChart.trim()) e.sizeChart = "Kötelező mező";
    if (!form.quantity.trim()) e.quantity = "Kötelező mező";
    if (!form.price.trim()) e.price = "Kötelező mező";
    if (!form.shipping) e.shipping = "Válassz szállítási módot";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ── Submit ── */
  async function handleSubmit() {
    if (!validate()) return;
    setIsSubmitting(true);

    const listingId = generateId();
    const ship = SHIPPING_OPTIONS.find((s) => s.id === form.shipping);

    try {
      // 1. Submit to n8n form
      const fd = new FormData();
      form.images.forEach((img) => fd.append("Képek", img));
      fd.append("Leírás", form.description);
      fd.append("Anyag", form.material);
      fd.append("Mérettáblázat", form.sizeChart);
      fd.append("Darab", form.quantity);
      fd.append("Ár", form.price);
      fd.append("Szállítási költség",
        `${ship.label}\nDE: ${ship.de}\nINT: ${ship.int}\n${ship.weight}`
      );
      fd.append("Listing_ID", listingId);

      await fetch(N8N_FORM_URL, { method: "POST", body: fd,  });

      // 2. Register in status tracker API
      await statusAPI({
        action: "update",
        id: listingId,
        status: "submitted",
        title: form.description.slice(0, 60),
        progress: 10,
        step_label: "Beküldve",
      });

      // 3. Save locally
      const entry = {
        id: listingId,
        title: form.description.slice(0, 50) + (form.description.length > 50 ? "…" : ""),
        price: form.price,
        quantity: form.quantity,
        shipping: ship.label,
        imageCount: form.images.length,
        status: "submitted",
        progress: 10,
        step_label: "Beküldve",
        timestamp: new Date().toISOString(),
      };

      const next = [entry, ...listings].slice(0, 30);
      setListings(next);
      saveLocal(next);

      // Reset
      imagePreviews.forEach((u) => URL.revokeObjectURL(u));
      setForm(emptyForm);
      setImagePreviews([]);
      setErrors({});
      setView("success");
      setCountdown(10);
      setPollActive(true);
    } catch (err) {
      console.error(err);
      setView("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function clearListings() {
    if (!confirm("Biztosan törölni szeretnéd az összes listát?")) return;
    await statusAPI({ action: "clear" });
    setListings([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  async function removeOneListing(id) {
    await statusAPI({ action: "delete", id });
    const next = listings.filter((l) => l.id !== id);
    setListings(next);
    saveLocal(next);
  }

  /* ─────────────── Render ─────────────── */
  return (
    <div style={s.wrapper}>
      <div className="yarn-bg" style={s.bgFixed} />

      {/* Header */}
      <header style={s.header}>
        <div style={s.logo}>
          <span style={{ fontSize: 36, animation: "float 4s ease-in-out infinite" }}>🧶</span>
          <div>
            <h1 style={s.logoTitle}>HeltMade</h1>
            <p style={s.logoSub}>eBay Listing Eszköz</p>
          </div>
        </div>
      </header>

      <main style={s.main}>
        {/* ─── FORM ─── */}
        {view === "form" && (
          <div style={{ ...s.card, animation: formAnim ? "fadeInUp .5s ease both" : "none" }}>
            <div style={s.cardHead}>
              <h2 style={s.cardTitle}>Új listing létrehozása</h2>
              <p style={s.cardSub}>Töltsd ki az alábbi mezőket a horgolt termék eBay-re való feltöltéséhez</p>
            </div>

            <div style={s.formBody}>
              {/* Képek */}
              <div className="field-group">
                <label style={s.label}><span style={s.li}>📸</span> Képek <span style={s.req}>*</span></label>
                <div
                  className="drop-zone"
                  style={{
                    ...s.drop,
                    borderColor: dragOver ? "#B4825A" : errors.images ? "#E54D2E" : "#D9CFC4",
                    background: dragOver ? "rgba(180,130,100,0.06)" : "#FDFBF9",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" multiple accept="image/*"
                    onChange={(e) => addImages(Array.from(e.target.files))} style={{ display: "none" }} />
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{dragOver ? "📥" : "🖼️"}</div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "#6A5A4A" }}>
                    {dragOver ? "Engedd el a képeket..." : "Kattints vagy húzd ide a képeket"}
                  </p>
                  <p style={{ fontSize: 11, color: "#A89A8A", marginTop: 4 }}>JPG, PNG, WebP</p>
                </div>
                {imagePreviews.length > 0 && (
                  <div style={s.thumbGrid}>
                    {imagePreviews.map((src, i) => (
                      <div key={i} className="image-thumb" style={s.thumb}>
                        <img src={src} alt="" style={s.thumbImg} />
                        <button className="remove-btn" style={s.removeBtn}
                          onClick={(e) => { e.stopPropagation(); removeImage(i); }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {errors.images && <p style={s.err}>{errors.images}</p>}
              </div>

              {/* Leírás */}
              <div className="field-group">
                <label style={s.label}><span style={s.li}>📝</span> Leírás <span style={s.req}>*</span></label>
                <textarea style={s.textarea} rows={4} placeholder="Termék részletes leírása..."
                  value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                {errors.description && <p style={s.err}>{errors.description}</p>}
              </div>

              {/* Anyag + Méret */}
              <div style={s.row}>
                <div className="field-group" style={{ flex: 1 }}>
                  <label style={s.label}><span style={s.li}>🧵</span> Anyag <span style={s.req}>*</span></label>
                  <input style={s.input} placeholder="pl. pamut, akril..."
                    value={form.material} onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))} />
                  {errors.material && <p style={s.err}>{errors.material}</p>}
                </div>
                <div className="field-group" style={{ flex: 1 }}>
                  <label style={s.label}><span style={s.li}>📐</span> Mérettáblázat <span style={s.req}>*</span></label>
                  <input style={s.input} placeholder="Méretek megadása..."
                    value={form.sizeChart} onChange={(e) => setForm((f) => ({ ...f, sizeChart: e.target.value }))} />
                  {errors.sizeChart && <p style={s.err}>{errors.sizeChart}</p>}
                </div>
              </div>

              {/* Darab + Ár */}
              <div style={s.row}>
                <div className="field-group" style={{ flex: 1 }}>
                  <label style={s.label}><span style={s.li}>🔢</span> Darab <span style={s.req}>*</span></label>
                  <input style={s.input} type="number" min="1" placeholder="1"
                    value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
                  {errors.quantity && <p style={s.err}>{errors.quantity}</p>}
                </div>
                <div className="field-group" style={{ flex: 1 }}>
                  <label style={s.label}><span style={s.li}>💰</span> Ár <span style={s.req}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <input style={{ ...s.input, paddingRight: 40 }} type="text" placeholder="29,99"
                      value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                    <span style={s.currency}>€</span>
                  </div>
                  {errors.price && <p style={s.err}>{errors.price}</p>}
                </div>
              </div>

              {/* Szállítás */}
              <div className="field-group">
                <label style={s.label}><span style={s.li}>📦</span> Szállítási költség <span style={s.req}>*</span></label>
                <div style={s.shipGrid}>
                  {SHIPPING_OPTIONS.map((opt) => {
                    const active = form.shipping === opt.id;
                    return (
                      <div key={opt.id}
                        className={`shipping-card${active ? " selected" : ""}`}
                        style={{ ...s.shipCard, borderColor: active ? "#B4825A" : "#E8E0D6" }}
                        onClick={() => setForm((f) => ({ ...f, shipping: opt.id }))}>
                        <div style={s.shipTop}>
                          <span style={{ fontSize: 18 }}>{opt.icon}</span>
                          <span style={s.shipLabel}>{opt.label}</span>
                        </div>
                        <div style={s.shipPrices}>
                          <span style={s.shipPrice}><span style={{ fontSize: 13 }}>🇩🇪</span> {opt.de}</span>
                          <span style={s.shipPrice}><span style={{ fontSize: 13 }}>🌍</span> {opt.int}</span>
                        </div>
                        <div style={s.shipWeight}>{opt.weight}</div>
                        {active && <div style={s.checkBadge}>✓</div>}
                      </div>
                    );
                  })}
                </div>
                {errors.shipping && <p style={s.err}>{errors.shipping}</p>}
              </div>

              {/* Submit */}
              <button className="submit-btn" style={s.submitBtn} onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                    Küldés folyamatban...
                  </span>
                ) : "🚀 Listing létrehozása"}
              </button>
            </div>
          </div>
        )}

        {/* ─── SUCCESS ─── */}
        {view === "success" && (
          <div style={{ ...s.card, animation: "scaleIn .4s ease both", textAlign: "center", padding: "48px 32px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="33" fill="none" stroke="#B4825A" strokeWidth="3" opacity=".2" />
                <circle cx="36" cy="36" r="33" fill="none" stroke="#B4825A" strokeWidth="3"
                  strokeDasharray="207" strokeDashoffset="0" style={{ animation: "ringDraw .8s ease both" }} />
                <path d="M22 37 L32 47 L50 27" fill="none" stroke="#B4825A" strokeWidth="3.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="50" strokeDashoffset="0" style={{ animation: "checkDraw .5s ease .4s both" }} />
              </svg>
            </div>
            <h2 style={{ ...s.cardTitle, marginTop: 20, fontSize: 26 }}>Listing sikeresen beküldve!</h2>
            <p style={{ ...s.cardSub, marginTop: 8, fontSize: 15 }}>
              A horgolt terméked most feldolgozás alatt áll az eBay-re való feltöltéshez.
            </p>
            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={s.countdownCircle}>
                <span style={s.countdownNum}>{countdown}</span>
              </div>
              <p style={{ fontSize: 13, color: "#8A7A6C" }}>Átirányítás az űrlaphoz {countdown} másodperc múlva</p>
              <div style={s.progressTrack}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${(countdown / 10) * 100}%`,
                  background: "linear-gradient(90deg, #B4825A, #D4A574)",
                  transition: "width 1s linear",
                }} />
              </div>
            </div>
            <button className="outline-btn" style={s.outlineBtn} onClick={resetToForm}>
              ← Új listing létrehozása most
            </button>
          </div>
        )}

        {/* ─── ERROR ─── */}
        {view === "error" && (
          <div style={{ ...s.card, animation: "scaleIn .4s ease both", textAlign: "center", padding: "48px 32px" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ ...s.cardTitle, color: "#E54D2E" }}>Hiba történt a küldés során</h2>
            <p style={{ ...s.cardSub, marginTop: 8 }}>Kérlek, ellenőrizd az internetkapcsolatodat és próbáld újra.</p>
            <button className="submit-btn" style={{ ...s.submitBtn, marginTop: 24 }} onClick={() => setView("form")}>
              Vissza az űrlaphoz
            </button>
          </div>
        )}

        {/* ─── LISTING TRACKER ─── */}
        {listings.length > 0 && (
          <div style={{ ...s.card, marginTop: 24, animation: "fadeInUp .5s ease .2s both" }}>
            <div style={{ ...s.cardHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ ...s.cardTitle, fontSize: 18 }}>📊 Listing Állapot Követő</h2>
                <p style={{ ...s.cardSub, marginTop: 2 }}>
                  {listings.length} listing · Frissítés {POLL_INTERVAL / 1000}mp-ként
                  <span style={{
                    display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                    background: "#10B981", marginLeft: 8, animation: "pulse 2s infinite",
                    verticalAlign: "middle",
                  }} />
                </p>
              </div>
              <button style={s.clearBtn} onClick={clearListings} title="Összes törlése">🗑️</button>
            </div>

            <div style={{ padding: "8px 0" }}>
              {listings.map((item, idx) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.submitted;
                const progress = item.progress ?? cfg.progress;

                return (
                  <div key={item.id} className="tracker-row"
                    style={{
                      padding: "14px 28px",
                      borderBottom: idx < listings.length - 1 ? "1px solid #F0E8DF" : "none",
                      animation: `fadeInUp .4s ease ${idx * 0.05}s both`,
                    }}>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.tTitle}>
                          <span style={s.tBadge}>🖼️ {item.imageCount}</span>
                          {item.title}
                        </div>
                        <div style={s.tMeta}>
                          {item.price && <><span>{item.price} €</span><span style={s.dot}>·</span></>}
                          {item.quantity && <><span>{item.quantity} db</span><span style={s.dot}>·</span></>}
                          {item.shipping && <><span>{item.shipping}</span><span style={s.dot}>·</span></>}
                          <span style={{ opacity: 0.6 }}>{timeAgo(item.updatedAt || item.timestamp)}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span className={`status-dot ${item.status}`}
                          style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: cfg.color, display: "inline-block",
                            animation: item.status === "processing" || item.status === "creating"
                              ? "pulse 1.5s infinite" : "none",
                          }} />
                        <span style={{ ...s.statusLabel, color: cfg.color }}>
                          {item.step_label || cfg.label}
                        </span>
                        <button
                          style={s.removeOneBtn}
                          onClick={() => removeOneListing(item.id)}
                          title="Törlés"
                        >✕</button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <div className="progress-track" style={{ flex: 1, marginTop: 0 }}>
                        <div className="progress-fill" style={{ width: `${progress}%`, background: cfg.color }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, minWidth: 32, textAlign: "right" }}>
                        {progress}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer style={s.footer}>HeltMade × eBay Automatizálás · Készítette a HeltAIum</footer>
    </div>
  );
}

/* ─────────────────── Styles ─────────────────── */
const s = {
  wrapper: { minHeight: "100vh", position: "relative", overflow: "hidden" },
  bgFixed: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 },
  header: { position: "relative", zIndex: 1, padding: "20px 24px", display: "flex", justifyContent: "center" },
  logo: { display: "flex", alignItems: "center", gap: 14 },
  logoTitle: { fontFamily: "'DM Serif Display', serif", fontSize: 28, fontWeight: 400, color: "#5A3E28", lineHeight: 1.1 },
  logoSub: { fontSize: 12, fontWeight: 500, letterSpacing: 2.5, textTransform: "uppercase", color: "#B4825A", marginTop: 2 },
  main: { position: "relative", zIndex: 1, maxWidth: 640, margin: "0 auto", padding: "0 16px 40px" },
  card: {
    background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", borderRadius: 20,
    border: "1px solid rgba(180,130,100,0.12)",
    boxShadow: "0 4px 32px rgba(90,62,40,0.06), 0 1px 4px rgba(90,62,40,0.04)", overflow: "hidden",
  },
  cardHead: { padding: "24px 28px 0" },
  cardTitle: { fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400, color: "#3A2E25" },
  cardSub: { fontSize: 13, color: "#8A7A6C", marginTop: 4 },
  formBody: { padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: 20 },
  label: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#5A4A3A", marginBottom: 8, letterSpacing: 0.3 },
  li: { fontSize: 15 },
  req: { color: "#D4825A", fontWeight: 400 },
  input: { width: "100%", padding: "12px 16px", border: "1.5px solid #E0D6CC", borderRadius: 12, fontSize: 14, fontFamily: "'Outfit', sans-serif", color: "#3A2E25", background: "#FDFBF9", transition: "all .2s ease" },
  textarea: { width: "100%", padding: "12px 16px", border: "1.5px solid #E0D6CC", borderRadius: 12, fontSize: 14, fontFamily: "'Outfit', sans-serif", color: "#3A2E25", background: "#FDFBF9", resize: "vertical", minHeight: 80, transition: "all .2s ease" },
  row: { display: "flex", gap: 16 },
  currency: { position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 600, color: "#B4825A" },
  err: { fontSize: 12, color: "#E54D2E", marginTop: 4, fontWeight: 500 },
  drop: { border: "2px dashed #D9CFC4", borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer" },
  thumbGrid: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" },
  thumb: { width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: "2px solid #EDE5DB", position: "relative" },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover" },
  removeBtn: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  shipGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  shipCard: { border: "1.5px solid #E8E0D6", borderRadius: 14, padding: "14px 16px", background: "#FDFBF9", position: "relative" },
  shipTop: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  shipLabel: { fontWeight: 600, fontSize: 14, color: "#4A3A2A" },
  shipPrices: { display: "flex", flexDirection: "column", gap: 3 },
  shipPrice: { fontSize: 12, color: "#6A5A4A", display: "flex", alignItems: "center", gap: 6 },
  shipWeight: { marginTop: 6, fontSize: 11, color: "#A89A8A", fontWeight: 500 },
  checkBadge: { position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: "50%", background: "#B4825A", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  submitBtn: { width: "100%", padding: "16px 24px", background: "linear-gradient(135deg, #B4825A, #9A6E48)", color: "#FFF", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 600, fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3 },
  outlineBtn: { marginTop: 24, padding: "14px 28px", background: "transparent", color: "#B4825A", border: "2px solid #B4825A", borderRadius: 14, fontSize: 15, fontWeight: 600, fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3 },
  countdownCircle: { width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #FFF8F2, #FDEBD8)", border: "2px solid #D4A574", display: "flex", alignItems: "center", justifyContent: "center" },
  countdownNum: { fontFamily: "'DM Serif Display', serif", fontSize: 24, color: "#B4825A" },
  progressTrack: { width: 200, height: 3, background: "#EDE5DB", borderRadius: 2, overflow: "hidden" },
  tTitle: { fontSize: 14, fontWeight: 500, color: "#3A2E25", display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tBadge: { fontSize: 11, background: "#F0E8DF", padding: "2px 8px", borderRadius: 6, color: "#8A7A6C", fontWeight: 600, flexShrink: 0 },
  tMeta: { fontSize: 12, color: "#8A7A6C", marginTop: 3, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" },
  dot: { color: "#D4C8BC" },
  statusLabel: { fontSize: 12, fontWeight: 600 },
  clearBtn: { background: "none", border: "1px solid #E0D6CC", borderRadius: 10, padding: "6px 12px", fontSize: 14, cursor: "pointer", color: "#8A7A6C" },
  removeOneBtn: { background: "none", border: "none", fontSize: 12, cursor: "pointer", color: "#C0B0A0", padding: "2px 6px", borderRadius: 4, transition: "color 0.2s" },
  footer: { position: "relative", zIndex: 1, textAlign: "center", padding: "16px 0 24px", fontSize: 11, color: "#B4A898", letterSpacing: 0.5 },
};
