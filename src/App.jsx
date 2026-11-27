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
  if (!r.ok) throw new Error(data.error || "Something went wrong");
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

export default function App() {
  const [status, setStatus] = useState("checking"); // checking | locked | unlocked
  const [token, setToken] = useState(null);
  const [paymentId, setPaymentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [restoreId, setRestoreId] = useState("");

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
      const order = await post("/api/create-order", {});
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: product.brand,
        description: product.name,
        theme: { color: "#8b5cf6" },
        handler: async (resp) => {
          try {
            const d = await post("/api/verify-payment", resp);
            unlock(d.token, d.paymentId);
          } catch (e) {
            setError(`${e.message}. If money was deducted, use "Restore access" with your Payment ID.`);
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
      setError(e.message);
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.25),transparent_60%)]" />

      <main className="relative mx-auto max-w-md px-5 py-10">
        <header className="mb-8 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-wide text-neutral-300">{product.brand}</span>
          {product.instagram && (
            <a href={product.instagram} target="_blank" rel="noreferrer" className="text-xs text-violet-300 hover:text-violet-200">
              Instagram ↗
            </a>
          )}
        </header>

        {status === "checking" && (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          </div>
        )}

        {status === "unlocked" && (
          <section className="rounded-3xl border border-emerald-500/30 bg-neutral-900/80 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl">✓</div>
            <h1 className="text-2xl font-bold">You're in!</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Thanks for buying <span className="text-neutral-200">{product.name}</span>. Come back to this link anytime to download again.
            </p>
            <a
              href={`/api/download?token=${encodeURIComponent(token)}`}
              className="mt-6 block w-full rounded-2xl bg-emerald-500 py-4 text-lg font-semibold text-neutral-950 transition hover:bg-emerald-400"
            >
              Download assets
            </a>
            {paymentId && (
              <p className="mt-5 rounded-xl bg-neutral-800/70 px-3 py-2 text-xs text-neutral-400">
                Save your Payment ID to unlock on another phone:
                <br />
                <span className="select-all font-mono text-neutral-200">{paymentId}</span>
              </p>
            )}
          </section>
        )}

        {status === "locked" && (
          <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/80 shadow-2xl">
            {product.preview ? (
              <img src={product.preview} alt={product.name} className="aspect-video w-full object-cover" />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500">
                <span className="text-4xl font-black tracking-tight text-white/90">EDIT PACK</span>
              </div>
            )}

            <div className="p-6">
              <h1 className="text-2xl font-bold leading-tight">{product.name}</h1>
              <p className="mt-2 text-sm text-neutral-400">{product.tagline}</p>

              <ul className="mt-5 space-y-2">
                {product.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                    <span className="mt-0.5 text-violet-400">●</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex items-baseline gap-3">
                <span className="text-3xl font-bold">₹{product.priceInr}</span>
                {product.originalPriceInr && (
                  <span className="text-lg text-neutral-500 line-through">₹{product.originalPriceInr}</span>
                )}
              </div>

              <button
                onClick={handleBuy}
                disabled={busy}
                className="mt-4 w-full rounded-2xl bg-violet-500 py-4 text-lg font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Please wait…" : "Buy now"}
              </button>
              <p className="mt-2 text-center text-xs text-neutral-500">Secure payment via Razorpay · UPI, cards, netbanking</p>

              <div className="mt-6 border-t border-neutral-800 pt-4">
                {!showRestore ? (
                  <button onClick={() => setShowRestore(true)} className="w-full text-center text-sm text-neutral-400 underline-offset-4 hover:underline">
                    Already paid? Restore access
                  </button>
                ) : (
                  <form onSubmit={handleRestore} className="space-y-2">
                    <label className="block text-xs text-neutral-400">
                      Enter your Payment ID (starts with <span className="font-mono">pay_</span>, it's in your Razorpay receipt email)
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={restoreId}
                        onChange={(e) => setRestoreId(e.target.value)}
                        placeholder="pay_XXXXXXXXXXXX"
                        className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-violet-400"
                      />
                      <button disabled={busy || !restoreId.trim()} className="rounded-xl bg-neutral-100 px-4 text-sm font-semibold text-neutral-950 disabled:opacity-50">
                        Unlock
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
        )}
      </main>
    </div>
  );
}
