/*!
 * REMATCH Lab
 * Copyright (c) 2026 Rimmy (KHBIN). All rights reserved.
 * This is proprietary software. Copying, modifying, re-hosting or redistributing this file, in whole or in part,
 * without written permission is prohibited. See LICENSE.
 * REMATCH and all game data are the property of Sloclap. Unofficial tool made by Rimmy (KHBIN), not affiliated with Sloclap.
 */
(function () {
  "use strict";

  /* ================================================================ Config */
  // Set these to your GitHub Pages address so copies hosted elsewhere show a warning banner.
  var OFFICIAL_HOSTS = ["rimmycode.github.io"]; // e.g. ["yourname.github.io"]
  var OFFICIAL_URL = "https://rimmycode.github.io/rematch-helper/";   // e.g. "https://yourname.github.io/rematch-helper/"

  // Layout / style switches - flip these to revert.
  var SHOW_SIDEBAR = false;  // true = bring back the left icon rail
  var TIER_STYLE = "stars";  // "stars" = top tier shown as 4 stars; "allstar" = original ALL-STAR pill
  var TOP = TIER_STYLE === "allstar" ? "All-Star" : "4★"; // name of the top tier in text

  var DATA = window.REMATCH_DATA;
  var S = window.RematchSynergy.create(DATA);
  var N = S.badges.length;
  var CONTRACTS = DATA.contracts;
  var PLAN_CONTRACTS = CONTRACTS.filter(function (c) { return c.slots > 0; });
  var CATS = {};
  DATA.categories.forEach(function (c) { CATS[c.id] = c; });
  var POLY = DATA.polyvalent;

  /* ================================================================ Utils */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function icon(id, cls) { return '<svg class="i' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }
  function fmt(n) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 }); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function sortDesc3(a, b, c) {
    var t;
    if (a < b) { t = a; a = b; b = t; }
    if (b < c) { t = b; b = c; c = t; }
    if (a < b) { t = a; a = b; b = t; }
    return [a, b, c];
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("rth:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("rth:" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  function starSvg() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-star"/></svg>'; }
  function starsHtml(n) {
    if (TIER_STYLE === "allstar") return starsHtmlAllStar(n);
    if (n <= 0) return '<span class="tier-label">Locked</span>';
    var out = '<span class="stars" title="' + n + (n === 1 ? " star" : " stars") + (n >= 4 ? " (All-Star)" : "") + '">';
    for (var i = 1; i <= 4; i++) out += i <= n ? starSvg() : '<span class="off">' + starSvg() + "</span>";
    return out + "</span>";
  }
  function tierText(n) {
    if (TIER_STYLE === "allstar") return tierTextAllStar(n);
    return n <= 0 ? "Locked" : n + "★";
  }
  // Original ALL-STAR style, kept as a backup (TIER_STYLE = "allstar").
  function starsHtmlAllStar(n) {
    if (n >= 4) return '<span class="allstar" title="All-Star">ALL-STAR</span>';
    if (n <= 0) return '<span class="tier-label">Locked</span>';
    var out = '<span class="stars" title="' + n + (n === 1 ? " star" : " stars") + '">';
    for (var i = 1; i <= 3; i++) out += i <= n ? starSvg() : '<span class="off">' + starSvg() + "</span>";
    return out + "</span>";
  }
  function tierTextAllStar(n) { return n >= 4 ? "All-Star" : n <= 0 ? "Locked" : n + "★"; }
  function catChip(id) { var c = CATS[id] || { name: id, color: "#888" }; return '<span class="cat" style="--c:' + c.color + '">' + esc(c.name) + "</span>"; }
  function lineChips(line) {
    if (line.kind === "polyvalent") return '<span class="cat poly">' + esc(POLY.name) + "</span>";
    return line.cats.map(catChip).join(" ");
  }
  function lineLabel(line) { return line.kind === "polyvalent" ? POLY.name : line.cats.map(function (c) { return CATS[c] ? CATS[c].name : c; }).join(" + "); }
  function dots(cats) { return '<span class="dots">' + cats.map(function (c) { return '<i style="background:' + (CATS[c] ? CATS[c].color : "#888") + '" title="' + esc(CATS[c] ? CATS[c].name : c) + '"></i>'; }).join("") + "</span>"; }
  function reqText(reqs) { return reqs && reqs.length ? reqs.map(tierText).join(" · ") : "No badges"; }
  function contractById(id) { return CONTRACTS.find(function (c) { return String(c.id) === String(id); }); }

  /* ================================================================ State */
  var state = {
    stars: new Uint8Array(N),
    version: 0,
    owned: new Set(store.get("owned", [])),
    plan: store.get("plan", {}),
    page: "badges",
    badges: { q: "", cat: "all", show: "all" },
    titles: { contract: "any", status: "all", kind: "all", q: "", sort: "line", dir: 1 },
    combos: { title: null, mine: false, ready: false, contract: "any", include: [], exclude: [], sort: "effort", limit: 60 },
    planner: { mineOnly: true }
  };
  (function loadStars() {
    var saved = store.get("stars", {});
    S.badges.forEach(function (b) { var v = saved[b.id] | 0; state.stars[b.index] = Math.max(0, Math.min(4, v)); });
  })();
  function saveStars() {
    var o = {};
    S.badges.forEach(function (b) { if (state.stars[b.index]) o[b.id] = state.stars[b.index]; });
    store.set("stars", o);
  }
  function setStar(badgeIndex, v) {
    state.stars[badgeIndex] = v;
    state.version++;
    saveStars();
  }
  function savePlan() { store.set("plan", state.plan); }
  function saveOwned() { store.set("owned", Array.from(state.owned)); }

  /* ================================================================ Analysis (cached per badge state + contract) */
  var cache = {};
  function reqsFor(contractKey) { var c = contractKey === "any" ? null : contractById(contractKey); return c ? c.reqs : null; }
  function needsVec(tier, reqs) { return S.needsFor(tier, reqs); }

  /** For every line: best tier reachable with the current badges (and contract reqs) and an example set. */
  function bestByLine(contractKey) {
    var key = "best|" + state.version + "|" + contractKey;
    if (cache[key]) return cache[key];
    var all = S.allCombos(), st = state.stars, reqs = reqsFor(contractKey);
    var r = reqs && reqs.length ? sortDesc3(reqs[0] || 1, reqs[1] || 1, reqs[2] || 1) : null;
    var out = S.lines.map(function (line) {
      var arr = all.byLine[line.index], pur = all.purity[line.index], best = 0, bestV = -1, bestScore = -1;
      for (var n = 0; n < arr.length; n++) {
        var v = arr[n], a = st[v & 127], b = st[(v >> 7) & 127], c = st[(v >> 14) & 127];
        if (!a || !b || !c) continue;
        if (r) { var s = sortDesc3(a, b, c); if (s[0] < r[0] || s[1] < r[1] || s[2] < r[2]) continue; }
        var t = a < b ? (a < c ? a : c) : (b < c ? b : c); // tier = lowest badge level
        var score = 4 + pur[n];
        if (t > best || (t === best && score > bestScore)) { best = t; bestV = v; bestScore = score; if (best === 4 && score === 7) break; }
      }
      return { tier: best, combo: bestV };
    });
    cache[key] = out;
    return out;
  }

  /** For every line and tier 1..4: fewest star-levels needed and an example set. */
  function effortByLine(contractKey) {
    var key = "effort|" + state.version + "|" + contractKey;
    if (cache[key]) return cache[key];
    var all = S.allCombos(), st = state.stars, reqs = reqsFor(contractKey);
    var needs = [null, needsVec(1, reqs), needsVec(2, reqs), needsVec(3, reqs), needsVec(4, reqs)];
    var out = S.lines.map(function (line) {
      var arr = all.byLine[line.index], pur = all.purity[line.index];
      var res = [null, { cost: 99, combo: -1, score: -1 }, { cost: 99, combo: -1, score: -1 }, { cost: 99, combo: -1, score: -1 }, { cost: 99, combo: -1, score: -1 }];
      for (var n = 0; n < arr.length; n++) {
        var v = arr[n], s = sortDesc3(st[v & 127], st[(v >> 7) & 127], st[(v >> 14) & 127]);
        var score = 4 + pur[n];
        for (var k = 1; k <= 4; k++) {
          var nd = needs[k];
          var cost = Math.max(0, nd[0] - s[0]) + Math.max(0, nd[1] - s[1]) + Math.max(0, nd[2] - s[2]);
          if (cost < res[k].cost || (cost === res[k].cost && score > res[k].score)) res[k] = { cost: cost, combo: v, score: score };
        }
      }
      return res;
    });
    cache[key] = out;
    return out;
  }
  function invalidate() { cache = {}; }

  function comboIdx(v) { return [v & 127, (v >> 7) & 127, (v >> 14) & 127]; }
  function comboNames(v) { return comboIdx(v).map(function (i) { return S.badges[i].name; }).join(" · "); }

  function titleStatus(title, contractKey) {
    var best = bestByLine(contractKey)[title.line.index];
    if (state.owned.has(title.key)) return { kind: "owned", rank: -1, combo: best.combo };
    if (best.tier >= title.star) return { kind: "ready", rank: 0, combo: best.combo };
    var e = effortByLine(contractKey)[title.line.index][title.star];
    return { kind: "need", rank: e.cost, combo: e.combo };
  }

  /* ================================================================ Toasts, menus, pickers */
  function toast(msg) {
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = icon("check") + "<span>" + esc(msg) + "</span>";
    $("#toasts").appendChild(el);
    setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 220); }, 3000);
  }

  var popover = null;
  function closePopover() {
    if (popover) { popover.el.remove(); if (popover.onClose) popover.onClose(); if (popover.anchor && popover.anchor.focus) popover.anchor.focus({ preventScroll: true }); popover = null; }
  }
  function placePopover(el, anchor) {
    var r = anchor.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(8, r.right - w), vw - w - 8);
    if (r.left + w < vw - 8 && r.left > 8) left = Math.min(r.left, vw - w - 8);
    var top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = left + "px";
    el.style.top = top + "px";
  }
  document.addEventListener("mousedown", function (e) {
    if (popover && !popover.el.contains(e.target) && !(popover.anchor && popover.anchor.contains(e.target))) closePopover();
  });
  window.addEventListener("resize", function () { closePopover(); });
  window.addEventListener("scroll", function (e) { if (popover && !popover.el.contains(e.target)) closePopover(); }, true);

  /** items: [{label, icon, onClick, header, danger}] */
  function openMenu(anchor, items) {
    closePopover();
    var el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "menu");
    el.innerHTML = items.map(function (it, i) {
      if (it.header) return '<div class="result-group">' + esc(it.header) + "</div>";
      return '<button role="menuitem" data-i="' + i + '"' + (it.danger ? ' class="danger"' : "") + ">" + (it.icon ? icon(it.icon, "sm") : "") + "<span>" + esc(it.label) + "</span></button>";
    }).join("");
    $("#popover-root").appendChild(el);
    placePopover(el, anchor);
    popover = { el: el, anchor: anchor };
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-i]");
      if (!b) return;
      var it = items[+b.dataset.i];
      closePopover();
      it.onClick();
    });
    el.addEventListener("keydown", function (e) {
      var btns = $$("button", el), i = btns.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); closePopover(); }
    });
    var first = $("button", el);
    if (first) first.focus();
  }

  /** Searchable list popover. opts: {items:[{value, label, sub, search, disabled}], placeholder, onPick} */
  function openPicker(anchor, opts) {
    closePopover();
    var el = document.createElement("div");
    el.className = "picker";
    el.innerHTML = '<input class="input" type="search" placeholder="' + esc(opts.placeholder || "Search") + '" aria-label="Search"><div class="picker-list" role="listbox"></div>';
    $("#popover-root").appendChild(el);
    var input = $("input", el), list = $(".picker-list", el), shown = [], active = 0;
    function render() {
      var q = input.value.trim().toLowerCase();
      shown = opts.items.filter(function (it) { return !q || it.search.indexOf(q) >= 0; }).slice(0, 150);
      active = Math.min(active, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length ? shown.map(function (it, i) {
        return '<button class="picker-item' + (i === active ? " active" : "") + '" role="option" data-i="' + i + '"' + (it.disabled ? ' aria-disabled="true"' : "") + ">" +
          '<span><span class="nm">' + esc(it.label) + '</span><span class="sub">' + (it.sub || "") + "</span></span>" + (it.right || "") + "</button>";
      }).join("") : '<div class="empty" style="padding:28px 12px"><p>No matches</p></div>';
    }
    function pick(i) { var it = shown[i]; if (!it || it.disabled) return; closePopover(); opts.onPick(it.value); }
    input.addEventListener("input", function () { active = 0; render(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); render(); scrollActive(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); render(); scrollActive(); }
      else if (e.key === "Enter") { e.preventDefault(); pick(active); }
      else if (e.key === "Escape") { e.preventDefault(); closePopover(); }
    });
    function scrollActive() { var a = $(".picker-item.active", list); if (a) a.scrollIntoView({ block: "nearest" }); }
    list.addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (b) pick(+b.dataset.i); });
    render();
    placePopover(el, anchor);
    popover = { el: el, anchor: anchor };
    input.focus();
  }

  function badgePickerItems(filterFn) {
    return S.badges.filter(function (b) { return !filterFn || filterFn(b); }).map(function (b) {
      var s = state.stars[b.index];
      return {
        value: b.id, label: b.name, search: (b.name + " " + b.cats.join(" ") + " " + b.desc).toLowerCase(),
        sub: b.cats.map(catChip).join(""),
        right: '<span class="mono dim" style="font-size:12px">' + (s ? tierText(s) : "Locked") + "</span>"
      };
    });
  }
  function titlePickerItems() {
    return S.titles.map(function (t) {
      return { value: t.key, label: t.name, search: (t.name + " " + lineLabel(t.line)).toLowerCase(), sub: lineChips(t.line), right: starsHtml(t.star) };
    });
  }

  /* ================================================================ Navigation */
  var NAV = [
    { id: "badges", label: "My badges", short: "Badges", icon: "shield" },
    { id: "titles", label: "Titles", short: "Titles", icon: "crown" },
    { id: "combos", label: "Combinations", short: "Combos", icon: "layers" },
    { id: "planner", label: "Contract planner", short: "Planner", icon: "route" },
    { id: "rules", label: "Rules", short: "Rules", icon: "book" },
    { id: "about", label: "About", short: "About", icon: "info" }
  ];
  function buildNav() {
    $("#tabs").innerHTML = NAV.map(function (n) {
      return '<button class="tab" data-nav="' + n.id + '" title="' + esc(n.label) + '" aria-label="' + esc(n.label) + '">' + icon(n.icon, "sm") + '<span class="tab-label">' + esc(n.label) + "</span></button>";
    }).join("");
    if (!SHOW_SIDEBAR) document.body.classList.add("no-rail");
    $("#rail").innerHTML = NAV.map(function (n, i) {
      return (i === NAV.length - 1 ? '<div class="rail-spacer"></div>' : "") +
        '<button class="rail-btn" data-nav="' + n.id + '" aria-label="' + esc(n.label) + '">' + icon(n.icon) + '<span class="tip">' + esc(n.label) + "</span></button>";
    }).join("");
    $("#bottombar").innerHTML = NAV.slice(0, 5).map(function (n) { return '<button data-nav="' + n.id + '">' + icon(n.icon) + "<span>" + esc(n.short) + "</span></button>"; }).join("");
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-nav]");
      if (b) { e.preventDefault(); go(b.dataset.nav); }
    });
  }
  function go(page, param) { location.hash = "#" + page + (param ? "/" + encodeURIComponent(param) : ""); }
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
    var page = NAV.some(function (n) { return n.id === h[0]; }) ? h[0] : "badges";
    if (page === "combos" && h[1] && S.titleByKey[h[1]]) {
      if (state.combos.title !== h[1]) { state.combos.title = h[1]; state.combos.limit = 60; }
    }
    state.page = page;
    $$("[data-nav]").forEach(function (b) { if (b.dataset.nav === page) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $$(".page").forEach(function (p) { p.hidden = p.dataset.page !== page; });
    closePopover();
    render();
    window.scrollTo({ top: 0 });
  }
  function render() {
    var fn = { badges: renderBadges, titles: renderTitles, combos: renderCombos, planner: renderPlanner, rules: renderRules, about: renderAbout }[state.page];
    fn($("#page-" + state.page));
  }

  function pageHead(title, desc, actions) {
    var d = new Date(DATA.meta.generatedAt);
    var when = isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    return '<div class="page-head"><div><h1>' + esc(title) + "</h1><p>" + desc + '</p></div><div class="head-actions">' +
      '<span class="status-pill" title="Live config ' + esc(DATA.meta.configVersion) + " · game files " + esc(DATA.meta.gameBuild) + '"><span class="dot"></span>Live data · ' + esc(when) + "</span>" +
      (actions || "") + "</div></div>";
  }
  function statCard(ic, label, value, trend, trendKind) {
    return '<div class="card stat"><div class="stat-icon">' + icon(ic) + '</div><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' + value + "</div>" +
      (trend ? '<div class="trend ' + (trendKind || "") + '">' + (trendKind === "flat" ? "" : icon("arrow-up", "sm")) + "<span>" + trend + "</span></div>" : "") + "</div>";
  }
  function segmented(name, options, value) {
    return '<div class="segmented" role="group" data-seg="' + name + '">' + options.map(function (o) {
      return '<button type="button" data-val="' + esc(o[0]) + '" aria-pressed="' + (String(o[0]) === String(value)) + '">' + esc(o[1]) + "</button>";
    }).join("") + "</div>";
  }
  function contractSelect(id, value, anyLabel) {
    return '<select class="select" id="' + id + '"><option value="any">' + esc(anyLabel || "Any contract") + "</option>" +
      PLAN_CONTRACTS.map(function (c) { return '<option value="' + c.id + '"' + (String(value) === String(c.id) ? " selected" : "") + ">" + esc(c.name) + " — needs " + esc(reqText(c.reqs)) + "</option>"; }).join("") + "</select>";
  }
  function emptyState(ic, title, text, btn) {
    return '<div class="card empty"><div class="stat-icon">' + icon(ic) + "</div><h3>" + esc(title) + "</h3><p>" + text + "</p>" + (btn || "") + "</div>";
  }

  /* ================================================================ Page: My badges */
  function badgeSummary() {
    var unlocked = 0, allstar = 0;
    for (var i = 0; i < N; i++) { if (state.stars[i]) unlocked++; if (state.stars[i] === 4) allstar++; }
    var best = bestByLine("any"), titles = 0, lines = 0;
    best.forEach(function (b) { titles += b.tier; if (b.tier) lines++; });
    return { unlocked: unlocked, allstar: allstar, titles: titles, lines: lines };
  }
  function badgeStatsHtml() {
    var s = badgeSummary(), total = S.titles.length;
    return statCard("shield", "Badges unlocked", s.unlocked + "<small> / " + N + "</small>", Math.round(s.unlocked / N * 100) + "% of the collection", s.unlocked ? "" : "flat") +
      statCard("star", TOP + " badges", String(s.allstar), s.allstar ? "max tier titles open" : "none yet", s.allstar ? "" : "flat") +
      statCard("crown", "Titles you can earn", s.titles + "<small> / " + total + "</small>", s.titles ? "with any contract" : "set some badge levels", s.titles ? "" : "flat") +
      statCard("layers", "Synergy lines open", s.lines + "<small> / " + S.lines.length + "</small>", s.lines ? "of " + S.lines.length + " title lines" : "none yet", s.lines ? "" : "flat");
  }
  function categoryProgressHtml() {
    return DATA.categories.map(function (c) {
      var have = 0, max = 0;
      S.badges.forEach(function (b) { if (b.cats.indexOf(c.id) >= 0) { max += 4; have += state.stars[b.index]; } });
      var pct = max ? Math.round(have / max * 100) : 0;
      return '<div class="progress-row"><span>' + catChip(c.id) + '</span><div class="bar" style="--c:' + c.color + '"><span style="width:' + pct + '%"></span></div><span class="mono dim" style="text-align:right">' + pct + "%</span></div>";
    }).join("");
  }
  function badgeCardHtml(b) {
    var s = state.stars[b.index];
    var c1 = CATS[b.cats[0]].color, c2 = CATS[b.cats[b.cats.length - 1]].color;
    var unit = b.unit ? " " + esc(b.unit) : "";
    var labels = ["—", "1", "2", "3", TIER_STYLE === "allstar" ? "All" : "4"];
    var picker = labels.map(function (l, i) {
      var title = i === 0 ? "Locked" : i === 4 ? "4 stars (All-Star)" : i + (i === 1 ? " star" : " stars");
      return '<button type="button" role="radio" class="s' + i + '" data-star="' + i + '" aria-checked="' + (s === i) + '" tabindex="' + (s === i ? 0 : -1) + '" aria-label="' + title + '" title="' + title + '">' + (i ? starSvg() : "") + "<span>" + l + "</span></button>";
    }).join("");
    return '<article class="card badge-card' + (s ? "" : " locked") + '" data-badge="' + esc(b.id) + '" style="--c1:' + c1 + ";--c2:" + c2 + '">' +
      '<div class="badge-top"><div><div class="badge-name">' + esc(b.name) + '</div><div class="chips" style="margin-top:6px">' + b.cats.map(catChip).join("") + "</div></div></div>" +
      '<p class="badge-desc">' + esc(b.desc) + "</p>" +
      '<div class="badge-targets" title="Progress needed for each level">' + b.targets.map(function (t, i) { return (i === 3 ? "AS " : "★" + (i + 1) + " ") + "<b>" + fmt(t) + "</b>"; }).join(" · ") + unit + "</div>" +
      '<div class="star-picker" role="radiogroup" aria-label="' + esc(b.name) + ' level">' + picker + "</div></article>";
  }
  function filteredBadges() {
    var f = state.badges, q = f.q.trim().toLowerCase();
    return S.badges.filter(function (b) {
      if (f.cat !== "all" && b.group !== f.cat) return false; // only the category the game lists it under
      if (f.show === "unlocked" && !state.stars[b.index]) return false;
      if (f.show === "locked" && state.stars[b.index]) return false;
      if (q && (b.name + " " + b.desc + " " + b.cats.join(" ")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function badgeGridHtml() {
    var list = filteredBadges();
    if (!list.length) return emptyState("search", "No badges match", "Try another search or clear the filters.", '<button class="btn" data-act="clear-badge-filters">Clear filters</button>');
    var groups = {};
    list.forEach(function (b) { var g = b.group; (groups[g] = groups[g] || []).push(b); });
    return DATA.categories.filter(function (c) { return groups[c.id]; }).map(function (c) {
      var arr = groups[c.id].sort(function (a, b) { return a.order - b.order; }), unlocked = arr.filter(function (b) { return state.stars[b.index]; }).length;
      return '<div class="cat-group"><div class="cat-group-head"><h3>' + catChip(c.id) + '</h3><span class="count">' + unlocked + "/" + arr.length + ' unlocked</span></div><div class="badge-grid">' + arr.map(badgeCardHtml).join("") + "</div></div>";
    }).join("");
  }
  function renderBadges(root) {
    var f = state.badges;
    root.innerHTML = pageHead("My badges", "Set the level you've reached on each badge. Titles, combinations and the planner all update from this. Saved in your browser only.",
      '<button class="btn" data-act="share">' + icon("share", "sm") + "Import / export</button>" +
      '<button class="btn primary" data-nav="titles">' + icon("crown", "sm") + "See my titles</button>") +
      '<div class="stats" id="badge-stats">' + badgeStatsHtml() + "</div>" +
      '<div class="section"><div class="section-head"><h2>Collection by category</h2><span class="dim" style="font-size:12.5px">Stars earned out of the maximum, per category (hybrid badges count for both)</span></div>' +
      '<div class="card progress-list" id="cat-progress" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));column-gap:28px">' + categoryProgressHtml() + "</div></div>" +
      '<div class="section"><div class="section-head"><h2>Badges</h2><button class="link" data-act="bulk">Set all shown…</button></div>' +
      '<div class="toolbar"><div class="field grow"><label for="badge-q">Search</label><input class="input" id="badge-q" type="search" placeholder="Badge name, action or category" value="' + esc(f.q) + '"></div>' +
      '<div class="field"><span class="field-label">Show</span>' + segmented("badge-show", [["all", "All"], ["unlocked", "Unlocked"], ["locked", "Locked"]], f.show) + "</div></div>" +
      '<div class="chips" id="badge-cats" style="margin-bottom:6px"><button class="chip" data-cat="all" aria-pressed="' + (f.cat === "all") + '">All categories</button>' +
      DATA.categories.map(function (c) { return '<button class="chip" data-cat="' + c.id + '" aria-pressed="' + (f.cat === c.id) + '"><span class="cat" style="--c:' + c.color + ';background:none;padding:0;height:auto">' + esc(c.name) + "</span></button>"; }).join("") + "</div>" +
      '<div id="badge-grid">' + badgeGridHtml() + "</div></div>";
    bindBadges(root);
  }
  function refreshBadgeAggregates() {
    $("#badge-stats").innerHTML = badgeStatsHtml();
    $("#cat-progress").innerHTML = categoryProgressHtml();
  }
  function bindBadges(root) {
    $("#badge-q", root).addEventListener("input", debounce(function (e) { state.badges.q = e.target.value; $("#badge-grid").innerHTML = badgeGridHtml(); }, 120));
    root.onclick = function (e) {
      var star = e.target.closest(".star-picker button");
      if (star) {
        var card = star.closest(".badge-card"), b = S.badgeById[card.dataset.badge], v = +star.dataset.star;
        setStar(b.index, v);
        invalidate();
        var fresh = document.createElement("div");
        fresh.innerHTML = badgeCardHtml(b);
        var nc = fresh.firstChild;
        card.replaceWith(nc);
        $('[data-star="' + v + '"]', nc).focus();
        refreshBadgeAggregates();
        return;
      }
      var cat = e.target.closest("[data-cat]");
      if (cat) { state.badges.cat = cat.dataset.cat; $$("#badge-cats .chip").forEach(function (c) { c.setAttribute("aria-pressed", c === cat); }); $("#badge-grid").innerHTML = badgeGridHtml(); return; }
      var seg = e.target.closest('[data-seg="badge-show"] button');
      if (seg) { state.badges.show = seg.dataset.val; $$('[data-seg="badge-show"] button').forEach(function (x) { x.setAttribute("aria-pressed", x === seg); }); $("#badge-grid").innerHTML = badgeGridHtml(); return; }
      var act = e.target.closest("[data-act]");
      if (!act) return;
      if (act.dataset.act === "share") openShare();
      else if (act.dataset.act === "clear-badge-filters") { state.badges = { q: "", cat: "all", show: "all" }; render(); }
      else if (act.dataset.act === "bulk") {
        var shown = filteredBadges();
        openMenu(act, [{ header: "Set " + plural(shown.length, "shown badge") + " to" }].concat([0, 1, 2, 3, 4].map(function (v) {
          return { label: v === 0 ? "Locked" : v === 4 ? TOP : v + (v === 1 ? " star" : " stars"), onClick: function () {
            shown.forEach(function (b) { state.stars[b.index] = v; });
            state.version++; saveStars(); invalidate(); render(); toast("Updated " + plural(shown.length, "badge"));
          } };
        })));
      }
    };
    root.onkeydown = function (e) {
      var star = e.target.closest(".star-picker button");
      if (!star || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      e.preventDefault();
      var v = Math.max(0, Math.min(4, +star.dataset.star + (e.key === "ArrowRight" ? 1 : -1)));
      var target = $('[data-star="' + v + '"]', star.parentNode);
      target.click();
    };
  }

  /* ---------- share dialog ---------- */
  function exportCode() {
    var parts = [];
    S.badges.forEach(function (b) { if (state.stars[b.index]) parts.push(b.id + ":" + state.stars[b.index]); });
    return "RTH1|" + parts.join(",");
  }
  function importCode(code) {
    var m = String(code).trim().match(/^RTH1\|(.*)$/s);
    if (!m) throw new Error("That doesn't look like a badge code.");
    var next = new Uint8Array(N), known = 0;
    m[1].split(",").filter(Boolean).forEach(function (p) {
      var kv = p.split(":"), b = S.badgeById[kv[0]], v = parseInt(kv[1], 10);
      if (b && v >= 0 && v <= 4) { next[b.index] = v; known++; }
    });
    state.stars = next; state.version++; saveStars(); invalidate();
    return known;
  }
  function openShare() {
    var d = $("#share-dialog");
    $("#share-code").value = exportCode();
    d.showModal();
    $("#share-code").select();
  }
  function bindShare() {
    $("#share-copy").addEventListener("click", function () {
      var t = $("#share-code");
      t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function () { toast("Code copied"); }, function () { document.execCommand("copy"); toast("Code copied"); });
    });
    $("#share-import").addEventListener("click", function () {
      try { var n = importCode($("#share-code").value); $("#share-dialog").close(); render(); toast("Imported " + plural(n, "badge level")); }
      catch (err) { toast(err.message); }
    });
    $("#share-reset").addEventListener("click", function () {
      if (!confirm("Reset every badge to Locked? This can't be undone (export a code first if you want a backup).")) return;
      state.stars = new Uint8Array(N); state.version++; saveStars(); invalidate();
      $("#share-dialog").close(); render(); toast("All badges reset");
    });
  }

  /* ================================================================ Page: Titles */
  function titleRows() {
    var f = state.titles, q = f.q.trim().toLowerCase();
    var rows = S.titles.map(function (t) { return { t: t, st: titleStatus(t, f.contract) }; });
    rows = rows.filter(function (r) {
      if (f.kind !== "all" && r.t.line.kind !== f.kind) return false;
      if (f.status === "ready" && r.st.kind !== "ready") return false;
      if (f.status === "need" && r.st.kind !== "need") return false;
      if (f.status === "owned" && r.st.kind !== "owned") return false;
      if (q && (r.t.name + " " + lineLabel(r.t.line)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var dir = f.dir;
    var cmp = {
      title: function (a, b) { return a.t.name.localeCompare(b.t.name); },
      line: function (a, b) { return a.t.line.index - b.t.line.index || a.t.star - b.t.star; },
      tier: function (a, b) { return a.t.star - b.t.star || a.t.line.index - b.t.line.index; },
      status: function (a, b) { return a.st.rank - b.st.rank || a.t.line.index - b.t.line.index || a.t.star - b.t.star; }
    }[f.sort];
    rows.sort(function (a, b) { return cmp(a, b) * dir; });
    return rows;
  }
  function statusHtml(st) {
    if (st.kind === "owned") return '<span class="badge-status muted">' + icon("check", "sm") + "Owned</span>";
    if (st.kind === "ready") return '<span class="badge-status ok">' + icon("check", "sm") + "Can earn now</span>";
    if (st.rank >= 99) return '<span class="badge-status bad">Not possible</span>';
    return '<span class="badge-status warn">+' + plural(st.rank, "star") + " needed</span>";
  }
  function titlesTableHtml() {
    var rows = titleRows();
    if (!rows.length) return emptyState("crown", "No titles match", "Change the filters above to see more titles.", '<button class="btn" data-act="clear-title-filters">Clear filters</button>');
    function th(col, label, cls) {
      var sorted = state.titles.sort === col;
      return '<th' + (cls ? ' class="' + cls + '"' : "") + (sorted ? ' aria-sort="' + (state.titles.dir > 0 ? "ascending" : "descending") + '"' : "") + '><button data-sort="' + col + '">' + label + '<svg class="i sm arrow"><use href="#i-chevron"/></svg></button></th>';
    }
    return '<div class="card table-wrap"><table class="data"><thead><tr>' + th("title", "Title") + th("line", "Synergy") + th("tier", "Tier") + th("status", "For you") +
      '<th class="hide-sm">Example set</th><th style="width:48px"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var own = state.owned.has(r.t.key);
        return '<tr data-title="' + esc(r.t.key) + '"><td><span class="title-cell"><button class="own-check" role="checkbox" data-act="toggle-owned" aria-checked="' + own + '" aria-label="I own ' + esc(r.t.name) + '" title="' + (own ? "Owned - click to unmark" : "Mark as owned") + '">' + icon("check", "sm") + '</button><span class="title-name">' + esc(r.t.name) + "</span></span></td><td>" + lineChips(r.t.line) + "</td><td>" + starsHtml(r.t.star) + "</td><td>" + statusHtml(r.st) +
          '</td><td class="hide-sm best-set">' + (r.st.combo >= 0 ? esc(comboNames(r.st.combo)) : "—") + '</td><td><button class="icon-btn" data-act="row-menu" aria-label="Actions for ' + esc(r.t.name) + '">' + icon("dots") + "</button></td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function titleStatsHtml() {
    var c = state.titles.contract, ready = 0, lines = 0, owned = state.owned.size, closest = null;
    var best = bestByLine(c), eff = effortByLine(c);
    best.forEach(function (b) { ready += b.tier; if (b.tier) lines++; });
    S.titles.forEach(function (t) {
      if (state.owned.has(t.key) || best[t.line.index].tier >= t.star) return;
      var e = eff[t.line.index][t.star];
      if (e.cost < 99 && (!closest || e.cost < closest.cost)) closest = { t: t, cost: e.cost };
    });
    return statCard("crown", "Titles you can earn now", ready + "<small> / " + S.titles.length + "</small>", c === "any" ? "with any contract" : "for " + esc(contractById(c).name), ready ? "" : "flat") +
      statCard("layers", "Synergy lines open", lines + "<small> / " + S.lines.length + "</small>", "a line opens at its 1★ title", lines ? "" : "flat") +
      statCard("target", "Closest next title", closest ? '<span style="font-family:var(--font);font-size:20px">' + esc(closest.t.name) + "</span>" : "—", closest ? "+" + plural(closest.cost, "star") + " away" : "all done", "flat") +
      statCard("check", "Titles marked owned", String(owned), owned ? "hidden from suggestions" : "mark owned titles from the ⋯ menu", "flat");
  }
  function renderTitles(root) {
    var f = state.titles;
    root.innerHTML = pageHead("Titles", "All " + S.titles.length + " badge-synergy titles and whether the badges you have can earn each one right now. Pick a contract to apply its badge requirements.",
      '<button class="btn" data-nav="badges">' + icon("shield", "sm") + "Edit badges</button>") +
      '<div class="stats" id="title-stats">' + titleStatsHtml() + "</div>" +
      '<div class="section"><div class="toolbar">' +
      '<div class="field"><label for="title-contract">Contract requirements</label>' + contractSelect("title-contract", f.contract) + "</div>" +
      '<div class="field"><span class="field-label">Status</span>' + segmented("title-status", [["all", "All"], ["ready", "Can earn"], ["need", "Not yet"], ["owned", "Owned"]], f.status) + "</div>" +
      '<div class="field"><span class="field-label">Type</span>' + segmented("title-kind", [["all", "All"], ["single", "Single"], ["pair", "Pair"], ["polyvalent", "3+"]], f.kind) + "</div>" +
      '<div class="field grow"><label for="title-q">Search</label><input class="input" id="title-q" type="search" placeholder="Title or category" value="' + esc(f.q) + '"></div>' +
      '</div><div id="titles-table">' + titlesTableHtml() + "</div></div>";
    bindTitles(root);
  }
  function refreshTitles() { $("#titles-table").innerHTML = titlesTableHtml(); $("#title-stats").innerHTML = titleStatsHtml(); }
  function titleMenu(anchor, key) {
    var owned = state.owned.has(key);
    var items = [
      { label: "See every combination", icon: "layers", onClick: function () { go("combos", key); } },
      { label: owned ? "Mark as not owned" : "Mark as owned", icon: "check", onClick: function () { toggleOwned(key); } },
      { header: "Plan it for a contract" }
    ];
    PLAN_CONTRACTS.forEach(function (c) {
      items.push({ label: c.name + " (" + reqText(c.reqs) + ")", icon: "route", onClick: function () { planTarget(c.id, key, true); go("planner"); } });
    });
    openMenu(anchor, items);
  }
  /** Flip a title's owned flag; on the Titles page the row and stats update in place (no scroll jump). */
  function toggleOwned(key) {
    var t = S.titleByKey[key], owned = !state.owned.has(key);
    if (owned) state.owned.add(key); else state.owned.delete(key);
    saveOwned(); invalidate();
    if (state.page !== "titles") { render(); }
    else {
      var row = $('#titles-table tr[data-title="' + CSS.escape(key) + '"]');
      if (row) {
        var box = $(".own-check", row);
        box.setAttribute("aria-checked", owned);
        box.title = owned ? "Owned - click to unmark" : "Mark as owned";
        row.cells[3].innerHTML = statusHtml(titleStatus(t, state.titles.contract));
      }
      $("#title-stats").innerHTML = titleStatsHtml();
    }
    toast(owned ? t.name + " marked as owned" : t.name + " unmarked");
  }
  function bindTitles(root) {
    $("#title-contract", root).addEventListener("change", function (e) { state.titles.contract = e.target.value; refreshTitles(); });
    $("#title-q", root).addEventListener("input", debounce(function (e) { state.titles.q = e.target.value; $("#titles-table").innerHTML = titlesTableHtml(); }, 120));
    root.onclick = function (e) {
      var seg = e.target.closest("[data-seg] button");
      if (seg) {
        var g = seg.parentNode.dataset.seg;
        $$("button", seg.parentNode).forEach(function (x) { x.setAttribute("aria-pressed", x === seg); });
        if (g === "title-status") state.titles.status = seg.dataset.val;
        if (g === "title-kind") state.titles.kind = seg.dataset.val;
        $("#titles-table").innerHTML = titlesTableHtml();
        return;
      }
      var sort = e.target.closest("[data-sort]");
      if (sort) {
        var col = sort.dataset.sort;
        if (state.titles.sort === col) state.titles.dir *= -1; else { state.titles.sort = col; state.titles.dir = 1; }
        $("#titles-table").innerHTML = titlesTableHtml();
        var again = $('[data-sort="' + col + '"]'); if (again) again.focus();
        return;
      }
      var act = e.target.closest("[data-act]");
      if (act && act.dataset.act === "toggle-owned") { toggleOwned(act.closest("tr").dataset.title); return; }
      if (act && act.dataset.act === "row-menu") { titleMenu(act, act.closest("tr").dataset.title); return; }
      if (act && act.dataset.act === "clear-title-filters") { state.titles = { contract: "any", status: "all", kind: "all", q: "", sort: "line", dir: 1 }; render(); return; }
      var row = e.target.closest("tr[data-title]");
      if (row && !e.target.closest("button")) go("combos", row.dataset.title);
    };
  }

  /* ================================================================ Page: Combinations */
  function ruleText(line) {
    if (line.kind === "single") return "<b>" + esc(CATS[line.cats[0]].name) + "</b> must be the only category with the highest count across the three badges' category tags (a hybrid badge counts for both of its categories).";
    if (line.kind === "pair") return "<b>" + esc(CATS[line.cats[0]].name) + "</b> and <b>" + esc(CATS[line.cats[1]].name) + "</b> must be the only two categories tied for the highest count (for example 2 and 2 with anything else at 1, or 3 and 3).";
    return "Three or more categories tied for the highest count (for example 1-1-1, or three hybrids at 2-2-2).";
  }
  function comboRows(title) {
    var f = state.combos, all = S.allCombos(), arr = all.byLine[title.line.index], pur = all.purity[title.line.index], st = state.stars;
    var reqs = reqsFor(f.contract), nd = needsVec(title.star, reqs);
    var inc = f.include.map(function (id) { return S.badgeById[id] ? S.badgeById[id].index : -1; }).filter(function (i) { return i >= 0; });
    var exc = {};
    f.exclude.forEach(function (id) { if (S.badgeById[id]) exc[S.badgeById[id].index] = true; });
    var out = [];
    for (var n = 0; n < arr.length; n++) {
      var v = arr[n], i = v & 127, j = (v >> 7) & 127, k = (v >> 14) & 127;
      if (exc[i] || exc[j] || exc[k]) continue;
      var ok = true;
      for (var q = 0; q < inc.length; q++) if (inc[q] !== i && inc[q] !== j && inc[q] !== k) { ok = false; break; }
      if (!ok) continue;
      if (f.mine && (!st[i] || !st[j] || !st[k])) continue;
      var s = sortDesc3(st[i], st[j], st[k]);
      var cost = Math.max(0, nd[0] - s[0]) + Math.max(0, nd[1] - s[1]) + Math.max(0, nd[2] - s[2]);
      if (f.ready && cost > 0) continue;
      out.push({ v: v, cost: cost, pur: pur[n] });
    }
    if (f.sort === "effort") out.sort(function (a, b) { return a.cost - b.cost || b.pur - a.pur || nameKey(a.v).localeCompare(nameKey(b.v)); });
    else out.sort(function (a, b) { return nameKey(a.v).localeCompare(nameKey(b.v)); });
    return out;
  }
  var nameKeyCache = {};
  function nameKey(v) {
    var k = nameKeyCache[v];
    if (k === undefined) {
      var names = comboIdx(v).map(function (i) { return S.badges[i].name; });
      k = nameKeyCache[v] = names.sort().join("|");
    }
    return k;
  }
  /** Which badge should carry which level: pair sorted needs with sorted current stars. */
  function assignNeeds(idx, needs) {
    var order = idx.map(function (i, p) { return { i: i, p: p, s: state.stars[i] }; }).sort(function (a, b) { return b.s - a.s || a.p - b.p; });
    var res = {};
    order.forEach(function (o, r) { res[o.i] = needs[r]; });
    return res;
  }
  function bchipHtml(i, need, removable) {
    var b = S.badges[i], s = state.stars[i];
    var lvl = s >= need ? '<span class="lvl ok" title="You have ' + tierText(s) + '">' + tierText(s) + "</span>"
      : '<span class="lvl need" title="Needs ' + tierText(need) + ", you have " + tierText(s) + '">' + (s ? tierText(s) : "Locked") + " → " + tierText(need) + "</span>";
    return '<span class="bchip" title="' + esc(b.desc) + '">' + dots(b.cats) + '<span class="nm">' + esc(b.name) + "</span>" + lvl +
      (removable ? '<button class="x" data-exclude="' + esc(b.id) + '" aria-label="Exclude ' + esc(b.name) + '" title="Exclude this badge">' + icon("x", "sm") + "</button>" : "") + "</span>";
  }
  function comboHtml(row, title) {
    var v = row.v, idx = comboIdx(v);
    var nd = needsVec(title.star, reqsFor(state.combos.contract)), need = assignNeeds(idx, nd);
    var counts = S.countCategories(idx.map(function (i) { return S.badges[i]; }));
    return '<div class="card combo"><div><div class="combo-badges">' + idx.map(function (i) { return bchipHtml(i, need[i], true); }).join("") + "</div>" +
      '<div class="count-line" style="margin-top:8px">' + counts.map(function (c) { return '<span class="cat" style="--c:' + CATS[c.cat].color + '">' + esc(CATS[c.cat].name) + " × " + c.count + "</span>"; }).join("") + "</div></div>" +
      '<div class="combo-meta">' + (row.cost === 0 ? '<span class="badge-status ok">' + icon("check", "sm") + "Ready</span>" : '<span class="badge-status warn">+' + plural(row.cost, "star") + "</span>") +
      '<button class="btn sm" data-plan-combo="' + v + '">' + icon("route", "sm") + "Plan</button></div></div>";
  }
  function comboFiltersHtml(title) {
    var f = state.combos;
    var chips = function (list, kind) {
      return '<div class="chips">' + list.map(function (id) { var b = S.badgeById[id]; return b ? '<span class="chip" aria-pressed="true">' + esc(b.name) + '<span class="x" role="button" tabindex="0" data-remove-' + kind + '="' + esc(id) + '" aria-label="Remove ' + esc(b.name) + '">' + icon("x", "sm") + "</span></span>" : ""; }).join("") +
        '<button class="chip" data-add="' + kind + '">+ Add badge</button></div>';
    };
    return '<div class="card side-panel">' +
      '<div class="field"><span class="field-label">Title</span><button class="btn" data-act="pick-title" style="justify-content:space-between">' + (title ? esc(title.name) : "Choose a title") + icon("chevron", "sm") + "</button></div>" +
      (title ? '<div class="field"><span class="field-label">Tier</span><div class="tier-row">' + title.line.tiers.map(function (t) {
        return '<button class="tier-pill" data-tier="' + t.star + '" aria-pressed="' + (t.star === title.star) + '">' + esc(t.name) + "</button>";
      }).join("") + "</div></div>" : "") +
      '<label class="switch"><input type="checkbox" id="cf-mine"' + (f.mine ? " checked" : "") + '><span class="track"></span>Only badges I\'ve unlocked</label>' +
      '<label class="switch"><input type="checkbox" id="cf-ready"' + (f.ready ? " checked" : "") + '><span class="track"></span>Only sets I can use right now</label>' +
      '<div class="field"><label for="cf-contract">Contract requirements</label>' + contractSelect("cf-contract", f.contract, "None (title only)") + "</div>" +
      '<div class="field"><span class="field-label">Must include</span>' + chips(f.include, "include") + "</div>" +
      '<div class="field"><span class="field-label">Exclude</span>' + chips(f.exclude, "exclude") + "</div>" +
      '<div class="field"><label for="cf-sort">Sort</label><select class="select" id="cf-sort"><option value="effort"' + (f.sort === "effort" ? " selected" : "") + '>Fewest upgrades for me</option><option value="name"' + (f.sort === "name" ? " selected" : "") + ">Badge name</option></select></div>" +
      '<button class="btn ghost" data-act="reset-combo-filters">' + icon("refresh", "sm") + "Reset filters</button></div>";
  }
  function renderCombos(root) {
    var title = state.combos.title ? S.titleByKey[state.combos.title] : null;
    var head = pageHead("Combinations", "Pick a title to see every set of three badges that unlocks it, then narrow it down with filters.");
    if (!title) {
      var picks = ["ClutchGoalkeeper:4", "Attack:4", "PerformancePlaymaking:4", "Polyvalent:4", "Random:4"].filter(function (k) { return S.titleByKey[k]; });
      root.innerHTML = head + '<div class="layout-2">' + comboFiltersHtml(null) + "<div>" +
        emptyState("layers", "Choose a title", "Every title comes from a mix of badge categories. Pick one to list all the badge sets that unlock it.",
          '<div class="chips" style="justify-content:center">' + picks.map(function (k) { return '<button class="chip" data-title-pick="' + k + '">' + esc(S.titleByKey[k].name) + "</button>"; }).join("") + "</div>") + "</div></div>";
      bindCombos(root, null);
      return;
    }
    var rows = comboRows(title), f = state.combos;
    var lowerTiers = title.line.tiers.filter(function (t) { return t.star < title.star; }).map(function (t) { return esc(t.name); });
    root.innerHTML = head + '<div class="layout-2">' + comboFiltersHtml(title) + "<div>" +
      '<div class="card title-hero"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h2>' + esc(title.name) + "</h2>" + starsHtml(title.star) + "</div>" +
      '<div class="chips">' + lineChips(title.line) + "</div>" +
      '<p class="rule">' + ruleText(title.line) + "</p>" +
      '<p class="rule">Tier: the <b>lowest</b> badge in the set decides it, so all three badges must be ' + (title.star === 4 ? "<b>" + TOP + "</b>" : "<b>" + title.star + "★</b> or higher") + "." +
      (lowerTiers.length ? " Earning it also unlocks " + lowerTiers.join(", ") + " if you don't have them yet." : "") + "</p></div>" +
      '<div class="section-head" style="margin-top:22px"><h2>' + fmt(rows.length) + (rows.length === 1 ? " set" : " sets") + "</h2>" +
      '<span class="dim" style="font-size:12.5px">' + (rows.filter(function (r) { return r.cost === 0; }).length) + " ready with your badges</span></div>" +
      (rows.length ? '<div class="combo-list">' + rows.slice(0, f.limit).map(function (r) { return comboHtml(r, title); }).join("") + "</div>" +
        (rows.length > f.limit ? '<div class="more-row"><button class="btn" data-act="more">Show ' + Math.min(60, rows.length - f.limit) + " more (" + fmt(rows.length - f.limit) + " left)</button></div>" : "")
        : emptyState("search", "No sets match these filters", "Remove an exclusion or turn off a switch to see more sets.", '<button class="btn" data-act="reset-combo-filters">Reset filters</button>')) +
      "</div></div>";
    bindCombos(root, title);
  }
  function bindCombos(root, title) {
    function rerender() { state.combos.limit = 60; renderCombos(root); }
    var mine = $("#cf-mine", root), ready = $("#cf-ready", root), con = $("#cf-contract", root), sort = $("#cf-sort", root);
    mine.addEventListener("change", function () { state.combos.mine = mine.checked; rerender(); });
    ready.addEventListener("change", function () { state.combos.ready = ready.checked; rerender(); });
    con.addEventListener("change", function () { state.combos.contract = con.value; rerender(); });
    sort.addEventListener("change", function () { state.combos.sort = sort.value; rerender(); });
    root.onclick = function (e) {
      var t;
      if ((t = e.target.closest('[data-act="pick-title"]'))) {
        openPicker(t, { items: titlePickerItems(), placeholder: "Search titles", onPick: function (k) { go("combos", k); } });
      } else if ((t = e.target.closest("[data-title-pick]"))) { go("combos", t.dataset.titlePick); }
      else if ((t = e.target.closest("[data-tier]"))) { go("combos", title.line.id + ":" + t.dataset.tier); }
      else if ((t = e.target.closest("[data-exclude]"))) {
        if (state.combos.exclude.indexOf(t.dataset.exclude) < 0) state.combos.exclude.push(t.dataset.exclude);
        state.combos.include = state.combos.include.filter(function (x) { return x !== t.dataset.exclude; });
        toast(S.badgeById[t.dataset.exclude].name + " excluded");
        renderCombos(root);
      } else if ((t = e.target.closest("[data-remove-include]"))) { state.combos.include = state.combos.include.filter(function (x) { return x !== t.dataset.removeInclude; }); rerender(); }
      else if ((t = e.target.closest("[data-remove-exclude]"))) { state.combos.exclude = state.combos.exclude.filter(function (x) { return x !== t.dataset.removeExclude; }); rerender(); }
      else if ((t = e.target.closest("[data-add]"))) {
        var kind = t.dataset.add, list = state.combos[kind];
        openPicker(t, {
          items: badgePickerItems(function (b) { return list.indexOf(b.id) < 0; }), placeholder: kind === "include" ? "Badge that must be in the set" : "Badge to leave out",
          onPick: function (id) {
            list.push(id);
            var other = kind === "include" ? "exclude" : "include";
            state.combos[other] = state.combos[other].filter(function (x) { return x !== id; });
            rerender();
          }
        });
      } else if ((t = e.target.closest('[data-act="more"]'))) {
        state.combos.limit += 60; var y = window.scrollY; renderCombos(root); window.scrollTo({ top: y });
      } else if ((t = e.target.closest('[data-act="reset-combo-filters"]'))) {
        state.combos.mine = false; state.combos.ready = false; state.combos.contract = "any"; state.combos.include = []; state.combos.exclude = []; state.combos.sort = "effort"; rerender();
      } else if ((t = e.target.closest("[data-plan-combo]"))) {
        var v = +t.dataset.planCombo;
        openMenu(t, [{ header: "Use this set in" }].concat(PLAN_CONTRACTS.map(function (c) {
          return { label: c.name + " (" + reqText(c.reqs) + ")", icon: "route", onClick: function () { planCombo(c.id, v, title.key); toast("Added to " + c.name + " in the planner"); } };
        })));
      }
    };
    root.onkeydown = function (e) {
      var x = e.target.closest("[data-remove-include],[data-remove-exclude]");
      if (x && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); x.click(); }
    };
  }

  /* ================================================================ Page: Contract planner */
  function planFor(cid) {
    var p = state.plan[cid];
    if (!p || !Array.isArray(p.slots)) p = state.plan[cid] = { slots: [null, null, null], target: null };
    return p;
  }
  function slotBadges(p) { return p.slots.map(function (s) { return s && S.badgeById[s.id] ? { b: S.badgeById[s.id], star: s.star } : null; }); }
  function planResult(c) {
    var p = planFor(c.id), sb = slotBadges(p);
    if (sb.some(function (x) { return !x; })) return null;
    var res = S.evaluateOrdered(sb.map(function (x) { return x.b; }));
    var stars = sb.map(function (x) { return x.star; });
    var tier = S.tierOf(stars);
    return { res: res, tier: tier, stars: stars, meets: S.meetsReqs(stars, c.reqs), sb: sb };
  }
  function planTarget(cid, key, autoFill) {
    var p = planFor(cid);
    p.target = key;
    if (autoFill) suggestFor(PLAN_CONTRACTS.find(function (c) { return c.id === cid; }), true);
    savePlan();
  }
  function planCombo(cid, v, key) {
    var c = PLAN_CONTRACTS.find(function (x) { return x.id === cid; }), p = planFor(cid), idx = comboIdx(v);
    var t = S.titleByKey[key];
    var nd = needsVec(t ? t.star : 1, c.reqs), need = assignNeeds(idx, nd);
    p.slots = idx.map(function (i) { return { id: S.badges[i].id, star: Math.max(state.stars[i], need[i]) }; });
    if (key) p.target = key;
    savePlan();
  }
  /** Fill a contract's slots with the cheapest set for its target (or the best new title if no target). */
  function suggestFor(c, quiet) {
    var p = planFor(c.id), all = S.allCombos(), st = state.stars, mineOnly = state.planner.mineOnly;
    var planned = plannedTitleKeys(c.id), hadTarget = p.target;
    var candidates = [];
    if (p.target && S.titleByKey[p.target]) candidates.push(S.titleByKey[p.target]);
    else {
      candidates = S.titles.filter(function (t) { return !state.owned.has(t.key) && !planned.has(t.key); })
        .sort(function (a, b) { return b.star - a.star || all.byLine[a.line.index].length - all.byLine[b.line.index].length; });
    }
    for (var ci = 0; ci < candidates.length; ci++) {
      var t = candidates[ci], arr = all.byLine[t.line.index], pur = all.purity[t.line.index], nd = needsVec(t.star, c.reqs), best = null;
      for (var n = 0; n < arr.length; n++) {
        var v = arr[n], i = v & 127, j = (v >> 7) & 127, k = (v >> 14) & 127;
        if (mineOnly && (!st[i] || !st[j] || !st[k])) continue;
        var s = sortDesc3(st[i], st[j], st[k]);
        var cost = Math.max(0, nd[0] - s[0]) + Math.max(0, nd[1] - s[1]) + Math.max(0, nd[2] - s[2]);
        var score = 4 + pur[n];
        if (!best || cost < best.cost || (cost === best.cost && score > best.score)) best = { v: v, cost: cost, score: score };
        if (best.cost === 0 && best.score === 7) break;
      }
      if (best && (hadTarget || best.cost === 0)) {
        planCombo(c.id, best.v, t.key);
        p.target = hadTarget || null;
        savePlan();
        if (!quiet) toast(c.name + ": " + t.name + (best.cost ? " (+" + plural(best.cost, "star") + " to go)" : ""));
        return true;
      }
    }
    if (!quiet) toast(mineOnly ? "Nothing new is ready with your badges — try turning off “only my badges”." : "No set found for that title.");
    return false;
  }
  function plannedTitleKeys(exceptCid) {
    var set = new Set();
    PLAN_CONTRACTS.forEach(function (c) {
      if (c.id === exceptCid) return;
      var r = planResult(c);
      if (r && r.res.line) r.res.line.tiers.forEach(function (t) { if (t.star <= r.tier) set.add(r.res.line.id + ":" + t.star); });
    });
    return set;
  }
  function reqProblem(c, stars) {
    if (!c.reqs.length) return null;
    var s = stars.slice().sort(function (a, b) { return b - a; }), r = c.reqs.slice().sort(function (a, b) { return b - a; });
    for (var i = 0; i < r.length; i++) {
      if (s[i] < r[i]) {
        var needCount = r.filter(function (x) { return x >= r[i]; }).length;
        return "Needs at least " + plural(needCount, "badge") + " at " + tierText(r[i]) + " or higher";
      }
    }
    return null;
  }
  function whyHtml(r) {
    var counts = r.res.counts.map(function (x) { return esc(CATS[x.cat].name) + " " + x.count; }).join(", ");
    var step;
    var tiedNames = r.res.tied.map(function (c) { return esc(CATS[c].name); }).join(", ");
    if (r.res.branch === "polyvalent") step = r.res.tied.length + " categories tie for the top count (" + tiedNames + ") → <b>" + esc(POLY.name) + "</b> line.";
    else if (r.res.branch === "pair") step = "Two categories tie for the top count (" + tiedNames + ") → " + (r.res.line ? "<b>" + esc(lineLabel(r.res.line)) + "</b> line." : "that pair has <b>no title line</b>, so this set gives nothing.");
    else step = "One category has the top count (" + tiedNames + ") → <b>" + esc(lineLabel(r.res.line)) + "</b> line.";
    return '<details class="why"><summary>Why this title?</summary><ol><li>Category tags counted: ' + counts + ".</li><li>" + step + "</li>" +
      (r.res.line ? "<li>Lowest badge is " + tierText(r.tier) + " → tier " + r.tier + ": <b>" + esc(r.res.line.tiers[r.tier - 1].name) + "</b>" + (r.tier > 1 ? ", plus the lower tiers of the line." : ".") + "</li>" : "") + "</ol></details>";
  }
  function contractCardHtml(c, n, earlier) {
    var p = planFor(c.id), r = planResult(c);
    var color = "hsl(" + (250 - n * 22) + " 70% 56%)";
    var slots = [0, 1, 2].map(function (i) {
      var s = p.slots[i], b = s && S.badgeById[s.id], req = c.reqs[i] || 1;
      if (!b) return '<button class="slot" data-slot="' + i + '"><span class="req">Slot ' + (i + 1) + " · " + tierText(req) + '+</span><span class="dim">+ Choose a badge</span></button>';
      var cur = state.stars[b.index];
      var lvl = cur >= s.star ? '<span class="badge-status ok" style="height:20px">' + tierText(s.star) + "</span>" : '<span class="badge-status warn" style="height:20px">' + (cur ? tierText(cur) : "Locked") + " → " + tierText(s.star) + "</span>";
      return '<div class="slot filled' + (r && !r.meets ? " bad" : "") + '"><span class="req">Slot ' + (i + 1) + " · " + tierText(req) + "+</span>" +
        '<button class="btn ghost sm" data-slot="' + i + '" style="padding:0;height:auto;justify-content:flex-start"><span class="nm">' + esc(b.name) + "</span></button>" +
        '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + dots(b.cats) + '<select class="select" data-slot-star="' + i + '" aria-label="Planned level" style="height:28px;padding:0 28px 0 8px;font-size:12px;border-radius:8px;background-position:calc(100% - 14px) 12px, calc(100% - 9px) 12px">' +
        [1, 2, 3, 4].map(function (v) { return '<option value="' + v + '"' + (v === s.star ? " selected" : "") + ">" + tierText(v) + "</option>"; }).join("") + "</select>" + lvl + "</span>" +
        '<button class="icon-btn clear" data-clear-slot="' + i + '" aria-label="Remove badge" style="width:28px;height:28px">' + icon("x", "sm") + "</button></div>";
    }).join("");
    var result;
    if (!r) result = '<div class="result-box"><div class="dim">Fill all three slots to see the title this contract will unlock.</div></div>';
    else if (!r.res.line) result = '<div class="result-box"><div><div class="big">No synergy title</div><div class="dim">This mix lands on a category pair without a title line.</div></div><span class="badge-status bad">Nothing</span>' + whyHtml(r) + "</div>";
    else {
      var t = r.res.line.tiers[r.tier - 1];
      var unlocks = r.res.line.tiers.filter(function (x) { return x.star <= r.tier; }).map(function (x) {
        var k = r.res.line.id + ":" + x.star;
        var tag = state.owned.has(k) ? " (owned)" : earlier.has(k) ? " (earlier contract)" : "";
        return '<span class="chip" style="height:26px' + (tag ? ";opacity:.6" : "") + '">' + esc(x.name) + esc(tag) + "</span>";
      }).join("");
      var prob = reqProblem(c, r.stars);
      var targetMiss = p.target && p.target !== r.res.line.id + ":" + r.tier && S.titleByKey[p.target];
      result = '<div class="result-box"><div><div class="dim" style="font-size:12px;font-weight:600">UNLOCKS</div><div class="big">' + esc(t.name) + " " + starsHtml(r.tier) + "</div>" +
        '<div class="chips" style="margin-top:8px">' + lineChips(r.res.line) + unlocks + "</div>" +
        (targetMiss ? '<div style="margin-top:8px" class="badge-status warn">Target was ' + esc(S.titleByKey[p.target].name) + "</div>" : "") + "</div>" +
        (prob ? '<span class="badge-status bad">' + esc(prob) + "</span>" : '<span class="badge-status ok">' + icon("check", "sm") + "Meets requirements</span>") + whyHtml(r) + "</div>";
    }
    var tgt = p.target && S.titleByKey[p.target];
    return '<article class="card contract" data-contract="' + c.id + '"><div class="contract-head"><div class="contract-badge" style="--cc:' + color + '">' + String(n + 1).padStart(2, "0") + "</div>" +
      "<div><h3>" + esc(c.name) + '</h3><div class="sub">' + (c.endless ? "Endless contract" : plural(c.levels, "level")) + " · " + fmt(c.exp) + " XP per level · needs " + esc(reqText(c.reqs)) + "</div></div>" +
      '<div class="spacer"></div><button class="btn sm" data-act="target">' + icon("target", "sm") + (tgt ? esc(tgt.name) : "Pick target title") + "</button>" +
      '<button class="btn sm primary" data-act="suggest">' + icon("wand", "sm") + "Suggest</button>" +
      '<button class="icon-btn" data-act="contract-menu" aria-label="More for ' + esc(c.name) + '">' + icon("dots") + "</button></div>" +
      '<div class="slots">' + slots + "</div>" + result + "</article>";
  }
  function plannerStatsHtml() {
    var planned = 0, problems = 0, dup = 0, titles = new Set(), seen = new Set();
    PLAN_CONTRACTS.forEach(function (c) {
      var r = planResult(c);
      if (!r) return;
      planned++;
      if (!r.meets) problems++;
      if (r.res.line) {
        var top = r.res.line.id + ":" + r.tier;
        if (seen.has(top) || state.owned.has(top)) dup++;
        seen.add(top);
        r.res.line.tiers.forEach(function (t) { if (t.star <= r.tier && !state.owned.has(r.res.line.id + ":" + t.star)) titles.add(r.res.line.id + ":" + t.star); });
      } else problems++;
    });
    return statCard("crown", "New titles in plan", String(titles.size), "including lower tiers", titles.size ? "" : "flat") +
      statCard("route", "Contracts planned", planned + "<small> / " + PLAN_CONTRACTS.length + "</small>", "with all 3 badges", "flat") +
      statCard("alert", "Issues", String(problems), problems ? "requirements or no title" : "all clear", problems ? "down" : "flat") +
      statCard("layers", "Repeated titles", String(dup), dup ? "same top title twice or owned" : "every contract adds something", dup ? "down" : "flat");
  }
  function renderPlanner(root) {
    var earlier = new Set();
    var cards = PLAN_CONTRACTS.map(function (c, n) {
      var html = contractCardHtml(c, n, new Set(earlier));
      var r = planResult(c);
      if (r && r.res.line) r.res.line.tiers.forEach(function (t) { if (t.star <= r.tier) earlier.add(r.res.line.id + ":" + t.star); });
      return html;
    }).join("");
    root.innerHTML = pageHead("Contract planner", "Every contract from Semi-pro on asks for three badges when you upgrade it. Plan which badges go in, check the requirements, and see the title each set unlocks.",
      '<button class="btn" data-act="clear-plan">Clear plan</button><button class="btn primary" data-act="copy-plan">' + icon("share", "sm") + "Copy plan</button>") +
      '<div class="stats" id="planner-stats">' + plannerStatsHtml() + "</div>" +
      '<div class="section"><div class="section-head"><h2>Your career</h2><label class="switch"><input type="checkbox" id="pl-mine"' + (state.planner.mineOnly ? " checked" : "") + '><span class="track"></span>Suggest only from badges I\'ve unlocked</label></div>' +
      '<div class="callout" style="margin-bottom:16px">' + icon("info") + "<div>Badge levels in each slot are the levels you plan to have when you upgrade; they start at your current level (or the slot minimum). Amber means you still need to level that badge. The title tier comes from the lowest badge in the set.</div></div>" +
      '<div class="contract-list">' + cards + "</div></div>";
    bindPlanner(root);
  }
  function planText() {
    var lines = ["Rematch contract plan"];
    PLAN_CONTRACTS.forEach(function (c) {
      var p = planFor(c.id), r = planResult(c);
      var names = p.slots.map(function (s) { return s && S.badgeById[s.id] ? S.badgeById[s.id].name + " " + tierText(s.star) : "—"; }).join(", ");
      lines.push(c.name + ": " + names + (r ? " => " + (r.res.line ? r.res.line.tiers[r.tier - 1].name : "no title") : ""));
    });
    return lines.join("\n");
  }
  function bindPlanner(root) {
    $("#pl-mine", root).addEventListener("change", function (e) { state.planner.mineOnly = e.target.checked; });
    root.onchange = function (e) {
      var sel = e.target.closest("[data-slot-star]");
      if (!sel) return;
      var cid = +sel.closest("[data-contract]").dataset.contract, p = planFor(cid);
      p.slots[+sel.dataset.slotStar].star = +sel.value;
      savePlan(); renderPlanner(root);
    };
    root.onclick = function (e) {
      var card = e.target.closest("[data-contract]"), t;
      var c = card ? PLAN_CONTRACTS.find(function (x) { return String(x.id) === card.dataset.contract; }) : null;
      if ((t = e.target.closest("[data-clear-slot]"))) { planFor(c.id).slots[+t.dataset.clearSlot] = null; savePlan(); renderPlanner(root); return; }
      if ((t = e.target.closest("[data-slot]"))) {
        var i = +t.dataset.slot, p = planFor(c.id);
        var used = p.slots.map(function (s, k) { return k !== i && s ? s.id : null; });
        openPicker(t, {
          items: badgePickerItems(function (b) { return used.indexOf(b.id) < 0; }), placeholder: "Badge for slot " + (i + 1),
          onPick: function (id) {
            var b = S.badgeById[id];
            p.slots[i] = { id: id, star: Math.max(state.stars[b.index], c.reqs[i] || 1) };
            savePlan(); renderPlanner(root);
          }
        });
        return;
      }
      if (!(t = e.target.closest("[data-act]"))) return;
      var act = t.dataset.act;
      if (act === "suggest") { suggestFor(c); renderPlanner(root); }
      else if (act === "target") {
        openPicker(t, {
          items: [{ value: "", label: "No target (suggest the best new title)", search: "none no target", sub: "" }].concat(titlePickerItems()), placeholder: "Target title",
          onPick: function (k) { planFor(c.id).target = k || null; savePlan(); if (k) suggestFor(c); renderPlanner(root); }
        });
      } else if (act === "contract-menu") {
        openMenu(t, [
          { label: "Clear this contract", icon: "x", onClick: function () { state.plan[c.id] = { slots: [null, null, null], target: null }; savePlan(); renderPlanner(root); } },
          { label: "Open target in Combinations", icon: "layers", onClick: function () { var p = planFor(c.id); if (p.target) go("combos", p.target); else toast("Pick a target title first"); } }
        ]);
      } else if (act === "clear-plan") {
        if (!confirm("Clear the whole plan?")) return;
        state.plan = {}; savePlan(); renderPlanner(root); toast("Plan cleared");
      } else if (act === "copy-plan") {
        var txt = planText();
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Plan copied"); }, function () { toast("Couldn't access the clipboard"); });
      }
    };
  }

  /* ================================================================ Page: Rules */
  function renderRules(root) {
    var lines = S.lines;
    var lineTable = '<div class="card table-wrap" style="max-height:none"><table class="data"><thead><tr><th>Synergy line</th><th>1★</th><th>2★</th><th>3★</th><th>' + TOP + '</th></tr></thead><tbody>' +
      lines.map(function (l) { return "<tr><td>" + lineChips(l) + "</td>" + l.tiers.map(function (t) { return '<td><a href="#combos/' + esc(l.id + ":" + t.star) + '">' + esc(t.name) + "</a></td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    var contractTable = '<div class="card table-wrap" style="max-height:none"><table class="data"><thead><tr><th>Contract</th><th>Levels</th><th class="hide-sm">XP per level</th><th>Badges to upgrade</th><th class="hide-sm">Reward title</th></tr></thead><tbody>' +
      CONTRACTS.map(function (c) {
        return "<tr><td><b>" + esc(c.name) + "</b></td><td class=\"mono\">" + (c.endless ? "∞" : c.levels) + '</td><td class="mono hide-sm">' + fmt(c.exp) + "</td><td>" + (c.slots ? c.reqs.map(starsHtml).join(" ") : '<span class="dim">None</span>') +
          '</td><td class="hide-sm">' + (c.rewardTitles.length ? c.rewardTitles.map(esc).join(", ") : '<span class="dim">—</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    var B = function (id) { return S.badgeById[id] ? S.badgeById[id].name : id; };
    var ex = [
      [[B("Goal"), B("Header"), B("Acrobat")], "Attack 3", "Attack (single)"],
      [[B("Goal"), B("Header"), B("Save")], "Attack 2, Goalkeeper 1", "Attack (the majority wins, no pair)"],
      [[B("GuardianAngel"), B("Remontada"), B("Save")], "Clutch 2, Goalkeeper 2", "Clutch + Goalkeeper (Boss → Angel)"],
      [[B("GuardianAngel"), B("NoOvertime"), B("Save")], "Goalkeeper 3, Clutch 2", "Goalkeeper (single)"],
      [[B("GuardianAngel"), B("NoOvertime"), B("Goal")], "Clutch 2, Goalkeeper 2, Attack 1", "Clutch + Goalkeeper (Attack doesn't tie, so it doesn't count)"],
      [[B("ColdBlood"), B("BackToFront"), B("GuardianAngel")], "Playmaking 2, Clutch 2, Goalkeeper 2", "3+ categories (all three tie)"],
      [[B("Goal"), B("Save"), B("Pass")], "1, 1, 1", "3+ categories"],
      [[B("LuckyStrike"), B("Goal"), B("Denied")], "Attack 2, Random 2", "Nothing: Attack + Random has no title line"]
    ];
    var cost = DATA.meta.titlePurchaseCost || [];
    root.innerHTML = pageHead("Rules", "How contracts, badges and synergy titles work, decoded from the game client and its live configuration.") +
      '<div class="section"><div class="section-head"><h2>The short version</h2></div><div class="flow">' +
      '<div class="card flow-step"><h4>Play matches</h4><p>Matches give contract XP. Your actions on the pitch also fill your badges.</p></div>' +
      '<div class="card flow-step"><h4>Level your badges</h4><p>Each badge has 4 levels, 1★ to 4★ (the game calls 4★ All-Star). Reaching 1★ unlocks it.</p></div>' +
      '<div class="card flow-step"><h4>Max your contract</h4><p>Reach the contract\'s last level, then assign 3 badges that meet its rank requirements.</p></div>' +
      '<div class="card flow-step"><h4>Sign the next one</h4><p>The 3 badges\' categories pick a title line; your lowest badge picks the tier. You get it when you sign.</p></div></div></div>' +
      '<div class="section"><div class="rule-grid">' +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("shield") + "</span>Badges</h3><ul>" +
      "<li>There are <b>" + N + " badges</b> across <b>" + DATA.categories.length + " categories</b>: " + DATA.categories.map(function (c) { return esc(c.name); }).join(", ") + ".</li>" +
      "<li>Many badges are <b>hybrids</b> with two categories (e.g. Guardian angel is Clutch + Goalkeeper). A hybrid counts for <b>both</b> categories in a synergy.</li>" +
      "<li>Every badge has its own targets per level, e.g. Goal needs " + S.badgeById.Goal.targets.map(fmt).join(" / ") + " goals.</li>" +
      "<li>You can show up to <b>" + DATA.meta.equipSlots + " badges</b> on your player card. That is separate from the badges you assign to a contract.</li></ul></div>" +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("route") + "</span>Contracts</h3><ul>" +
      "<li>Your career is a ladder of <b>" + CONTRACTS.length + " contracts</b>, from " + esc(CONTRACTS[0].name) + " to " + esc(CONTRACTS[CONTRACTS.length - 1].name) + ".</li>" +
      "<li>Level a contract by playing. At max level you can <b>upgrade</b> it and collect its rewards.</li>" +
      "<li>From <b>" + esc(PLAN_CONTRACTS[0].name) + "</b> on, upgrading needs <b>3 badges</b> at minimum ranks. The ranks work as “at least N badges of rank R or higher”, so slot order doesn't matter for requirements.</li>" +
      "<li>The 3 badges stay <b>linked to that contract</b> as part of your career history.</li></ul></div></div></div>" +
      '<div class="section"><div class="section-head"><h2>Contract ladder</h2></div>' + contractTable + "</div>" +
      '<div class="section"><div class="section-head"><h2>How the synergy title is picked</h2></div><div class="prose">' +
      "<ol><li><b>Count category tags.</b> Count every category the 3 badges carry. A hybrid badge adds 1 to each of its two categories. Slot order doesn't matter.</li>" +
      "<li><b>Find the top.</b> Every category with the highest count is <b>tied</b>. These are the categories the game highlights next to your slots.</li>" +
      "<li><b>3 or more tied:</b> you get the <b>" + esc(POLY.name) + "</b> line (" + esc(S.polyLine.tiers.map(function (t) { return t.name; }).join(" → ")) + ").</li>" +
      "<li><b>2 tied:</b> you get that pair's line. Only " + lines.filter(function (l) { return l.kind === "pair"; }).length + " pairs have a line. Any other pair gives <b>no title</b>.</li>" +
      "<li><b>1 on top:</b> you get that category's line.</li>" +
      "<li><b>Tier</b> = your <b>lowest</b> badge in the set (1★ to " + TOP + "). You also get every lower tier of that line you don't have yet.</li></ol>" +
      '<div class="callout warn">' + icon("alert") + "<div><b>Two things worth knowing.</b> The tier follows your <b>weakest</b> badge: a single 1★ badge in the set caps the title at 1★, even if the other two are " + TOP + ". And a pair only triggers when the two categories are <b>exactly tied</b> at the top: Attack, Attack, Defense is an Attack title.</div></div>" +
      '<div class="card table-wrap example-table" style="max-height:none"><table class="data"><thead><tr><th>Badges</th><th>Category counts</th><th>Result</th></tr></thead><tbody>' +
      ex.map(function (r) { return "<tr><td>" + r[0].map(esc).join(" · ") + '</td><td class="mono" style="font-size:12.5px">' + esc(r[1]) + "</td><td>" + esc(r[2]) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<div class="callout">' + icon("info") + "<div>Three hybrids that form a triangle (such as Cold blood, Back to front and Guardian angel) tie all three categories at 2, so they give a <b>" + esc(POLY.name) + "</b> title, not a pair.</div></div></div></div>" +
      '<div class="section"><div class="section-head"><h2>All ' + S.titles.length + " synergy titles</h2></div>" + lineTable + "</div>" +
      (cost.length ? '<div class="section"><div class="section-head"><h2>Title synergy crafting</h2><span class="badge-status warn">' + icon("alert", "sm") + "Unconfirmed to have been added yet</span></div>" +
        "<div class=\"prose\"><p class=\"dim\">The game files and live config already contain this feature and its prices, but it hasn't been confirmed as available in-game yet.</p>" +
        '<p>Later contracts unlock the <b>title synergy crafting</b> feature: you can buy the title your assigned badges point to instead of waiting. The live price per tier is ' +
        cost.map(function (c, i) { return "<b>" + fmt(c) + "</b> (" + tierText(i + 1) + ")"; }).join(", ") + ". You can buy only the top title, or every lower tier you're missing in one go, which adds those prices together.</p></div></div>" : "") +
      '<div class="section"><div class="section-head"><h2>Where this comes from</h2></div><div class="prose"><p>Badge targets, categories, contract requirements and the title table come from the configuration the game downloads at login (version <code>' + esc(DATA.meta.configVersion) + "</code>). Names come from the game files (" + esc(DATA.meta.gameBuild) + "). The selection rule mirrors the game client's synergy logic. Titles are granted by Sloclap's servers, so if the game ever disagrees with this page, the game is right.</p></div></div>";
  }

  /* ================================================================ Page: About */
  function renderAbout(root) {
    var d = new Date(DATA.meta.generatedAt);
    root.innerHTML = pageHead("About", "An unofficial companion for REMATCH badge synergies, made and maintained by Rimmy (KHBIN).") +
      '<div class="rule-grid">' +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("heart") + "</span>Thank you, Sloclap</h3><p><b>REMATCH</b> is created by <b>Sloclap</b>, the studio behind Absolver and Sifu. Every badge, title, contract and name on this site is theirs. This tool only exists because they made a game worth obsessing over.</p>" +
      '<p>Support the game: <a href="https://store.steampowered.com/app/2138720/" target="_blank" rel="noopener noreferrer">REMATCH on Steam</a> · <a href="https://www.sloclap.com/" target="_blank" rel="noopener noreferrer">sloclap.com</a></p></div>' +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("alert") + "</span>Disclaimer</h3><p>This is an unofficial project made and maintained by Rimmy (KHBIN). It is not affiliated with, endorsed, sponsored or approved by Sloclap. REMATCH and all related names, logos and game content are trademarks or property of Sloclap. No game art is used.</p></div>" +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("shield") + "</span>Copyright</h3><p>© 2026 Rimmy (KHBIN). All rights reserved. The code, design and text of this site are proprietary. You may use the site, but you may not copy, modify, re-host, mirror or redistribute it, in whole or in part, without written permission. See the LICENSE file in the repository.</p></div>" +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("info") + "</span>Your data</h3><p>Badge levels, owned titles and your plan are stored only in this browser (local storage). Nothing is sent anywhere, there are no accounts and no tracking. Use Import / export on My badges to move your levels between devices.</p></div>" +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("refresh") + "</span>Data version</h3><ul><li>Generated " + esc(isNaN(d) ? DATA.meta.generatedAt : d.toLocaleString()) + "</li><li>Live config <code>" + esc(DATA.meta.configVersion) + "</code></li><li>Game files from " + esc(DATA.meta.gameBuild) + "</li><li>" + N + " badges · " + S.lines.length + " lines · " + S.titles.length + " titles · " + CONTRACTS.length + " contracts</li></ul></div>" +
      '<div class="card rule-card"><h3><span class="stat-icon">' + icon("chat") + "</span>Contact</h3><p>Made and maintained by <b>Rimmy (KHBIN)</b>.<br>Questions, bugs or ideas? Get in touch:</p>" +
      '<ul class="contact-list"><li><span class="label">Discord</span><code>@notrimmy</code><button class="btn sm ghost" data-copy="notrimmy">' + icon("check", "sm") + "Copy</button></li>" +
      '<li><span class="label">Reddit</span><a href="https://www.reddit.com/user/KHBIN/" target="_blank" rel="noopener noreferrer">u/KHBIN</a></li></ul></div>' +
      // Hidden for now - "For the maintainer" card, restore by uncommenting:
      // '<div class="card rule-card"><h3><span class="stat-icon">' + icon("wand") + "</span>For the maintainer</h3><p>After a game update, double-click <code>update_data.bat</code>. It reads the installed game, downloads the live config, rebuilds <code>data/game-data.js</code> and runs the checks. Then commit and push.</p></div>" +
      "</div>";
    root.onclick = function (e) {
      var b = e.target.closest("[data-copy]");
      if (!b) return;
      var txt = b.dataset.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Copied " + txt); }, function () { toast("Discord: " + txt); });
    };
  }

  /* ================================================================ Global search */
  function bindSearch() {
    var input = $("#search-input"), box = $("#search-results"), wrap = $("#search"), items = [], active = 0;
    function close() { box.hidden = true; input.setAttribute("aria-expanded", "false"); }
    function draw() {
      var q = input.value.trim().toLowerCase();
      if (!q) { close(); return; }
      var titles = S.titles.filter(function (t) { return (t.name + " " + lineLabel(t.line)).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      var badges = S.badges.filter(function (b) { return (b.name + " " + b.desc).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      items = titles.map(function (t) { return { kind: "title", key: t.key, html: esc(t.name) + '<span class="kind">' + esc(lineLabel(t.line)) + " · " + tierText(t.star) + "</span>" }; })
        .concat(badges.map(function (b) { return { kind: "badge", key: b.id, html: esc(b.name) + '<span class="kind">' + b.cats.map(function (c) { return esc(CATS[c].name); }).join(" + ") + "</span>" }; }));
      active = 0;
      box.innerHTML = items.length ? (titles.length ? '<div class="result-group">Titles</div>' : "") + items.map(function (it, i) {
        return (it.kind === "badge" && (i === 0 || items[i - 1].kind !== "badge") ? '<div class="result-group">Badges</div>' : "") +
          '<button class="result-item' + (i === active ? " active" : "") + '" data-i="' + i + '" role="option">' + it.html + "</button>";
      }).join("") : '<div class="result-group">No results</div>';
      box.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function choose(i) {
      var it = items[i];
      if (!it) return;
      close(); input.value = ""; wrap.classList.remove("open");
      if (it.kind === "title") go("combos", it.key);
      else {
        state.badges = { q: "", cat: "all", show: "all" };
        if (state.page !== "badges") go("badges"); else render();
        setTimeout(function () {
          var card = $('.badge-card[data-badge="' + CSS.escape(it.key) + '"]');
          if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("flash"); setTimeout(function () { card.classList.remove("flash"); }, 1600); }
        }, 60);
      }
    }
    input.addEventListener("input", draw);
    input.addEventListener("keydown", function (e) {
      var btns = $$(".result-item", box);
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(btns.length - 1, active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); }
      else if (e.key === "Enter") { e.preventDefault(); choose(active); return; }
      else if (e.key === "Escape") { close(); input.blur(); wrap.classList.remove("open"); return; }
      else return;
      btns.forEach(function (b, i) { b.classList.toggle("active", i === active); });
      if (btns[active]) btns[active].scrollIntoView({ block: "nearest" });
    });
    box.addEventListener("mousedown", function (e) { var b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); choose(+b.dataset.i); } });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    $("#search-toggle").addEventListener("click", function () { wrap.classList.add("open"); input.focus(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); wrap.classList.add("open"); input.focus(); }
    });
  }

  /* ================================================================ Theme */
  function bindTheme() {
    var mq = window.matchMedia("(prefers-color-scheme: dark)"), chosen = null;
    function apply(t) {
      document.documentElement.setAttribute("data-theme", t);
      $("#theme-toggle").innerHTML = icon(t === "dark" ? "sun" : "moon");
      $("#theme-toggle").setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
    apply(mq.matches ? "dark" : "light");
    mq.addEventListener("change", function (e) { if (!chosen) apply(e.matches ? "dark" : "light"); });
    $("#theme-toggle").addEventListener("click", function () {
      chosen = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(chosen);
    });
  }

  /* ================================================================ Copy protection notice */
  function checkHost() {
    var h = location.hostname;
    var local = !h || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || location.protocol === "file:";
    if (!OFFICIAL_HOSTS.length || local || OFFICIAL_HOSTS.indexOf(h) >= 0) return;
    var b = $("#copy-banner");
    b.innerHTML = "This is an unauthorized copy of REMATCH Lab." + (OFFICIAL_URL ? ' Please use the original at <a href="' + esc(OFFICIAL_URL) + '">' + esc(OFFICIAL_URL) + "</a>." : "");
    b.hidden = false;
  }

  /* ================================================================ Boot */
  function boot() {
    if (!DATA || !DATA.badges) { document.body.innerHTML = "<p style='padding:40px'>Missing data/game-data.js. Run update_data.bat.</p>"; return; }
    buildNav();
    bindTheme();
    bindSearch();
    bindShare();
    checkHost();
    window.addEventListener("hashchange", route);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePopover(); });
    S.allCombos();
    route();
    if (window.console) console.info("%cREMATCH Lab", "font-weight:700;color:#5b4bff", "\n© 2026 All rights reserved. Unauthorized copying or re-hosting is prohibited. REMATCH © Sloclap.");
  }
  boot();
})();
