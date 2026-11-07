/*!
 * REMATCH Lab - synergy engine
 * Copyright (c) 2026 Rimmy (KHBIN). All rights reserved.
 * Unauthorized copying, modification or redistribution of this file is prohibited. See LICENSE.
 *
 * Mirrors how the game builds a contract's "unlockable titles" from the 3 assigned badges
 * (contract view model: tied categories + the live title table):
 *   1. count every category tag of the 3 badges (a hybrid badge counts for both of its categories)
 *   2. tied = every category that has the highest count
 *   3. 3+ tied        -> the "3+ categories" line
 *      1 or 2 tied    -> the line whose categories are exactly the tied set (none if no such line)
 *   4. tier = LOWEST badge level among the 3 (capped at 4); every lower tier of the line is granted too.
 * Slot order never matters.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RematchSynergy = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function create(data) {
    var badges = data.badges.map(function (b, i) { return Object.assign({ index: i }, b); });
    var badgeById = {};
    badges.forEach(function (b) { badgeById[b.id] = b; });
    var lines = data.titleLines.map(function (l, i) { return Object.assign({ index: i }, l); });
    var lineById = {};
    var lineByKey = {};
    var polyLine = null;
    lines.forEach(function (l) {
      lineById[l.id] = l;
      if (l.kind === "polyvalent") polyLine = l;
      else lineByKey[l.cats.slice().sort().join("+")] = l;
    });
    var titles = [];
    lines.forEach(function (l) {
      l.tiers.forEach(function (t) {
        titles.push({ key: l.id + ":" + t.star, line: l, star: t.star, name: t.name, asset: t.asset });
      });
    });
    var titleByKey = {};
    titles.forEach(function (t) { titleByKey[t.key] = t; });

    /* ---------- core evaluation ---------- */
    /** Category counts, highest first (ties keep first-seen order; display only). */
    function countCategories(setBadges) {
      var keys = [], counts = {};
      setBadges.forEach(function (b) {
        b.cats.forEach(function (c) {
          if (counts[c] === undefined) { counts[c] = 0; keys.push(c); }
          counts[c]++;
        });
      });
      return keys.map(function (k, i) { return { cat: k, count: counts[k], i: i }; })
        .sort(function (a, b) { return b.count - a.count || a.i - b.i; })
        .map(function (x) { return { cat: x.cat, count: x.count }; });
    }

    function evaluateOrdered(setBadges) {
      var counts = countCategories(setBadges);
      var res = { counts: counts, tied: [], line: null, branch: "none", pairCats: null };
      if (!counts.length) return res;
      var top = counts[0].count;
      res.tied = counts.filter(function (c) { return c.count === top; }).map(function (c) { return c.cat; });
      if (res.tied.length >= 3) {
        res.branch = "polyvalent";
        res.line = polyLine;
      } else {
        res.branch = res.tied.length === 2 ? "pair" : "single";
        if (res.tied.length === 2) res.pairCats = res.tied.slice();
        res.line = lineByKey[res.tied.slice().sort().join("+")] || null;
      }
      return res;
    }

    /** Evaluate a set of 3 badge indexes. Kept for callers that expect outcomes; order never matters. */
    function evaluateSet(idx) {
      var r = evaluateOrdered(idx.map(function (i) { return badges[i]; }));
      return { orderSensitive: false, outcomes: [{ line: r.line, order: idx.slice(), result: r }] };
    }

    /* ---------- every 3-badge set, grouped by the line it produces ---------- */
    var combosCache = null;
    function pack(a, b, c) { return a | (b << 7) | (c << 14); }
    function unpack(v) { return { idx: [v & 127, (v >> 7) & 127, (v >> 14) & 127], orderSensitive: false }; }

    function allCombos() {
      if (combosCache) return combosCache;
      var tmp = lines.map(function () { return []; });
      var none = [];
      var N = badges.length;
      for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) for (var k = j + 1; k < N; k++) {
        var l = evaluateOrdered([badges[i], badges[j], badges[k]]).line;
        if (l) tmp[l.index].push(pack(i, j, k)); else none.push(pack(i, j, k));
      }
      // purity = how many of the 3 badges only carry the line's own categories (cleaner examples first)
      var purity = tmp.map(function (arr, li) {
        var line = lines[li], own = {};
        line.cats.forEach(function (c) { own[c] = true; });
        var out = new Uint8Array(arr.length);
        for (var n = 0; n < arr.length; n++) {
          var v = arr[n], p = 0, ids = [v & 127, (v >> 7) & 127, (v >> 14) & 127];
          for (var q = 0; q < 3; q++) {
            var cats = badges[ids[q]].cats;
            if (line.kind === "polyvalent" ? cats.length === 1 : cats.every(function (c) { return own[c]; })) p++;
          }
          out[n] = p;
        }
        return out;
      });
      combosCache = { byLine: tmp.map(function (a) { return Int32Array.from(a); }), purity: purity, none: Int32Array.from(none) };
      return combosCache;
    }

    /* ---------- requirements ---------- */
    function sortDesc(a) { return a.slice().sort(function (x, y) { return y - x; }); }

    /** Contract rule "at least N badges of rank R or higher" == sorted stars dominate sorted requirements. */
    function meetsReqs(stars, reqs) {
      if (!reqs || !reqs.length) return stars.every(function (s) { return s >= 1; });
      var s = sortDesc(stars), r = sortDesc(reqs);
      for (var i = 0; i < r.length; i++) if ((s[i] || 0) < r[i]) return false;
      return s.every(function (x) { return x >= 1; });
    }

    /** Level each slot needs (descending) for a target tier: the tier needs ALL 3 badges at that level. */
    function needsFor(tier, reqs) {
      var r = sortDesc(reqs && reqs.length ? reqs : [1, 1, 1]);
      while (r.length < 3) r.push(1);
      return sortDesc(r.map(function (x) { return Math.max(x, tier || 1); }));
    }

    /** Tier a set of levels grants: the lowest level, capped at 4. */
    function tierOf(stars) { return Math.min(4, Math.min.apply(null, stars)); }

    return {
      badges: badges, badgeById: badgeById, lines: lines, lineById: lineById, titles: titles, titleByKey: titleByKey,
      polyLine: polyLine, evaluateOrdered: evaluateOrdered, evaluateSet: evaluateSet, countCategories: countCategories,
      allCombos: allCombos, unpack: unpack, meetsReqs: meetsReqs, needsFor: needsFor, tierOf: tierOf
    };
  }

  return { create: create };
});
