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
        theme: { color: "#8b6a45" },
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
    <div className="min-h-dvh bg-cream text-ink antialiased">
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:py-16">
        <header className="mb-6 flex items-center justify-between sm:mb-10">
          <span className="text-sm font-semibold tracking-wide sm:text-base">{product.brand}</span>
          {product.instagram && (
            <a
              href={product.instagram}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-tan/50 px-3 py-1 text-xs font-medium text-tan-dark transition hover:bg-sand"
            >
              Instagram
            </a>
          )}
        </header>

        {status === "checking" && (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-tan border-t-transparent" />
          </div>
        )}

        {status === "unlocked" && (
          <section className="mx-auto max-w-md rounded-3xl border border-sand bg-white p-6 text-center shadow-[0_10px_40px_-15px_rgba(58,46,36,0.25)] sm:p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sand text-2xl text-tan-dark">✓</div>
            <h1 className="text-2xl font-bold sm:text-3xl">You're in!</h1>
            <p className="mt-2 text-sm text-muted">{product.name}</p>
            <a
              href={`/api/download?token=${encodeURIComponent(token)}`}
              className="mt-6 block w-full rounded-2xl bg-tan-dark py-4 text-base font-semibold text-white transition hover:bg-ink sm:text-lg"
            >
              Download
            </a>
            {paymentId && (
              <p className="mt-5 rounded-xl bg-cream px-3 py-2 text-xs text-muted">
                Payment ID
                <span className="mt-1 block select-all break-all font-mono text-ink">{paymentId}</span>
              </p>
            )}
          </section>
        )}

        {status === "locked" && (
          <section className="overflow-hidden rounded-3xl border border-sand bg-white shadow-[0_10px_40px_-15px_rgba(58,46,36,0.25)] md:grid md:grid-cols-2">
            {product.preview ? (
              <img
                src={product.preview}
                alt={product.name}
                className="aspect-video w-full object-cover md:aspect-auto md:h-full"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-sand via-tan to-tan-dark md:aspect-auto md:h-full md:min-h-[420px]">
                <span className="text-3xl font-black tracking-tight text-white sm:text-4xl">EDIT PACK</span>
              </div>
            )}

            <div className="flex flex-col p-5 sm:p-8">
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{product.name}</h1>
              {product.tagline && <p className="mt-2 text-sm text-muted sm:text-base">{product.tagline}</p>}

              <ul className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                {product.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tan" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-6">
                <span className="text-3xl font-bold">₹{product.priceInr}</span>

                <button
                  onClick={handleBuy}
                  disabled={busy}
                  className="mt-4 w-full rounded-2xl bg-tan-dark py-4 text-base font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg"
                >
                  {busy ? "Please wait…" : "Buy now"}
                </button>

                <div className="mt-5 border-t border-sand pt-4">
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
                        className="min-w-0 flex-1 rounded-xl border border-sand bg-cream px-3 py-3 font-mono text-base outline-none focus:border-tan sm:py-2 sm:text-sm"
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
