import { useEffect, useState } from "react";
import { product } from "./config";

const TOKEN_KEY = "asset_access_token";

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

async function post(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong"), { data, status: r.status });
  return data;
}

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function saveToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

// ---- Promo (influencer) code ----
// An influencer's link only counts the visit. The ₹49 price needs the buyer to type a valid code;
// once applied it's kept for 30 days, so someone who applies today and buys tomorrow keeps it.
// (A new key: codes the old version saved automatically from a link are not applied.)
const REF_KEY = "asset_promo";
const REF_SEEN_KEY = "asset_ref_seen";
const REF_DAYS = 30;

function readRef() {
  try {
    const r = JSON.parse(localStorage.getItem(REF_KEY));
    if (r?.code && Date.now() - r.at < REF_DAYS * 24 * 60 * 60 * 1000) return r.code;
  } catch {}
  return null;
}
function clearRef() {
  try { localStorage.removeItem(REF_KEY); } catch {}
}
function saveRef(code) {
  try { localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() })); } catch {}
}
function seenRefs() {
  try { return JSON.parse(localStorage.getItem(REF_SEEN_KEY)) || []; } catch { return []; }
}

// Checks the code with the server and counts one visit per browser per code.
async function checkCode(raw) {
  const ref = String(raw || "").trim().toLowerCase();
  const seen = seenRefs();
  const d = await post("/api/visit", { ref, first: !seen.includes(ref) });
  if (!seen.includes(d.code)) {
    try { localStorage.setItem(REF_SEEN_KEY, JSON.stringify([...seen, d.code].slice(-20))); } catch {}
  }
  return d.code;
}

