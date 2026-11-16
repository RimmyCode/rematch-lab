/*!
 * REMATCH Lab - language packs and the language switcher
 * Copyright (c) 2026 Rimmy (KHBIN). All rights reserved.
 * Unauthorized copying, modification or redistribution of this file is prohibited. See LICENSE.
 *
 * Layout
 *   data/i18n/names-<code>.js  game-localized badge / description / category / contract / title names
 *   data/i18n/ui-<code>.js     this site's own interface strings (this file's t() keys)
 *
 * The name pack is loaded with document.write while the page is still parsing, so it is applied
 * to window.REMATCH_DATA before js/app.js builds the synergy engine. Switching language saves the
 * choice and reloads, which keeps every page, filter and URL state consistent.
 */
(function () {
  "use strict";

  var LANGS = [
    { code: "en", name: "English", rtl: false },
    { code: "fr", name: "Français", rtl: false },
    { code: "de", name: "Deutsch", rtl: false },
    { code: "es", name: "Español", rtl: false },
    { code: "it", name: "Italiano", rtl: false },
    { code: "pt-BR", name: "Português (Brasil)", rtl: false },
    { code: "pl", name: "Polski", rtl: false },
    { code: "tr", name: "Türkçe", rtl: false },
    { code: "ru", name: "Русский", rtl: false },
    { code: "ja", name: "日本語", rtl: false },
    { code: "ko", name: "한국어", rtl: false },
    { code: "zh-Hans", name: "简体中文", rtl: false },
    { code: "zh-Hant", name: "繁體中文", rtl: false },
    { code: "ar", name: "العربية", rtl: true }
  ];
  var KEY = "rth:lang";
  var CODES = LANGS.map(function (l) { return l.code; });

  function byCode(c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === c) return LANGS[i]; return null; }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(c) { try { localStorage.setItem(KEY, c); } catch (e) { /* private mode */ } }

  /** "pt-br" -> pt-BR, "zh-TW" -> zh-Hant, "fr-CA" -> fr, ... */
  function match(tag) {
    var t = String(tag || "").toLowerCase();
    if (!t) return null;
    if (t.indexOf("pt") === 0) return "pt-BR";
    if (t.indexOf("zh") === 0) return /hant|tw|hk|mo/.test(t) ? "zh-Hant" : "zh-Hans";
    var two = t.split("-")[0];
    var hit = null;
    LANGS.forEach(function (l) {
      var lc = l.code.toLowerCase();
      if (lc === t || lc === two) hit = l.code;
    });
    return hit;
  }
  function detect() {
    var m = /[?&]lang=([^&]+)/.exec(location.search);
    if (m) {
      var q = match(decodeURIComponent(m[1]));
      if (q) return q;
    }
    var s = stored();
    if (s && CODES.indexOf(s) >= 0) return s;
    var list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"]);
    for (var i = 0; i < list.length; i++) {
      var m = match(list[i]);
      if (m) return m;
    }
    return "en";
  }

  var code = detect();
  var meta = byCode(code) || LANGS[0];

  // Load the packs before the rest of the page parses (synchronous, works on file:// too).
  if (code !== "en") {
    document.write('<script src="data/i18n/names-' + code + '.js"><\/script>');
    document.write('<script src="data/i18n/ui-' + code + '.js"><\/script>');
  }

  function uiTable() {
    var all = window.RTH_UI || {};
    return all[code] || {};
  }

  /** t("key", "English fallback", {n: 12}) */
  function t(key, fallback, vars) {
    var table = uiTable();
    var s = table[key];
    if (s == null) s = fallback == null ? key : fallback;
    if (vars) {
      s = String(s).replace(/\{(\w+)\}/g, function (m, k) {
        return vars[k] == null ? m : vars[k];
      });
    }
    return s;
  }

  /** Localize window.REMATCH_DATA in place. Must run before the app creates its engine. */
  function apply(data) {
    var n = (window.RTH_NAMES || {})[code];
    if (n && data) {
      (data.badges || []).forEach(function (b) {
        if (n.badges[b.id]) b.name = n.badges[b.id];
        if (n.descs[b.id]) b.desc = n.descs[b.id];
      });
      (data.categories || []).forEach(function (c) { if (n.cats[c.id]) c.name = n.cats[c.id]; });
      if (data.polyvalent && n.poly) data.polyvalent.name = n.poly;
      (data.contracts || []).forEach(function (c) { if (n.contracts[String(c.id)]) c.name = n.contracts[String(c.id)]; });
      (data.titleLines || []).forEach(function (l) {
        if (l.kind === "polyvalent") {
          if (n.poly) l.label = n.poly;
        } else if (n.cats) {
          l.label = l.cats.map(function (c) { return n.cats[c] || c; }).join(" + ");
        }
        (l.tiers || []).forEach(function (tier) {
          var v = n.titles[l.id + ":" + tier.star];
          if (v) tier.name = v;
        });
      });
      if (data.meta) data.meta.lang = code;
    }
    document.documentElement.lang = code;
    document.documentElement.dir = n && n.rtl ? "rtl" : "ltr";
    return data;
  }

  /* ---------------------------------------------------------------- switcher */
  function buildSwitcher() {
    var host = document.getElementById("lang");
    if (!host) return;
    var btn = document.getElementById("lang-toggle");
    var menu = document.getElementById("lang-menu");
    var label = document.getElementById("lang-code");
    if (!btn || !menu) return;

    if (label) label.textContent = code.toUpperCase().slice(0, 3);
    btn.setAttribute("aria-label", t("lang.label", "Language") + ": " + meta.name);
    btn.title = t("lang.label", "Language") + ": " + meta.name;

    menu.innerHTML = LANGS.map(function (l) {
      return '<button type="button" role="option" data-lang="' + l.code + '" aria-selected="' + (l.code === code) + '"' +
        (l.rtl ? ' dir="rtl"' : "") + '><span class="lang-native">' + l.name + '</span><span class="lang-code">' + l.code + "</span></button>";
    }).join("");

    function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    function open() { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-lang]");
      if (!b) return;
      var next = b.dataset.lang;
      if (next === code) { close(); return; }
      setLang(next);
    });
    document.addEventListener("click", function (e) { if (!host.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  /* ---------------------------------------------------------------- static text */
  function localizeDom() {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.textContent = t(el.getAttribute("data-i18n"), el.textContent);
    }
    var attrs = document.querySelectorAll("[data-i18n-placeholder]");
    for (var j = 0; j < attrs.length; j++) {
      attrs[j].setAttribute("placeholder", t(attrs[j].getAttribute("data-i18n-placeholder"), attrs[j].getAttribute("placeholder")));
    }
    var ar = document.querySelectorAll("[data-i18n-aria]");
    for (var k = 0; k < ar.length; k++) {
      ar[k].setAttribute("aria-label", t(ar[k].getAttribute("data-i18n-aria"), ar[k].getAttribute("aria-label")));
    }
    var html = document.querySelectorAll("[data-i18n-html]");
    for (var h = 0; h < html.length; h++) {
      html[h].innerHTML = t(html[h].getAttribute("data-i18n-html"), html[h].innerHTML);
    }
  }

  /** Remember the choice, drop ?lang=... (which would otherwise win on reload) and reload. */
  function setLang(next) {
    if (CODES.indexOf(next) < 0 || next === code) return;
    save(next);
    var url;
    try {
      url = new URL(location.href);
      url.searchParams.delete("lang");
      url = url.toString();
    } catch (e) {
      url = location.pathname + location.hash;
    }
    location.replace(url);
  }

  window.I18N = {
    get lang() { return code; },
    get rtl() { return !!meta.rtl; },
    langs: LANGS,
    t: t,
    apply: apply,
    setLang: setLang
  };

  function ready() {
    localizeDom();
    buildSwitcher();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
