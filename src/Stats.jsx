import { useEffect, useState } from "react";

// /stats?code=rahul&key=SECRET → that influencer's own numbers
// /stats?admin=ADMIN_KEY        → every influencer, plus recording payouts (for you)

async function post(body) {
  const r = await fetch("/api/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

const inr = (paise) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n) => n.toLocaleString("en-IN");
const date = (ms) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const refLink = (code) => `${window.location.origin}/?ref=${code}`;

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink"
    >
      {done ? "Copied" : label}
    </button>
  );
}

function saleStatus(s, holdDays) {
  if (s.refunded) return <span className="text-red-600">Refunded</span>;
  if (Date.now() - s.at < holdDays * 24 * 60 * 60 * 1000) return <span className="text-muted">On hold</span>;
  return <span className="text-ink">Cleared</span>;
}

function InfluencerView({ s }) {
  return (
    <>
      <h1 className="text-2xl font-bold sm:text-3xl">Hi {s.name}</h1>
      <p className="mt-1 text-sm text-muted">
        Code <span className="font-semibold uppercase text-ink">{s.code}</span> · you earn {s.percent}% of every sale
      </p>
      {!s.active && (
        <p className="mt-3 rounded-xl bg-soft px-3 py-2 text-sm text-muted">
          Your link and code are paused, so new visitors aren't counted. Your past sales and payments are below.
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 rounded-2xl bg-soft p-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{refLink(s.code)}</span>
        <CopyButton text={refLink(s.code)} label="Copy link" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Visits" value={num(s.visits)} />
        <Tile label="Sales" value={num(s.sales)} hint={`${num(s.salesThisMonth)} this month`} />
        <Tile label="Conversion" value={`${s.conversion}%`} hint="sales ÷ visits" />
        <Tile label="Earned this month" value={inr(s.earnedThisMonth)} />
        <Tile label="Earned in total" value={inr(s.earnedTotal)} hint={`paid so far ${inr(s.paid)}`} />
        <Tile label="Due to you" value={inr(s.owed)} hint={`sales older than ${s.holdDays} days, not yet paid`} />
      </div>

      <h2 className="mt-8 text-lg font-bold">Recent sales</h2>
      {s.recentSales.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No sales yet. They'll show up here as soon as someone buys with your link or code.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-soft text-left text-xs text-muted">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Sale</th><th className="px-3 py-2">Your share</th><th className="px-3 py-2">Status</th></tr>
            </thead>
            <tbody>
              {s.recentSales.map((x, i) => (
                <tr key={i} className="border-t border-line tabular-nums">
                  <td className="px-3 py-2">{date(x.at)}</td>
                  <td className="px-3 py-2">{inr(x.amount)}</td>
                  <td className="px-3 py-2 font-semibold">{inr(x.commission)}</td>
                  <td className="px-3 py-2">{saleStatus(x, s.holdDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        "On hold" sales are paid after {s.holdDays} days, in case of refunds. Refunded sales don't count.
      </p>

      {s.payouts.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-bold">Payments to you</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line text-sm">
            {s.payouts.map((p, i) => (
              <li key={i} className="flex justify-between gap-3 px-3 py-2">
                <span>{date(p.at)}{p.note && <span className="text-muted"> · {p.note}</span>}</span>
                <span className="font-semibold tabular-nums">{inr(p.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function PayoutForm({ inf, adminKey, onDone }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!window.confirm(`Record a payment of ₹${amount} to ${inf.name}? This can't be undone from this page.`)) return;
    setBusy(true);
    setError("");
    try {
      onDone(await post({ admin: adminKey, action: "payout", code: inf.code, amountInr: amount, note }));
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder={`₹ amount (due ${inr(inf.owed)})`}
        inputMode="decimal"
        className="w-44 rounded-xl border border-line bg-soft px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (e.g. UPI ref)"
        maxLength={100}
        className="min-w-0 flex-1 rounded-xl border border-line bg-soft px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <button disabled={busy || !(Number(amount) > 0)} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Record payout
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

const field = "rounded-xl border border-line bg-soft px-3 py-2 text-sm outline-none focus:border-ink";
const darkBtn = "rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const lightBtn = "rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink disabled:opacity-50";

// Runs an admin action and shows its error; on success the page gets the fresh list.
function useAdmin(adminKey, onUpdate) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(body) {
    setBusy(true);
    setError("");
    try {
      onUpdate(await post({ admin: adminKey, ...body }));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function AddInfluencer({ adminKey, onUpdate }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const { busy, error, run } = useAdmin(adminKey, onUpdate);

  async function submit(e) {
    e.preventDefault();
    if (await run({ action: "add", name, code, percent })) {
      setName(""); setCode(""); setPercent("");
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-line p-4">
      <h2 className="text-lg font-bold">Add influencer</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Rahul)" maxLength={60} className={`min-w-0 flex-1 ${field}`} />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          placeholder="Code (e.g. rahul)"
          maxLength={30}
          className={`w-40 uppercase ${field}`}
        />
        <input
          value={percent}
          onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="% per sale"
          inputMode="decimal"
          className={`w-28 ${field}`}
        />
        <button disabled={busy || !name.trim() || code.length < 2 || percent === ""} className={darkBtn}>Add</button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Their link becomes {window.location.origin}/?ref={code || "code"}. It works straight away, with no redeploy.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

function InfluencerCard({ s, adminKey, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [percent, setPercent] = useState(String(s.percent));
  const { busy, error, run } = useAdmin(adminKey, onUpdate);

  async function save(e) {
    e.preventDefault();
    if (await run({ action: "update", code: s.code, name, percent })) setEditing(false);
  }
  function togglePause() {
    const msg = s.active
      ? `Pause ${s.name}? Their link and code stop working for new buyers. Past sales and payouts stay.`
      : `Resume ${s.name}? Their link and code will work again.`;
    if (window.confirm(msg)) run({ action: "update", code: s.code, active: !s.active });
  }
  function resetKey() {
    if (window.confirm(`Make a new stats link for ${s.name}? Their old stats link will stop working.`)) {
      run({ action: "update", code: s.code, newKey: true });
    }
  }

  return (
    <section className={`rounded-2xl border border-line p-4 ${s.active ? "" : "bg-soft"}`}>
      {editing ? (
        <form onSubmit={save} className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Name" className={`min-w-0 flex-1 ${field}`} />
          <input
            value={percent}
            onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            aria-label="Percent per sale"
            className={`w-24 ${field}`}
          />
          <button disabled={busy} className={darkBtn}>Save</button>
          <button type="button" onClick={() => { setEditing(false); setName(s.name); setPercent(String(s.percent)); }} className={lightBtn}>Cancel</button>
          <p className="w-full text-xs text-muted">A new % applies to new sales only.</p>
        </form>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            {s.name} <span className="text-sm font-semibold uppercase text-muted">{s.code} · {s.percent}%</span>
            {!s.active && <span className="ml-2 rounded-md bg-line px-2 py-0.5 text-xs font-semibold text-muted">Paused</span>}
          </h2>
          <p className="text-sm">
            Owed <span className="font-bold tabular-nums">{inr(s.owed)}</span>
          </p>
        </div>
      )}
      <p className="mt-1 text-sm tabular-nums text-muted">
        {num(s.visits)} visits · {num(s.sales)} sales ({s.conversion}%) · {num(s.salesThisMonth)} this month ·{" "}
        {s.refunded} refunded · earned {inr(s.earnedTotal)} · paid {inr(s.paid)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={refLink(s.code)} label="Copy their link" />
        <CopyButton text={`${window.location.origin}/stats?code=${s.code}&key=${encodeURIComponent(s.key)}`} label="Copy their stats link" />
        {!editing && <button onClick={() => setEditing(true)} className={lightBtn}>Edit</button>}
        <button onClick={togglePause} disabled={busy} className={lightBtn}>{s.active ? "Pause" : "Resume"}</button>
        <button onClick={resetKey} disabled={busy} className={lightBtn}>New stats link</button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <PayoutForm inf={s} adminKey={adminKey} onDone={onUpdate} />
    </section>
  );
}

function AdminView({ data, adminKey, onUpdate }) {
  const list = data.influencers;
  const sum = (f) => list.reduce((a, x) => a + x[f], 0);
  return (
    <>
      <h1 className="text-2xl font-bold sm:text-3xl">Influencers</h1>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Visits" value={num(sum("visits"))} />
        <Tile label="Sales" value={num(sum("sales"))} />
        <Tile label="Commission earned" value={inr(sum("earnedTotal"))} />
        <Tile label="You owe now" value={inr(sum("owed"))} />
      </div>

      <AddInfluencer adminKey={adminKey} onUpdate={onUpdate} />

      {list.length === 0 && <p className="mt-6 text-sm text-muted">No influencers yet. Add your first one above.</p>}

      <div className="mt-4 space-y-4">
        {list.map((s) => (
          <InfluencerCard key={s.code} s={s} adminKey={adminKey} onUpdate={onUpdate} />
        ))}
      </div>
    </>
  );
}

export default function Stats() {
  const params = new URLSearchParams(window.location.search);
  const adminKey = params.get("admin");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const body = adminKey !== null ? { admin: adminKey } : { code: params.get("code") || "", key: params.get("key") || "" };
    post(body).then(setData).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh bg-white text-ink antialiased">
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : !data ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          </div>
        ) : data.admin ? (
          <AdminView data={data} adminKey={adminKey} onUpdate={setData} />
        ) : (
          <InfluencerView s={data.influencer} />
        )}
      </main>
    </div>
  );
}