export default function App() {
  const [status, setStatus] = useState("checking"); // checking | locked | unlocked
  const [token, setToken] = useState(null);
  const [paymentId, setPaymentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [restoreId, setRestoreId] = useState("");
  const [refCode, setRefCode] = useState(readRef);
  const [prices, setPrices] = useState({ full: product.fullPriceInr ?? product.priceInr, code: product.priceInr });

  // Real prices come from the server, so the page always shows what Razorpay will charge.
  useEffect(() => {
    fetch("/api/price")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPrices({ full: d.fullInr, code: d.codeInr }))
      .catch(() => {});
  }, []);
  const hasDiscount = prices.full > prices.code;
  const price = refCode ? prices.code : prices.full;
  const [showCode, setShowCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);

  // Arrived from an influencer's link (?ref=rahul): count the visit for them and tidy the URL.
  // The price stays ₹99 until the buyer types the code.
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (!ref) return;
    url.searchParams.delete("ref");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    checkCode(ref).catch(() => {});
  }, []);

  async function handleCode(e) {
    e.preventDefault();
    setCodeError("");
    setCodeBusy(true);
    try {
      const code = await checkCode(codeInput);
      saveRef(code);
      setRefCode(code);
      setShowCode(false);
      setCodeInput("");
    } catch (err) {
      setCodeError(err.status === 404 ? "That promo code isn't valid. Check the spelling and try again." : err.message);
    } finally {
      setCodeBusy(false);
    }
  }

  function removeCode() {
    clearRef();
    setRefCode(null);
    setShowCode(false);
    setCodeError("");
  }

  // On every visit: if this browser already paid, unlock straight away
  useEffect(() => {
    const saved = readToken();
    if (!saved) return setStatus("locked");
    post("/api/access", { token: saved })
      .then((d) => {
        if (d.ok) {
          setToken(saved);
          setPaymentId(d.paymentId || "");
          setStatus("unlocked");
        } else {
          clearToken();
          setStatus("locked");
        }
      })
      .catch(() => setStatus("locked"));
  }, []);

  function unlock(t, pid) {
    saveToken(t);
    setToken(t);
    setPaymentId(pid);
    setStatus("unlocked");
    setError("");
  }

  async function handleBuy() {
    setError("");
    setBusy(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Couldn't load Razorpay. Check your internet and try again.");
      const order = await post("/api/create-order", { ref: refCode || "" });
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: product.brand || product.name,
        description: product.name,
        theme: { color: "#111111" },
        handler: async (resp) => {
          try {
            const d = await post("/api/verify-payment", resp);
            unlock(d.token, d.paymentId);
          } catch (e) {
            setError(`${e.message}. If money was deducted, use "Restore access" with your UPI transaction ID.`);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on("payment.failed", (r) => {
        setError(r?.error?.description || "Payment failed. Please try again.");
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      if (e.data?.codeInvalid) {
        // The saved code was paused or removed. Show the real price before taking any money.
        clearRef();
        setRefCode(null);
        setError(`Promo code ${String(refCode || "").toUpperCase()} is no longer active, so the price is ₹${prices.full}. Tap "Buy now" to continue, or enter another code.`);
      } else {
        setError(e.message);
      }
      setBusy(false);
    }
  }

  async function handleRestore(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const d = await post("/api/restore", { paymentId: restoreId.trim() });
      unlock(d.token, d.paymentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center bg-white text-ink antialiased">
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:py-16">

        {status === "checking" && (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          </div>
        )}

        {status === "unlocked" && (
          <section className="mx-auto max-w-md rounded-3xl border border-line bg-white p-6 text-center shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] sm:p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-soft text-2xl text-ink">✓</div>
            <h1 className="text-2xl font-bold sm:text-3xl">You're in!</h1>
            <p className="mt-2 text-sm text-muted">{product.name}</p>
            <a
              href={`/api/download?token=${encodeURIComponent(token)}`}
              className="mt-6 block w-full rounded-2xl bg-ink py-4 text-base font-semibold text-white transition hover:bg-neutral-800 sm:text-lg"
            >
              Download
            </a>
            {paymentId && (
              <p className="mt-5 rounded-xl bg-soft px-3 py-2 text-xs text-muted">
                Payment ID
                <span className="mt-1 block select-all break-all font-mono text-ink">{paymentId}</span>
              </p>
            )}
          </section>
        )}

        {status === "locked" && (
          <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] md:grid md:grid-cols-2">
            {product.preview ? (
              <img
                src={product.preview}
                alt={product.name}
                className="aspect-video w-full object-cover md:aspect-auto md:h-full"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-soft to-line md:aspect-auto md:h-full md:min-h-[420px]">
                <span className="text-3xl font-black tracking-tight text-ink sm:text-4xl">EDIT PACK</span>
              </div>
            )}

            <div className="flex flex-col justify-center p-5 text-center sm:p-8">
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{product.name}</h1>
              {product.tagline && <p className="mt-2 text-sm text-muted sm:text-base">{product.tagline}</p>}

              {product.features.length > 0 && (
              <ul className="mx-auto mt-5 grid gap-2 text-left sm:grid-cols-2 md:grid-cols-1">
                {product.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                    {f}
                  </li>
                ))}
              </ul>
              )}

              <div className="pt-6">
                <div className="flex items-baseline justify-center gap-3">
                  {refCode && hasDiscount && (
                    <span className="text-xl font-semibold text-muted line-through">₹{prices.full}</span>
                  )}
                  <span className="text-3xl font-bold">₹{price}</span>
                </div>

                <button
                  onClick={handleBuy}
                  disabled={busy}
                  className="mt-4 w-full rounded-2xl bg-ink py-4 text-base font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg"
                >
                  {busy ? "Please wait…" : "Buy now"}
                </button>

                <div className="mt-3 text-sm text-muted">
                  {refCode && !showCode ? (
                    <p>
                      Promo code <span className="font-semibold uppercase text-ink">{refCode}</span> applied
                      {hasDiscount && <> · <span className="font-semibold text-ink">₹{prices.full - prices.code} off</span></>} ·{" "}
                      <button onClick={() => setShowCode(true)} className="underline-offset-4 hover:text-ink hover:underline">
                        change
                      </button>{" "}·{" "}
                      <button onClick={removeCode} className="underline-offset-4 hover:text-ink hover:underline">
                        remove
                      </button>
                    </p>
                  ) : (
                    <>
                      {hasDiscount && !refCode && (
                        <p className="mb-2">Have a promo code? Enter it to pay ₹{prices.code}.</p>
                      )}
                      <form onSubmit={handleCode} className="flex gap-2">
                        <input
                          value={codeInput}
                          onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
                          placeholder="Promo code"
                          aria-label="Promo code"
                          autoCapitalize="characters"
                          autoComplete="off"
                          className="min-w-0 flex-1 rounded-xl border border-line bg-soft px-3 py-2 text-base uppercase text-ink outline-none focus:border-ink"
                        />
                        <button
                          disabled={!codeInput.trim() || codeBusy}
                          className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {codeBusy ? "Checking…" : "Apply"}
                        </button>
                      </form>
                      {refCode && (
                        <button type="button" onClick={() => { setShowCode(false); setCodeError(""); }} className="mt-2 underline-offset-4 hover:text-ink hover:underline">
                          Keep {refCode.toUpperCase()}
                        </button>
                      )}
                    </>
                  )}
                  {codeError && <p className="mt-2 text-xs text-red-600">{codeError}</p>}
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  {!showRestore ? (
                    <button
                      onClick={() => setShowRestore(true)}
                      className="w-full text-center text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
                    >
                      Already paid? Restore access
                    </button>
                  ) : (
                    <form onSubmit={handleRestore} className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={restoreId}
                        onChange={(e) => setRestoreId(e.target.value)}
                        placeholder="UPI transaction ID or pay_…"
                        aria-label="UPI transaction ID or Payment ID"
                        className="min-w-0 flex-1 rounded-xl border border-line bg-soft px-3 py-3 font-mono text-base outline-none focus:border-ink sm:py-2"
                      />
                      <button
                        disabled={busy || !restoreId.trim()}
                        className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:py-2"
                      >
                        Unlock
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <p className="mx-auto mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
      </main>
    </div>
  );
}
