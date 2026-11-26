// Changes calendar months in place: no page reload, no jump to the top.
// Progressive enhancement only. Without this script the arrows are plain links (/?month=…)
// and work the same, just with a page load.
//
// - Arrow tap or swipe: fetch /fragments/calendar?month=YYYY-MM (server-rendered, escaped
//   HTML from this site), slide it in, update the address bar.
// - Neighbouring months are fetched ahead so a tap feels instant.
// - Back/Forward restore the month. Reduced motion: no slide.
(() => {
  "use strict";
  const current = () => document.querySelector("[data-calendar]");
  if (!current()) return;

  const cache = new Map();
  const load = (month) => {
    if (!cache.has(month)) {
      const p = fetch(`/fragments/calendar?month=${encodeURIComponent(month)}`, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
      p.catch(() => cache.delete(month));
      cache.set(month, p);
    }
    return cache.get(month);
  };
  const prefetch = (root) => {
    for (const a of root.querySelectorAll("a.cal-nav[data-month]")) load(a.dataset.month).catch(() => {});
  };
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let busy = false;
  async function go(month, dir, push) {
    if (busy) return;
    busy = true;
    try {
      let html;
      try {
        html = await load(month);
      } catch {
        window.location.href = `/?month=${month}`;
        return;
      }
      const next = new DOMParser().parseFromString(html, "text/html").querySelector("[data-calendar]");
      if (!next) {
        window.location.href = `/?month=${month}`;
        return;
      }
      const old = current();
      const swap = () => old.replaceWith(next);
      document.documentElement.dataset.slide = dir;
      if (reduceMotion()) {
        swap();
      } else if (document.startViewTransition) {
        await document.startViewTransition(swap).finished.catch(() => {});
      } else {
        swap();
        next.classList.add(`slide-in-${dir}`);
      }
      if (push) history.pushState({ month }, "", `/?month=${month}`);
      prefetch(next);
    } finally {
      busy = false;
    }
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.cal-nav[data-month]");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(a.dataset.month, a.dataset.dir, true);
  });

  window.addEventListener("popstate", () => {
    const month = new URLSearchParams(window.location.search).get("month");
    const shown = current() && current().dataset.calendar;
    if (!month || !shown || month === shown) return;
    go(month, month < shown ? "prev" : "next", false);
  });

  // Swipe left for the next month, right for the previous one.
  let start = null;
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !e.target.closest || !e.target.closest("[data-calendar]")) return;
    start = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener("pointerup", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const link = current() && current().querySelector(`a.cal-nav[data-dir="${dx < 0 ? "next" : "prev"}"]`);
    if (link) go(link.dataset.month, link.dataset.dir, true);
  });
  document.addEventListener("pointercancel", () => { start = null; });

  history.replaceState({ month: current().dataset.calendar }, "", window.location.href);
  prefetch(current());
})();
