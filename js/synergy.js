/*!
 * REMATCH Helper - synergy engine
 * Copyright (c) 2026 Rimmy (KHBIN). All rights reserved.
 * Unauthorized copying, modification or redistribution of this file is prohibited. See LICENSE.
 *
 * Mirrors the game client's badge-synergy evaluation (URuntimeContractsSubsystem):
 *   1. count every category tag of the 3 assigned badges, in slot order
 *   2. sort categories by count, descending (UE small-array selection sort; ties keep the earlier one)
 *   3. 3+ categories and (c0 == c1) == c2   -> "3+ categories" line   (C++ `a == b == c` evaluation)
 *      else top-2 counts tie                 -> the pair line of those two categories (none if no such line)
 *      else                                  -> the single line of the top category
 *   4. tier = highest star among the 3 badges; lower tiers of the same line are granted too.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RematchSynergy = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  function create(data) {
    var badges = data.badges.map(function (b, i) { return Object.assign({ index: i }, b); });
    var badgeById = {};
    badges.forEach(function (b) { badgeById[b.id] = b; });
    var lines = data.titleLines.map(function (l, i) { return Object.assign({ index: i }, l); });
    var lineById = {};
    var singleByCat = {};
    var pairByKey = {};
    var polyLine = null;
    lines.forEach(function (l) {
      lineById[l.id] = l;
      if (l.kind === "single") singleByCat[l.cats[0]] = l;
      else if (l.kind === "pair") pairByKey[l.cats.slice().sort().join("+")] = l;
      else polyLine = l;
    });
    var titles = [];
    lines.forEach(function (l) {
      l.tiers.forEach(function (t) {
        titles.push({ key: l.id + ":" + t.star, line: l, star: t.star, name: t.name, asset: t.asset });
      });
    });
    var titleByKey = {};
    titles.forEach(function (t) { titleByKey[t.key] = t; });

    /* ---------- core evaluation, slot order matters for exact ties ---------- */
    function countCategories(slotBadges) {
      var keys = [], counts = {};
      slotBadges.forEach(function (b) {
        b.cats.forEach(function (c) {
          if (counts[c] === undefined) { counts[c] = 0; keys.push(c); }
          counts[c]++;
        });
      });
      var arr = keys.map(function (k) { return { cat: k, count: counts[k] }; });
      // UE Algo::IntroSort, partitions <= 8: repeatedly move the first lowest element to the end
      for (var max = arr.length - 1; max > 0; max--) {
        var m = 0;
        for (var i = 1; i <= max; i++) if (arr[m].count > arr[i].count) m = i;
        var tmp = arr[m]; arr[m] = arr[max]; arr[max] = tmp;
      }
      return arr;
    }

    function evaluateOrdered(slotBadges) {
      var arr = countCategories(slotBadges);
      var n = arr.length;
      var res = { counts: arr, line: null, branch: "none", pairCats: null };
      if (n >= 3 && ((arr[0].count === arr[1].count) ? 1 : 0) === arr[2].count) {
        res.branch = "polyvalent";
        res.line = polyLine;
      } else if (n >= 2 && arr[0].count === arr[1].count) {
        res.branch = "pair";
        res.pairCats = [arr[0].cat, arr[1].cat];
        res.line = pairByKey[res.pairCats.slice().sort().join("+")] || null;
      } else if (n >= 1) {
        res.branch = "single";
        res.line = singleByCat[arr[0].cat] || null;
      }
      return res;
    }

    function isOrderSensitive(counts) {
      // only the A+B / B+C / A+C triangle (2,2,2) leaves the pair choice to slot order
      return counts.length >= 3 && counts[0].count === counts[1].count && counts[1].count === counts[2].count;
    }

    /** Evaluate a set of 3 badge indexes; returns every distinct outcome with an order that produces it. */
    function evaluateSet(idx) {
      var bs = idx.map(function (i) { return badges[i]; });
      var first = evaluateOrdered(bs);
      if (!isOrderSensitive(first.counts)) {
        return { orderSensitive: false, outcomes: [{ line: first.line, order: idx.slice(), result: first }] };
      }
      var seen = {}, outcomes = [];
      PERMS.forEach(function (p) {
        var order = [idx[p[0]], idx[p[1]], idx[p[2]]];
        var r = evaluateOrdered(order.map(function (i) { return badges[i]; }));
        var k = r.line ? r.line.id : "-";
        if (!seen[k]) { seen[k] = true; outcomes.push({ line: r.line, order: order, result: r }); }
      });
      return { orderSensitive: true, outcomes: outcomes };
    }

    /* ---------- every 3-badge set, grouped by the line it produces ---------- */
    var combosCache = null;
    var ORDER_FLAG = 1 << 21;
    function pack(a, b, c, flag) { return a | (b << 7) | (c << 14) | (flag ? ORDER_FLAG : 0); }
    function unpack(v) { return { idx: [v & 127, (v >> 7) & 127, (v >> 14) & 127], orderSensitive: (v & ORDER_FLAG) !== 0 }; }

    function allCombos() {
      if (combosCache) return combosCache;
      var tmp = lines.map(function () { return []; });
      var none = [];
      var N = badges.length;
      for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) for (var k = j + 1; k < N; k++) {
        var r = evaluateSet([i, j, k]);
        if (!r.orderSensitive) {
          var l = r.outcomes[0].line;
          if (l) tmp[l.index].push(pack(i, j, k, false)); else none.push(pack(i, j, k, false));
        } else {
          r.outcomes.forEach(function (o) {
            if (o.line) tmp[o.line.index].push(pack(o.order[0], o.order[1], o.order[2], true));
            else none.push(pack(o.order[0], o.order[1], o.order[2], true));
          });
        }
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

    /** Per-slot needs for a target tier under contract requirements (descending). */
    function needsFor(tier, reqs) {
      var r = sortDesc(reqs && reqs.length ? reqs : [1, 1, 1]);
      while (r.length < 3) r.push(1);
      r[0] = Math.max(r[0], tier || 1);
      return sortDesc(r);
    }

    /** Fewest star-levels to add so these badges reach the needs; returns {cost, assign:[need per badge]}. */
    function upgradeCost(stars, needs) {
      var best = null;
      PERMS.forEach(function (p) {
        var cost = 0, assign = [0, 0, 0];
        for (var s = 0; s < 3; s++) {
          var need = needs[p[s]];
          assign[s] = need;
          cost += Math.max(0, need - (stars[s] || 0));
        }
        if (!best || cost < best.cost) best = { cost: cost, assign: assign };
      });
      return best;
    }

    return {
      badges: badges, badgeById: badgeById, lines: lines, lineById: lineById, titles: titles, titleByKey: titleByKey,
      polyLine: polyLine, evaluateOrdered: evaluateOrdered, evaluateSet: evaluateSet, countCategories: countCategories,
      allCombos: allCombos, unpack: unpack, meetsReqs: meetsReqs, needsFor: needsFor, upgradeCost: upgradeCost
    };
  }

  return { create: create };
});
