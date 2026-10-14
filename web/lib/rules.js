// Notification rules.
//
// Each rule is self-contained: when it should fire, how often it may repeat,
// and what it says. Adding a new kind of notification means adding one object
// to the RULES array -- nothing else changes. That is the point of the shape:
// mood and sleep trend rules will slot in here once enough data exists to
// support them (see "FUTURE" at the bottom).
//
// Rules are evaluated in order and the FIRST match wins, so the list runs from
// most urgent to most routine. One notification per day, maximum.

// --- Research-backed tips (PRD must-have #3) --------------------------------
// Deliberately a small curated set with sources attached, rather than generated
// text. General wellness framing only -- this is not medical advice, and the
// citation travels with every tip so it can be checked.
const TIPS = [
  {
    phase: "luteal",
    body: "Magnesium-rich foods (leafy greens, nuts, dark chocolate) are commonly "
        + "suggested for premenstrual symptoms. — Office on Women's Health, PMS",
  },
  {
    phase: "luteal",
    body: "Regular aerobic exercise is associated with reduced PMS symptom "
        + "severity. — ACOG, Premenstrual Syndrome",
  },
  {
    phase: "menstrual",
    body: "Heat applied to the lower abdomen is as effective as some pain relievers "
        + "for menstrual cramps in several trials. — Cochrane Review",
  },
  {
    phase: "menstrual",
    body: "Iron needs rise during menstruation. Pairing iron-rich foods with "
        + "vitamin C improves absorption. — NIH Office of Dietary Supplements",
  },
  {
    phase: "follicular",
    body: "Energy and mood often rise in the week after a period as estrogen "
        + "climbs — a good window for demanding work. — ACOG",
  },
  {
    phase: "any",
    body: "Consistent sleep timing supports more stable cycles. Irregular sleep is "
        + "linked to greater cycle variability. — Sleep Foundation",
  },
];

function pickTip(phase, seed) {
  const pool = TIPS.filter((t) => t.phase === phase || t.phase === "any");
  if (!pool.length) return null;
  return pool[seed % pool.length];
}

// --- Rules ------------------------------------------------------------------

export const RULES = [
  {
    id: "period-heads-up",
    // Two days before the earliest likely start.
    cooldownDays: 20,
    match: (c) => c.daysUntilWindow === 2,
    build: (c) => ({
      title: "Period likely soon",
      body: `Your window opens in 2 days (${c.fmt(c.windowStart)}–${c.fmt(c.windowEnd)}).`
          + (c.confidence === "low" ? " Still early data, so treat this as rough." : ""),
    }),
  },
  {
    id: "period-window-open",
    cooldownDays: 20,
    match: (c) => c.daysUntilWindow === 0,
    build: (c) => ({
      title: "Period window starts today",
      body: `Expected between today and ${c.fmt(c.windowEnd)}.`,
    }),
  },
  {
    id: "period-late",
    cooldownDays: 10,
    match: (c) => c.daysUntilWindow <= -3,
    build: (c) => ({
      title: "Period later than expected",
      body: `${Math.abs(c.daysUntilWindow)} days past your predicted window. `
          + `Cycle variation is normal — worth logging either way.`,
    }),
  },
  {
    id: "luteal-heads-up",
    // Roughly the week before the period is due: the PMS window.
    cooldownDays: 20,
    match: (c) => c.daysUntilWindow >= 3 && c.daysUntilWindow <= 7,
    build: (c) => {
      const tip = pickTip("luteal", c.cycleDay);
      return {
        title: "Entering your luteal phase",
        body: tip ? tip.body : "This is when premenstrual symptoms typically appear.",
      };
    },
  },
  {
    id: "menstrual-tip",
    cooldownDays: 3,
    match: (c) => c.onPeriod,
    build: (c) => {
      const tip = pickTip("menstrual", c.cycleDay);
      return { title: "Petal Ping", body: tip ? tip.body : "Day " + c.cycleDay + " of your period." };
    },
  },
  {
    id: "weekly-tip",
    // The quiet default so the app stays useful between cycle events.
    cooldownDays: 7,
    match: () => true,
    build: (c) => {
      const tip = pickTip(c.phase, c.cycleDay);
      return { title: "Petal Ping", body: tip ? tip.body : "Nothing to report today." };
    },
  },
];

// FUTURE -- these need meaningfully more logged data before they can exist:
//   mood-trend   : "your mood tends to dip around day N"   (needs ~3-6 cycles)
//   sleep-trend  : "sleep is down vs your baseline"         (needs a baseline)
//   cycle-change : "cycles have gotten longer recently"     (needs ~6 cycles)
// They are rules like any other; only the data is missing.

// --- Evaluation -------------------------------------------------------------

const DAY = 86400000;
const daysBetween = (a, b) => Math.round((b - a) / DAY);

export function buildContext(prediction, today = new Date()) {
  const t = new Date(today.toISOString().slice(0, 10));
  const lastStart = new Date(prediction.last_period_start);
  const windowStart = new Date(prediction.window_start);
  const windowEnd = new Date(prediction.window_end);

  const cycleDay = daysBetween(lastStart, t) + 1;
  const periodLength = prediction.last_period_length || 5;

  let phase = "follicular";
  if (cycleDay <= periodLength) phase = "menstrual";
  else if (daysBetween(t, windowStart) <= 7) phase = "luteal";

  return {
    today: t,
    cycleDay,
    phase,
    onPeriod: cycleDay <= periodLength,
    windowStart,
    windowEnd,
    daysUntilWindow: daysBetween(t, windowStart),
    confidence: prediction.confidence,
    fmt: (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

export function selectNotification(prediction, sentLog, today = new Date()) {
  const ctx = buildContext(prediction, today);

  for (const rule of RULES) {
    if (!rule.match(ctx)) continue;

    const lastSent = sentLog[rule.id];
    if (lastSent) {
      const since = daysBetween(new Date(lastSent), ctx.today);
      if (since < rule.cooldownDays) continue; // too soon; try the next rule
    }

    return { rule, ...rule.build(ctx), ctx };
  }
  return null;
}
