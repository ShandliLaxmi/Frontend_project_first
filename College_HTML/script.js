const $ = s => document.querySelector(s);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/* ---------- Tabs ---------- */
document.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[role=tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('[role=tabpanel]').forEach(p => p.hidden = p.id !== b.dataset.tab);
  window.scrollTo(0, 0);
}));

/* ---------- Prediction ---------- */
// Set this to your model endpoint (Flask/FastAPI) once the trained model is ready.
// Expected response: { "probability": 0.784 }
const MODEL_API_URL = "";

$('#month').innerHTML = MONTHS.map(m => `<option>${m}</option>`).join('');
const num = (id, d = 0) => { const v = parseFloat($('#' + id).value); return Number.isFinite(v) ? v : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function readForm() {
  return { hotel: $('#hotel').value, month: $('#month').value, lead: clamp(num('lead'), 0, 700),
    wk: num('wk'), wd: num('wd'), adults: num('adults', 1), kids: num('kids'),
    segment: $('#segment').value, deposit: $('#deposit').value, cust: $('#cust').value,
    adr: clamp(num('adr'), 0, 500), prev: num('prev'), chg: num('chg'), req: num('req') };
}

// Stand-in scoring (log-odds). Replace with the trained model's output.
function estimate(p) {
  const f = [], add = (text, v) => f.push({ text, v });
  const seg = { "Groups": 1.0, "Online TA": 0.1, "Offline TA/TO": -0.1, "Aviation": -0.6, "Corporate": -0.7, "Direct": -0.8, "Complementary": -1.0 };
  const cust = { "Transient": 0.2, "Transient-Party": -0.3, "Contract": -0.1, "Group": -0.9 };
  const dep = { "No Deposit": [0, "No deposit"], "Non Refund": [5, "Non-refundable deposit"], "Refundable": [-0.3, "Refundable deposit"] };
  const mi = MONTHS.indexOf(p.month);
  add(`Booked ${p.lead} days ahead`, (Math.min(p.lead, 450) - 104) * 0.0045);
  add(p.hotel, p.hotel === "City Hotel" ? 0.2 : -0.25);
  add(dep[p.deposit][1], dep[p.deposit][0]);
  add(`Market segment: ${p.segment}`, seg[p.segment]);
  add(`Customer type: ${p.cust}`, cust[p.cust]);
  add(`${p.prev} earlier cancellation${p.prev === 1 ? '' : 's'}`, p.prev > 0 ? 2.8 : 0);
  add(`${p.req} special request${p.req === 1 ? '' : 's'}`, -0.7 * Math.min(p.req, 4));
  add(`${p.chg} booking change${p.chg === 1 ? '' : 's'}`, -0.3 * Math.min(p.chg, 4));
  add(`Daily rate of €${p.adr}`, (p.adr - 100) * 0.006);
  add(`Arriving in ${p.month}`, mi >= 3 && mi <= 7 ? 0.15 : (mi >= 10 || mi <= 1 ? -0.2 : 0));
  const logit = -0.7 + f.reduce((s, x) => s + x.v, 0);
  return { prob: 1 / (1 + Math.exp(-logit)), factors: f };
}

async function predict(p) {
  if (MODEL_API_URL) {
    const r = await fetch(MODEL_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const d = await r.json();
    return { prob: d.probability, factors: d.factors || [] };
  }
  return estimate(p);
}

function render({ prob, factors }) {
  const pct = prob * 100;
  const level = pct < 40 ? "Low" : pct < 70 ? "Medium" : "High";
  const actions = {
    High: "Send a confirmation reminder and contact the guest before arrival.",
    Medium: "Send an automated reminder closer to the arrival date.",
    Low: "No action needed. Keep the booking on the normal schedule."
  };
  $('#result').dataset.level = level;
  $('#arc').setAttribute('stroke-dasharray', `${pct.toFixed(1)} 100`);
  $('#pct').textContent = pct.toFixed(1) + "%";
  $('#level').textContent = level + " risk";
  $('#verdict').textContent = pct >= 50 ? "Likely to cancel" : "Likely to stay";
  $('#action').textContent = actions[level];
  const top = factors.filter(x => Math.abs(x.v) >= 0.15).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4);
  $('#factors').innerHTML = top.length
    ? top.map(x => `<li><span>${x.text}</span><span class="${x.v > 0 ? 'up' : 'down'}">${x.v > 0 ? 'Raises risk' : 'Lowers risk'}</span></li>`).join('')
    : '<li><span>No single detail stands out.</span></li>';
}

const run = async () => render(await predict(readForm()));
$('#form').addEventListener('submit', e => { e.preventDefault(); run(); });

function fill(v) { Object.entries(v).forEach(([k, val]) => $('#' + k).value = val); run(); }
$('#exA').onclick = () => fill({ hotel: "City Hotel", month: "June", lead: 200, wk: 1, wd: 3, adults: 2, kids: 0, segment: "Groups", deposit: "No Deposit", cust: "Transient", adr: 120, prev: 0, chg: 0, req: 0 });
$('#exB').onclick = () => fill({ hotel: "Resort Hotel", month: "January", lead: 12, wk: 1, wd: 2, adults: 2, kids: 0, segment: "Direct", deposit: "No Deposit", cust: "Transient", adr: 85, prev: 0, chg: 1, req: 2 });

/* ---------- Analytics (figures computed from hotel_bookings.csv) ---------- */
function bars(id, rows) {
  const max = Math.max(...rows.map(r => r[1]));
  $(id).innerHTML = rows.map(([l, r, n]) => `<div class="row${r === max ? ' hi' : ''}"><span>${l}<small>${n.toLocaleString()} bookings</small></span><span class="t"><i style="width:${(r * 100).toFixed(1)}%"></i></span><span class="v">${(r * 100).toFixed(1)}%</span></div>`).join('');
}
bars('#c-hotel', [["City Hotel", .4173, 79330], ["Resort Hotel", .2776, 40060]]);
bars('#c-dep', [["Non Refund", .9936, 14587], ["No Deposit", .2838, 104641], ["Refundable", .2222, 162]]);
bars('#c-lead', [["0–7 days", .0963, 19746], ["8–30 days", .2786, 18960], ["31–90 days", .3770, 29553], ["91–180 days", .4471, 26439], ["181–365 days", .5545, 21544], ["Over 365 days", .6766, 3148]]);
bars('#c-seg', [["Groups", .6106, 19811], ["Online TA", .3672, 56477], ["Offline TA/TO", .3432, 24219], ["Aviation", .2194, 237], ["Corporate", .1873, 5295], ["Direct", .1534, 12606], ["Complementary", .1306, 743]]);
bars('#c-req', [["0 requests", .4772, 70318], ["1 request", .2202, 33226], ["2 requests", .2210, 12969], ["3 or more", .1682, 2877]]);
const mrate = [.3048, .3342, .3215, .4080, .3967, .4146, .3745, .3775, .3917, .3805, .3123, .3497];
const mmax = Math.max(...mrate);
$('#c-month').innerHTML = mrate.map((r, i) => `<div class="col${r === mmax ? ' hi' : ''}"><span>${Math.round(r * 100)}</span><i style="height:${(r / 0.45 * 150).toFixed(0)}px"></i><b style="font-weight:500">${MONTHS[i].slice(0, 3)}</b></div>`).join('');

/* ---------- Model results (fill in after training) ---------- */
const METRICS = { "Accuracy": [null, null], "Precision": [null, null], "Recall": [null, null], "F1-score": [null, null], "ROC-AUC": [null, null] };
$('#metrics').innerHTML = Object.entries(METRICS).map(([k, [a, b]]) =>
  `<tr><td>${k}</td>${[a, b].map(v => v == null ? '<td class="pend">Pending training</td>' : `<td>${v}</td>`).join('')}</tr>`).join('');

run();