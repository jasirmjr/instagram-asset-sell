import { Fragment, useEffect, useState } from "react";

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

const inr = (paise) => {
  const digits = paise % 100 === 0 ? 0 : 2; // ₹200, but ₹558.60 (not ₹558.6)
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};
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
    <form onSubmit={submit} className="mt-2 grid grid-cols-[7rem_1fr] gap-2">
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="₹ amount"
        inputMode="decimal"
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (e.g. UPI ref)"
        maxLength={100}
        className="min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
      />
      <button disabled={busy || !(Number(amount) > 0)} className="col-span-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Record payout
      </button>
      {error && <p className="col-span-2 text-xs text-red-600">{error}</p>}
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

function AddInfluencer({ adminKey, onUpdate, onClose }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const { busy, error, run } = useAdmin(adminKey, onUpdate);

  async function submit(e) {
    e.preventDefault();
    if (await run({ action: "add", name, code, percent })) onClose();
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-line bg-soft p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
        <label className="text-xs font-semibold text-muted">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul" maxLength={60} autoFocus className={`mt-1 block w-full bg-white ${field}`} />
        </label>
        <label className="text-xs font-semibold text-muted">
          Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
            placeholder="rahul"
            maxLength={30}
            className={`mt-1 block w-full bg-white uppercase ${field}`}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          % per sale
          <input
            value={percent}
            onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="10"
            inputMode="decimal"
            className={`mt-1 block w-full bg-white ${field}`}
          />
        </label>
        <div className="flex gap-2">
          <button disabled={busy || !name.trim() || code.length < 2 || percent === ""} className={darkBtn}>Add</button>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-ink">Cancel</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Their link: {window.location.origin}/?ref={code || "code"} · works straight away
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

function StatusPill({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-soft px-2.5 py-0.5 text-xs font-semibold text-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-ink" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-muted" /> Paused
    </span>
  );
}

// Opens under a row: everything you can do for one influencer.
function ManagePanel({ s, adminKey, onUpdate }) {
  const [name, setName] = useState(s.name);
  const [percent, setPercent] = useState(String(s.percent));
  const { busy, error, run } = useAdmin(adminKey, onUpdate);
  const changed = name.trim() !== s.name || Number(percent) !== s.percent;

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

  const heading = "text-xs font-semibold uppercase tracking-wide text-muted";
  return (
    <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-3">
      <div>
        <p className={heading}>Links</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyButton text={refLink(s.code)} label="Copy buyer link" />
          <CopyButton text={`${window.location.origin}/stats?code=${s.code}&key=${encodeURIComponent(s.key)}`} label="Copy stats link" />
        </div>
        <p className="mt-2 break-all font-mono text-xs text-muted">{refLink(s.code)}</p>
        <button onClick={resetKey} disabled={busy} className="mt-2 text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          Stats link leaked? Make a new one
        </button>
      </div>

      <div>
        <p className={heading}>Details</p>
        <form
          onSubmit={(e) => { e.preventDefault(); run({ action: "update", code: s.code, name, percent }); }}
          className="mt-2 flex flex-wrap gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Name" className={`min-w-0 flex-1 bg-white ${field}`} />
          <div className="relative">
            <input
              value={percent}
              onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              aria-label="Percent per sale"
              className={`w-20 bg-white pr-7 ${field}`}
            />
            <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted">%</span>
          </div>
          <button disabled={busy || !changed} className={darkBtn}>Save</button>
        </form>
        <p className="mt-1 text-xs text-muted">A new % applies to new sales only.</p>
        <div className="mt-3 flex items-center gap-3">
          <StatusPill active={s.active} />
          <button onClick={togglePause} disabled={busy} className={lightBtn}>{s.active ? "Pause" : "Resume"}</button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div>
        <p className={heading}>Pay {s.name}</p>
        <p className="mt-2 text-sm">
          Due now <span className="font-bold tabular-nums">{inr(s.owed)}</span>
          {s.earnedTotal - s.readyToPay > 0 && (
            <span className="text-muted"> · {inr(s.earnedTotal - s.readyToPay)} on hold ({s.holdDays} days)</span>
          )}
        </p>
        <PayoutForm inf={s} adminKey={adminKey} onDone={onUpdate} />
        {s.payouts.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {s.payouts.slice(0, 5).map((p, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{date(p.at)}{p.note && ` · ${p.note}`}</span>
                <span className="font-semibold tabular-nums text-ink">{inr(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const pct = (sales, visits) => (visits ? Math.round((sales / visits) * 1000) / 10 : 0);

function AdminView({ data, adminKey, onUpdate }) {
  const list = data.influencers;
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const sum = (f) => list.reduce((a, x) => a + x[f], 0);
  const totalVisits = sum("visits");
  const totalSales = sum("sales");

  const th = "whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted";
  const td = "whitespace-nowrap px-3 py-3 tabular-nums";
  const right = "text-right";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Influencers</h1>
        {!adding && <button onClick={() => setAdding(true)} className={darkBtn}>+ Add influencer</button>}
      </div>

      {adding && <AddInfluencer adminKey={adminKey} onUpdate={onUpdate} onClose={() => setAdding(false)} />}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Visits" value={num(totalVisits)} />
        <Tile label="Sales" value={num(totalSales)} hint={`${pct(totalSales, totalVisits)}% of visits`} />
        <Tile label="Commission earned" value={inr(sum("earnedTotal"))} hint={`paid ${inr(sum("paid"))}`} />
        <Tile label="You owe now" value={inr(sum("owed"))} hint={`sales older than ${list[0]?.holdDays ?? 7} days`} />
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
          No influencers yet. Click <span className="font-semibold text-ink">+ Add influencer</span> to add your first one.
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line bg-soft text-left">
                <tr>
                  <th className={th}>Influencer</th>
                  <th className={th}>Code</th>
                  <th className={`${th} ${right}`}>Share</th>
                  <th className={`${th} ${right}`}>Visits</th>
                  <th className={`${th} ${right}`}>Sales</th>
                  <th className={`${th} ${right}`}>Conversion</th>
                  <th className={`${th} ${right}`}>Earned</th>
                  <th className={`${th} ${right}`}>Paid</th>
                  <th className={`${th} ${right}`}>Owed now</th>
                  <th className={th}>Status</th>
                  <th className={th}><span className="sr-only">Manage</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s, i) => {
                  const isOpen = open === s.code;
                  return (
                    <Fragment key={s.code}>
                      <tr
                        onClick={() => setOpen(isOpen ? null : s.code)}
                        className={`cursor-pointer hover:bg-soft ${i > 0 ? "border-t border-line" : ""} ${isOpen ? "bg-soft" : ""} ${s.active ? "" : "text-muted"}`}
                      >
                        <td className="px-3 py-3 font-semibold">{s.name}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs uppercase">{s.code}</td>
                        <td className={`${td} ${right}`}>{s.percent}%</td>
                        <td className={`${td} ${right}`}>{num(s.visits)}</td>
                        <td className={`${td} ${right}`}>
                          {num(s.sales)}
                          {s.refunded > 0 && <span className="block text-xs text-red-600">{s.refunded} refunded</span>}
                        </td>
                        <td className={`${td} ${right}`}>{s.conversion}%</td>
                        <td className={`${td} ${right}`}>{inr(s.earnedTotal)}</td>
                        <td className={`${td} ${right}`}>{inr(s.paid)}</td>
                        <td className={`${td} ${right} ${s.owed > 0 ? "font-bold text-ink" : "text-muted"}`}>{inr(s.owed)}</td>
                        <td className="px-3 py-3"><StatusPill active={s.active} /></td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold text-ink">
                          {isOpen ? "Close ▴" : "Manage ▾"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-line">
                          <td colSpan={11} className="bg-white p-0">
                            <ManagePanel key={`${s.code}-${s.name}-${s.percent}`} s={s} adminKey={adminKey} onUpdate={onUpdate} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-line bg-soft font-semibold">
                <tr>
                  <td className="px-3 py-3" colSpan={3}>Total · {list.length} influencer{list.length === 1 ? "" : "s"}</td>
                  <td className={`${td} ${right}`}>{num(totalVisits)}</td>
                  <td className={`${td} ${right}`}>{num(totalSales)}</td>
                  <td className={`${td} ${right}`}>{pct(totalSales, totalVisits)}%</td>
                  <td className={`${td} ${right}`}>{inr(sum("earnedTotal"))}</td>
                  <td className={`${td} ${right}`}>{inr(sum("paid"))}</td>
                  <td className={`${td} ${right}`}>{inr(sum("owed"))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Click a row to copy links, edit, pause or record a payout.</p>
        </>
      )}
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
      <main className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-10 ${adminKey !== null ? "max-w-6xl" : "max-w-3xl"}`}>
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
