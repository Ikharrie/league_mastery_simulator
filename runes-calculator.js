// Pre-Reforged rune page (runes.html, V3.14-V7.21).
//
// Two client looks, keyed off body[data-client] (nav.js clientEraFor):
//   air  V3.14-V6.24  the AIR client's Runes tab: every widget sits on the
//                     painted panels of the full burnt-parchment art
//                     (css/runes-legacy.css §A).
//   lcu  V7.21        the League Client's legacy rune page: gold rune
//                     circle, 30 hex sockets, inventory + stats (§B).
// The markup is shared (runes.html .legacy-app); this file only swaps the
// slot geometry, a few classes and the tooltip skin per era.
//
// Slot order = the in-game level-unlock progression:
//   0-8 Marks, 9-17 Seals, 18-26 Glyphs, 27-29 Quintessences.
// Share hash: #<datasetId>|<30 comma-separated rune ids or _>[|<level>]
// (unchanged; old links decode to the same page).

var CATEGORY_ORDER = ["mark", "seal", "glyph", "quintessence"];
var CATEGORY_LABEL = {
    mark: "Marks",
    seal: "Seals",
    glyph: "Glyphs",
    quintessence: "Quintessences"
};

// AIR rune tooltip name colour per category. Mark red and glyph blue are
// sampled (Apr 2012 / Nov 2015 captures); seal and quint are inferred.
var CATEGORY_TT_COLOR = { mark: "#c8242c", seal: "#d8c850", glyph: "#6e9ed8", quintessence: "#a07ae8" };

// Fallback art for a rune without its own icon.
var CATEGORY_ART = {
    mark:         "images/runes/legacy_arrow_mark.png",
    seal:         "images/runes/legacy_trophy_seal.png",
    glyph:        "images/runes/legacy_shell_glyph.png",
    quintessence: "images/runes/legacy_dragon_quint.png"
};
// Hi-res (235px) client art for the Data Dragon icons it matches. Placed
// runes render at ~52px (hex) / ~102px (quint) on the AIR sheet, so the
// 64px icons would be upscaled; these stay crisp.
var HIRES_ICON = {
    "r_1_3.png":  "images/runes/legacy_arrow_mark.png",
    "r_3_3.png":  "images/runes/legacy_pot_mark.png",
    "y_1_3.png":  "images/runes/legacy_trophy_seal.png",
    "b_3_3.png":  "images/runes/legacy_shell_glyph.png",
    "bl_1_3.png": "images/runes/legacy_dragon_quint.png"
};

// AIR slot centres, in the 1024x615 logical space of the full parchment
// art (= summoners_runes_bg.jpg 1618x972 / 1.58), measured on the painted
// indents (bbox centre of each flood-filled indent, lum < 110; every hex
// within 1 logical px; quints: see below).
// Array order = fill order:
//   Marks  1, 4, 7, 11, 14, 17, 21, 24, 27 (bottom-up, L→R)
//   Seals  2, 5, 8, 12, 15, 18, 22, 25, 28 (diagonal up from marks)
//   Glyphs 3, 6, 9, 13, 16, 19, 23, 26, 29 (top-right cluster)
//   Quints 10, 20, 30 (top-left, lower-middle, middle-right)
var SLOT_LEGACY = [
    // Marks
    [ 283, 528 ], [ 337, 528 ], [ 403, 530 ],
    [ 269, 477 ], [ 325, 473 ], [ 374, 487 ],
    [ 290, 431 ], [ 362, 434 ], [ 327, 396 ],
    // Seals
    [ 294, 356 ], [ 357, 353 ], [ 320, 312 ],
    [ 370, 292 ], [ 398, 251 ], [ 449, 227 ],
    [ 500, 211 ], [ 557, 194 ], [ 582, 239 ],
    // Glyphs
    [ 617, 197 ], [ 647, 240 ], [ 676, 197 ],
    [ 716, 232 ], [ 690, 274 ], [ 751, 197 ],
    [ 794, 227 ], [ 758, 264 ], [ 777, 310 ],
    // Quintessences: where the client put them relative to the hexes (Apr
    // 2015 capture; the 27 hexes fit one offset within 1 capture px), not
    // the fan art's purple circles at [311,232] [452,404] [655,353]; the
    // placed quint's frame still covers those circles' glow.
    [ 309, 241 ], [ 448, 405 ], [ 655, 356.5 ]
];
// Under a placed quint: images/runes/rl-quint-underlay.jpg holds the art
// round each quint position (192x192 art px each, side by side) with the
// painted socket's runic ring removed, so the ring (painted off-centre in
// the fan art) does not peek out past the quint's frame. Top-left corner
// of each patch relative to the slot centre, in art px (regenerate the
// underlay image if a quint moves).
var QUINT_UNDERLAY = [ [ -96.244, -95.799 ], [ -95.875, -95.932 ], [ -95.951, -96.298 ] ];
var PARCHMENT_LOGICAL_W = 1024;
var PARCHMENT_LOGICAL_H = 615;

// LCU (V7.21) socket centres on the 670x560 rune board (the gold ring =
// images/runes-lcu/rune_circle.png drawn 1:1 at (20,40), as on the Dec 2016
// capture Fandom File:LCU_Rune_page.png). Taken from the 7.21
// client's own CSS (CommunityDragon rcp-fe-lol-runes, runes.js): .rune-position-<slotId> {left; top} for a
// 50px (small) / 105px (large) box, inside a wrapper that sits at (4,39)
// from the ring, so centre = (left + 29, top + 64) / (left + 56.5, top +
// 91.5). Slot ids 1-9 are red (marks, left arc), 10-18 yellow (seals, top),
// 19-27 blue (glyphs, right), 28-30 black (quints). Array order = slot id:
// the client places a picked rune in the first empty slot of its colour.
var LCU_BOARD_W = 670;
var LCU_BOARD_H = 560;
var LCU_SOCKETS = {
    mark:  [ [ 119, 271 ], [ 171, 292 ], [ 124, 339 ], [ 181, 349 ], [ 148, 401 ],
             [ 209, 398 ], [ 190, 453 ], [ 252, 435 ], [ 246, 490 ] ],
    seal:  [ [ 206, 119 ], [ 250, 153 ], [ 268, 88 ], [ 305, 133 ], [ 334, 79 ],
             [ 361, 133 ], [ 399, 89 ], [ 416, 153 ], [ 461, 119 ] ],
    glyph: [ [ 497, 292 ], [ 549, 271 ], [ 487, 349 ], [ 544, 339 ], [ 459, 398 ],
             [ 520, 401 ], [ 478, 453 ], [ 415, 435 ], [ 422, 489 ] ],
    quintessence: [ [ 158.5, 193.5 ], [ 508.5, 193.5 ], [ 333.5, 501.5 ] ]
};
// Socket / inventory-icon sprite frames. images/runes-lcu/rune_base_small.png
// (28 frames) and rune_base_large.png (10 frames) are the 7.21
// rune_base_small/large.png sheets (32 / 12 frames) minus the unused ones
//. Per colour and tier the client keeps
// four frames in a row: inventory icon, inventory hover, socket, socket
// hover (.rune-inventory-icon / .rune-circle-* .tier-N[.tier-hover]):
//   small  0 empty, 1-3 droppable red / blue / yellow (our empty-socket
//          hover hint), then red t1-2 4-7, red t3 8-11, blue 12-15 / 16-19,
//          yellow 20-23 / 24-27
//   large  0 empty, 1 droppable, t1-2 2-5, t3 6-9
var LCU_FRAME = {
    small: { empty: 0, avail: { mark: 1, glyph: 2, seal: 3 }, base: { mark: 4, glyph: 12, seal: 20 } },
    large: { empty: 0, avail: 1, base: 2 }
};
// Rune stat → the client's per-stat icon name (rcp-fe-lol-runes stat map,
// keyed by our runes-data.js stat keys; scaling stats get "PerLevel", two
// stats are joined with "+" in sorted order). File =
// images/runes-lcu/icons/icon_runes_<name>_<mark|seal|glyph|large>.png.
// Lethality is the client's rPhysicalLethality (→ armor_pen);
// Precision = lethality + magic pen (→ hybrid_pen).
var LCU_STAT_ICON = {
    ad: "attack_damage", adPerLevel: "scaling_attack_damage",
    ap: "ability_power", apPerLevel: "scaling_ability_power",
    as: "attack_speed", crit: "critical_chance", critDmg: "critical_damage",
    armor: "armor", armorPerLevel: "scaling_armor",
    mr: "magic_resist", mrPerLevel: "scaling_magic_resist",
    hp: "health", hpPerLevel: "scaling_health",
    mp: "mana", mpPerLevel: "scaling_mana",
    hpRegen: "health_regen", hpRegenPerLevel: "scaling_health_regen",
    mpRegen: "mana_regen", mpRegenPerLevel: "scaling_mana_regen",
    cdr: "cooldown", cdrPerLevel: "scaling_cooldown",
    energy: "energy", energyPerLevel: "scaling_energy",
    energyRegen: "energy_regen", energyRegenPerLevel: "scaling_energy_regen",
    lethality: "armor_pen", arpen: "armor_pen", mpen: "magic_pen",
    "lethality+mpen": "hybrid_pen", "arpen+mpen": "hybrid_pen",
    hpPercent: "percent_health", gold: "gold", ms: "movement_speed",
    ls: "life_steal", sv: "spellvamp", xp: "experience", timeDead: "revival"
};
// Mark of Precision (5401): Riot's text is abbreviated ("+0.7 Leth / +0.48
// M.Pen"), so the catalogue only parsed its magic pen; it is a hybrid.
var LCU_ICON_BY_ID = { "5401": "hybrid_pen" };
var LCU_ICON_SUFFIX = { mark: "mark", seal: "seal", glyph: "glyph", quintessence: "large" };
var LCU_ICON_DEFAULT = { mark: "attack_damage", seal: "armor", glyph: "magic_resist", quintessence: "attack_damage" };

// ---------- Client stat strings ---------------------------------------------
// The AIR list shows the SHORT client stat string, not the rune name
// ("+0.95 Physical Dmg", "+1.7% Attack Speed", "+1.9 Ability Power at
// level 18"); the stats panel uses the same labels ("Physical Dmg",
// "Attack Speed %", "Magic Resist at level 18"). Order = stats order:
// Apr 2015 lists Physical Dmg, Magic Resist at level 18, Armor; Nov 2015
// Ability Power, Attack Speed %, Armor (so MR sits above Armor).
var CLIENT_STAT = [
    { key: "ad",          label: "Physical Dmg" },
    { key: "ap",          label: "Ability Power" },
    { key: "as",          label: "Attack Speed",      pct: true },
    { key: "crit",        label: "Crit Chance",       pct: true },
    { key: "critDmg",     label: "Crit Damage",       pct: true },
    { key: "lethality",   label: "Lethality" },
    { key: "arpen",       label: "Armor Pen." },
    { key: "mpen",        label: "Magic Pen." },
    { key: "mr",          label: "Magic Resist" },
    { key: "armor",       label: "Armor" },
    { key: "hp",          label: "Health" },
    { key: "hpPercent",   label: "Health",            pct: true },
    { key: "hpRegen",     label: "Health Regen / 5" },
    { key: "mp",          label: "Mana" },
    { key: "mpRegen",     label: "Mana Regen / 5" },
    { key: "energy",      label: "Energy" },
    { key: "energyRegen", label: "Energy Regen / 5" },
    { key: "cdr",         label: "Cooldowns",         pct: true, minus: true, statLabel: "Cooldown Reduction" },
    { key: "ms",          label: "Movement Speed",    pct: true },
    { key: "ls",          label: "Life Steal",        pct: true },
    { key: "sv",          label: "Spell Vamp",        pct: true },
    { key: "gold",        label: "Gold / 10" },
    { key: "xp",          label: "Experience",        pct: true },
    { key: "timeDead",    label: "Time Dead",         pct: true, minus: true }
];

// Primary / Secondary (tooltip top-right). Riot's rule: each colour has a
// primary stat family at full value, everything else is secondary; quints
// are all primary. Derived here from the stat keys (the catalog carries no
// flag). Seen: Mark of Warding (MR) = Secondary, Glyph of CDR = Primary.
var PRIMARY_STATS = {
    mark:  { ad: 1, as: 1, crit: 1, critDmg: 1, arpen: 1, lethality: 1, mpen: 1 },
    seal:  { armor: 1, hp: 1, hpPercent: 1, hpRegen: 1, mpRegen: 1, energyRegen: 1, gold: 1 },
    glyph: { ap: 1, mr: 1, cdr: 1, mp: 1, energy: 1 }
};

// 2 significant digits, trailing zero kept: 15.3 → "15", 9 → "9.0",
// 0.945 → "0.95", 2.43 → "2.4". ≥100 → integer.
function fmtClient(v) {
    var a = Math.abs(v);
    if (!a) return "0";
    if (a >= 100) return String(Math.round(a));
    var p = Math.pow(10, 1 - Math.floor(Math.log(a) / Math.LN10));
    var r = Math.round(a * p + 1e-9) / p;
    return r.toFixed(r >= 10 ? 0 : (r >= 1 ? 1 : 2));
}

function runeStatParts(rune) {
    var out = [];
    for (var i = 0; i < CLIENT_STAT.length; i++) {
        var cfg = CLIENT_STAT[i];
        if (rune.base && rune.base[cfg.key]) out.push({ cfg: cfg, v: rune.base[cfg.key], scaling: false });
        if (rune.perLevel && rune.perLevel[cfg.key]) out.push({ cfg: cfg, v: rune.perLevel[cfg.key] * 18, scaling: true });
    }
    return out;
}

// "+0.95 Physical Dmg" / "+1.7% Attack Speed" / "-0.2% Cooldowns" /
// "+1.9 Ability Power at level 18"; hybrids one stat per line.
function runeShortText(rune) {
    var parts = runeStatParts(rune);
    if (!parts.length) return rune.desc || rune.name;
    return parts.map(function(p){
        return (p.cfg.minus ? "-" : "+") + fmtClient(p.v) + (p.cfg.pct ? "% " : " ") + p.cfg.label
            + (p.scaling ? " at level 18" : "");
    }).join("\n");
}

function runeIsPrimary(rune) {
    if (rune.category === "quintessence") return true;
    var set = PRIMARY_STATS[rune.category] || {};
    var parts = runeStatParts(rune);
    for (var i = 0; i < parts.length; i++) if (set[parts[i].cfg.key]) return true;
    return false;
}

// ---------- State ------------------------------------------------------------

var activeRuneDataSetId = null;
var activeRuneDataSet = null;
var runeSlots = [];           // length 30, each null or rune object
var slotMeta = [];            // length 30, { category, indexInCategory }
var championLevel = 18;
var savedSlots = [];          // last saved / loaded page (Revert target)
var openCategory = null;      // the one expanded library category (accordion)
var runeFilters = { category: "all", tiers: { 1: true, 2: true, 3: true } };
var PAGE_NAME = "Rune Page 1";
var _runeToastTimer = null;

function runeEra() {
    if (typeof clientEraFor === "function" && activeRuneDataSetId) return clientEraFor(activeRuneDataSetId);
    return (document.body && document.body.getAttribute("data-client")) || "air";
}

// AIR: the Data Dragon hex art (hi-res client art where we have it).
function runeIconSrc(rune, placed) {
    if (placed && rune.icon && HIRES_ICON[rune.icon]) return HIRES_ICON[rune.icon];
    if (rune.icon && activeRuneDataSet && activeRuneDataSet.iconBasePath)
        return activeRuneDataSet.iconBasePath + rune.icon;
    return CATEGORY_ART[rune.category];
}

// LCU: the client draws no rune art, only a per-stat glyph sprite on the
// socket frame of the rune's colour and tier (see LCU_FRAME).
function lcuStatIconName(rune) {
    if (LCU_ICON_BY_ID[rune.id]) return LCU_ICON_BY_ID[rune.id];
    var keys = [];
    var k;
    for (k in (rune.base || {})) if (rune.base[k]) keys.push(k);
    for (k in (rune.perLevel || {})) if (rune.perLevel[k]) keys.push(k + "PerLevel");
    keys.sort();
    return LCU_STAT_ICON[keys.join("+")] || LCU_ICON_DEFAULT[rune.category];
}
function lcuGlyphSrc(rune) {
    return "images/runes-lcu/icons/icon_runes_" + lcuStatIconName(rune) + "_" + LCU_ICON_SUFFIX[rune.category] + ".png";
}
// Frame of the colour + tier group: +0 inventory, +1 inventory hover,
// +2 socket, +3 socket hover; tier 3 is the next group of four.
function lcuTierFrame(rune, socket, hover) {
    var group = rune.tier === 3 ? 4 : 0;
    var base = rune.category === "quintessence" ? LCU_FRAME.large.base : LCU_FRAME.small.base[rune.category];
    return base + group + (socket ? 2 : 0) + (hover ? 1 : 0);
}
function lcuGlyph(rune, cls) {
    var $g = $("<span>").addClass(cls + " rl-lcu-glyph " + (rune.tier === 3 ? "is-t3" : "is-t12"));
    $g[0].style.backgroundImage = "url(" + lcuGlyphSrc(rune) + ")";
    return $g;
}

function categoryOfSlot(slotIndex) { return slotMeta[slotIndex].category; }

function initSlotsForDataSet(dataSet) {
    runeSlots = [];
    slotMeta = [];
    for (var i = 0; i < CATEGORY_ORDER.length; i++) {
        var cat = CATEGORY_ORDER[i];
        var count = dataSet.slots[cat] || 0;
        for (var j = 0; j < count; j++) {
            runeSlots.push(null);
            slotMeta.push({ category: cat, indexInCategory: j });
        }
    }
}

function fillSlotsFromIds(ids) {
    for (var i = 0; i < ids.length && i < runeSlots.length; i++) {
        var id = ids[i];
        if (!id || id === "_") continue;
        var rune = getRuneById(activeRuneDataSet, id);
        if (rune && rune.category === categoryOfSlot(i)) runeSlots[i] = rune;
    }
}

function placedCount(runeId) {
    var n = 0;
    for (var i = 0; i < runeSlots.length; i++) if (runeSlots[i] && runeSlots[i].id === runeId) n++;
    return n;
}

function pageSignature(slots) {
    return slots.map(function(r){ return r ? r.id : "_"; }).join(",");
}
function isDirty() { return pageSignature(runeSlots) !== pageSignature(savedSlots); }
function markSaved() { savedSlots = runeSlots.slice(); }

function switchRuneDataSet(id, opts) {
    opts = opts || {};
    var dataSet = getRuneDataSet(id);
    if (!dataSet) return false;
    activeRuneDataSetId = id;
    activeRuneDataSet = dataSet;
    initSlotsForDataSet(dataSet);
    markSaved();

    refreshRunesSeasonNav(dataSet);
    rebuildRunePatchSelect(dataSet.season, dataSet.id);
    applyEraChrome();

    if (!opts.skipUpdates) {
        renderAll();
        updateLink();
    }
    return true;
}

// Per-era bits the stylesheet cannot do alone: the board art, the LCU
// framed-dropdown class, the combiner (S3-S4 AIR only) and quint glow.
function applyEraChrome() {
    var era = runeEra();
    var ds = activeRuneDataSet;
    var $board = $("#parchment");
    if (era === "air") {
        var bg = (ds && ds.parchmentImage) || "images/runes/summoners_runes_bg.jpg";
        $board.css("background-image", "url(" + bg + ")");
    } else {
        $board.css("background-image", "");
    }
    $("#rune-category-filter").toggleClass("lcu-select", era === "lcu");
    // Rune Combiner: a 4th blue button in the S3/S4 button box (removed
    // from the client in V5.1).
    var combiner = era === "air" && ds && ds.season <= 4;
    $(".legacy-app").attr("data-rl-buttons", combiner ? "4" : "3");
    // Quint halo, from the capture nearest each dataset (the halo changed
    // between client builds):
    //   V3.14  cream   May 2013, 3.6.13 (refs sb_2013_runepage_frame.png:
    //                  pale cream fringe round the ram quints)
    //   V4.20  ember   Apr 2015, ~5.7 (fandom Summoner_profile_05: orange-
    //                  red); no 2014 capture found, this is the nearest
    //   V5.21+ silver  Nov 2015, 5.22 (crop_phreak_2015: silver-grey on
    //                  ram AND dragon quints)
    var quint = !ds ? "silver" : ds.season <= 3 ? "cream" : ds.season === 4 ? "ember" : "silver";
    $(".legacy-app").attr("data-rl-quint", quint);
    applyLcuLayout();
}

// LCU on a narrow screen: the 1271px board | inventory | stats row would
// scale to ~0.3 on a phone (or pan with the inventory off-canvas), so below
// LCU_STACK_BELOW px the page stacks board / inventory / stats in a 520px
// stage (css/runes-legacy.css §B5). The stage width is the shared scaler's
// input (nav.js LolStage reads data-stage-width on every fit).
var LCU_STACK_BELOW = 834;         // side-by-side scale would drop under 0.65
var STAGE_W_ROW = 1271, STAGE_W_STACK = 520;
function applyLcuLayout() {
    var $app = $(".legacy-app");
    var vw = document.documentElement.clientWidth || window.innerWidth || 1280;
    var layout = runeEra() === "lcu" && vw < LCU_STACK_BELOW ? "stack" : "row";
    if ($app.attr("data-rl-layout") === layout) return;
    $app.attr("data-rl-layout", layout);
    var stage = $app.closest(".lol-stage")[0];
    if (stage) {
        stage.setAttribute("data-stage-width", String(layout === "stack" ? STAGE_W_STACK : STAGE_W_ROW));
        if (window.LolStage) LolStage.fit();
    }
    updateDrawnScrolls();
}

function renderAll() {
    drawRuneSlots();
    buildCategoriesSidebar();
    recomputeStats();
    refreshPageState();
}

// ---------- Slot board -------------------------------------------------------

function slotPosition(slotIndex, era) {
    var meta = slotMeta[slotIndex];
    if (era === "lcu") {
        var list = LCU_SOCKETS[meta.category] || [];
        var p = list[meta.indexInCategory] || [LCU_BOARD_W / 2, LCU_BOARD_H / 2];
        return { left: (p[0] / LCU_BOARD_W * 100) + "%", top: (p[1] / LCU_BOARD_H * 100) + "%" };
    }
    var q = SLOT_LEGACY[slotIndex];
    return { left: (q[0] / PARCHMENT_LOGICAL_W * 100) + "%", top: (q[1] / PARCHMENT_LOGICAL_H * 100) + "%" };
}

// Empty socket: rest frame + the colour-hinted "droppable" frame on hover.
function lcuEmptyFrames(cat) {
    if (cat === "quintessence") return [LCU_FRAME.large.empty, LCU_FRAME.large.avail];
    return [LCU_FRAME.small.empty, LCU_FRAME.small.avail[cat]];
}

function drawRuneSlots() {
    var $area = $("#rune-slots");
    var era = runeEra();
    $area.empty();
    for (var i = 0; i < runeSlots.length; i++) {
        var rune = runeSlots[i];
        var cat = categoryOfSlot(i);
        var $slot = $("<div>")
            .addClass("rune-slot slot-" + cat)
            .toggleClass("filled", !!rune)
            .attr("data-slot", i)
            .css(slotPosition(i, era));
        if (era === "lcu") {
            // Sprite frame (rest / hover) for css/runes-legacy.css §B1.
            var fr = rune ? [lcuTierFrame(rune, true, false), lcuTierFrame(rune, true, true)] : lcuEmptyFrames(cat);
            $slot[0].style.setProperty("--f", fr[0]);
            $slot[0].style.setProperty("--fh", fr[1]);
        } else if (rune && cat === "quintessence" && QUINT_UNDERLAY[slotMeta[i].indexInCategory]) {
            // Ring-free art patch under the quint, before every slot so
            // placed neighbours paint over it (css §A1).
            var qi = slotMeta[i].indexInCategory, ul = QUINT_UNDERLAY[qi];
            var $ul = $("<div>").addClass("rl-quint-underlay").css(slotPosition(i, era));
            $ul[0].style.setProperty("--ul-i", qi);
            $ul[0].style.setProperty("--ul-dx", ul[0]);
            $ul[0].style.setProperty("--ul-dy", ul[1]);
            $area.prepend($ul);
        }
        if (rune && era === "lcu") {
            $slot.append(lcuGlyph(rune, "placed-rune").attr({ role: "img", "aria-label": rune.name }));
        } else if (rune) {
            var src = runeIconSrc(rune, true);
            $slot.append($("<img>").addClass("placed-rune")
                .toggleClass("is-hires", src.indexOf("/legacy_") >= 0)
                .attr({ alt: rune.name, src: src, draggable: "false" }));
        }
        $area.append($slot);
    }
}

function assignRuneToSlot(slotIndex, rune) {
    if (slotIndex < 0 || slotIndex >= runeSlots.length) return;
    if (rune && rune.category !== categoryOfSlot(slotIndex)) return;
    runeSlots[slotIndex] = rune;
    renderAll();
    updateLink();
}

function nextEmptySlotIndex(category) {
    for (var i = 0; i < runeSlots.length; i++) {
        if (slotMeta[i].category === category && runeSlots[i] === null) return i;
    }
    return -1;
}

// ---------- Library (category accordion + rune rows) ------------------------

function buildCategoriesSidebar() {
    var era = runeEra();
    var $cats = $("#runes-categories");
    var keep = $cats.scrollTop();
    $cats.empty();
    for (var c = 0; c < CATEGORY_ORDER.length; c++) {
        var cat = CATEGORY_ORDER[c];
        if (runeFilters.category !== "all" && runeFilters.category !== cat) continue;
        var open = openCategory === cat;
        var max = activeRuneDataSet.slots[cat] || 0;
        var $group = $("<div>").addClass("rl-cat cat-" + cat).toggleClass("is-open", open)
            .attr("data-category", cat);
        $group.append($("<div>").addClass("rl-cat-header")
            .attr({ role: "button", tabindex: "0", "aria-expanded": open ? "true" : "false" })
            .append($("<span>").addClass("rl-cat-label").text(CATEGORY_LABEL[cat])));
        if (open) {
            var $items = $("<div>").addClass("rl-cat-items");
            var shown = 0;
            for (var i = 0; i < activeRuneDataSet.runes.length; i++) {
                var rune = activeRuneDataSet.runes[i];
                if (rune.category !== cat || !runeFilters.tiers[rune.tier]) continue;
                var left = max - placedCount(rune.id);
                if (left <= 0) continue;          // the client lists owned-minus-placed
                shown++;
                var $row = $("<div>").addClass("rl-rune tier-" + rune.tier)
                    .attr({ "data-rune": rune.id, tabindex: "0", role: "button",
                            "aria-label": rune.name + ", " + left + " left" });
                if (era === "lcu") {
                    // The client's inventory item (rcp-fe-lol-runes): "x9",
                    // the socket-framed glyph, then name over description.
                    var $icon = $("<span>").addClass("rl-rune-icon rl-lcu-icon")
                        .toggleClass("is-large", cat === "quintessence")
                        .append(lcuGlyph(rune, "rl-rune-glyph"));
                    $icon[0].style.setProperty("--f", lcuTierFrame(rune, false, false));
                    $icon[0].style.setProperty("--fh", lcuTierFrame(rune, false, true));
                    $row.append($("<span>").addClass("rl-rune-count").text("x" + left))
                        .append($icon)
                        .append($("<span>").addClass("rl-rune-text")
                            .append($("<span>").addClass("rl-rune-name").text(rune.name))
                            .append($("<span>").addClass("rl-rune-desc").text(rune.desc || runeShortText(rune))));
                } else {
                    $row.append($("<img>").addClass("rl-rune-icon").attr({ src: runeIconSrc(rune, false), alt: "", draggable: "false" }))
                        .append($("<span>").addClass("rl-rune-text").text(runeShortText(rune)))
                        .append($("<span>").addClass("rl-rune-count").text("x" + left));
                }
                $items.append($row);
            }
            if (!shown) $items.append($("<div>").addClass("rl-rune-none").text("No runes match the tier filter."));
            $group.append($items);
        }
        $cats.append($group);
    }
    $cats.scrollTop(keep);
    updateLibraryScrollbar();
}

function toggleCategory(cat) {
    openCategory = openCategory === cat ? null : cat;
    buildCategoriesSidebar();
    if (openCategory) scrollCategoryIntoView(openCategory);
}

function openCategoryFor(cat) {
    if (runeFilters.category !== "all" && runeFilters.category !== cat) {
        runeFilters.category = "all";
        $("#rune-category-filter").val("all");
    }
    openCategory = cat;
    buildCategoriesSidebar();
    scrollCategoryIntoView(cat);
}

function scrollCategoryIntoView(cat) {
    var list = document.getElementById("runes-categories");
    var group = list && list.querySelector('.rl-cat[data-category="' + cat + '"]');
    if (!group) return;
    var top = group.offsetTop;
    if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - 40) list.scrollTop = top;
    updateLibraryScrollbar();
}

// ---------- Drawn scrollbars (library + statistics) ---------------------
// Drawn, so they look the same in every browser. Markup: a scrolling
// .rl-list / .rl-stats-list next to a .rl-scroll (buttons + track + thumb)
// in the same parent; the parent gets .has-scroll while the list overflows
// (the stats list makes room for the bar only then).
// AIR: 18px Flex scrollbar (tan track, cream arrow buttons). The library's
// is always shown (Apr 2015 capture, list fits); the stats one only while
// it scrolls. LCU: thin gold thumb, bottom fade while more is below.
// The list toggles .at-top / .at-end for those fades.

var DRAWN_SCROLLS = [];            // [{ list, bar }]

function updateDrawnScroll(s) {
    var list = s.list, bar = s.bar;
    var track = bar.querySelector(".rl-scroll-track");
    var thumb = bar.querySelector(".rl-scroll-thumb");
    var sh = list.scrollHeight, ch = list.clientHeight;
    var scrollable = sh > ch + 1 && ch > 0;
    var host = bar.parentNode;
    if ($(host).hasClass("has-scroll") !== scrollable) {
        $(host).toggleClass("has-scroll", scrollable);   // may change the list width
        sh = list.scrollHeight; ch = list.clientHeight;
        scrollable = sh > ch + 1 && ch > 0;
    }
    $(bar).toggleClass("is-scrollable", scrollable);
    $(list).toggleClass("at-top", !scrollable || list.scrollTop <= 1)
           .toggleClass("at-end", !scrollable || list.scrollTop >= sh - ch - 1);
    var th = track.clientHeight;
    if (!scrollable || !th) { thumb.style.height = ""; thumb.style.top = ""; return; }
    var h = Math.max(Math.round(th * ch / sh), Math.min(24, th));
    var top = Math.round((th - h) * list.scrollTop / (sh - ch));
    thumb.style.height = h + "px";
    thumb.style.top = top + "px";
}

function updateDrawnScrolls() {
    for (var i = 0; i < DRAWN_SCROLLS.length; i++) updateDrawnScroll(DRAWN_SCROLLS[i]);
}
// Kept for the call sites that only touch the library.
function updateLibraryScrollbar() { updateDrawnScrolls(); }

function bindDrawnScroll(list, bar, rowSelector) {
    if (!list || !bar) return;
    var s = { list: list, bar: bar };
    DRAWN_SCROLLS.push(s);
    var step = function(){ var row = list.querySelector(rowSelector); return row ? row.offsetHeight : 40; };
    $(list).on("scroll", function(){ updateDrawnScroll(s); });
    var repeat = null;
    function stopRepeat(){ if (repeat) { clearInterval(repeat.i); clearTimeout(repeat.t); repeat = null; } }
    $(bar).find(".rl-scroll-btn").on("mousedown", function(e){
        if (e.which !== 1) return;
        e.preventDefault();
        var dir = $(this).hasClass("is-up") ? -1 : 1;
        list.scrollTop += dir * step();
        stopRepeat();
        repeat = { t: setTimeout(function(){ repeat.i = setInterval(function(){ list.scrollTop += dir * step(); }, 60); }, 350) };
    });
    $(document).on("mouseup", stopRepeat);
    $(bar).find(".rl-scroll-track").on("mousedown", function(e){
        if (e.which !== 1 || $(e.target).hasClass("rl-scroll-thumb")) return;
        e.preventDefault();
        var thumb = this.querySelector(".rl-scroll-thumb").getBoundingClientRect();
        list.scrollTop += (e.clientY < thumb.top ? -1 : 1) * (list.clientHeight - step());
    });
    $(bar).find(".rl-scroll-thumb").on("mousedown", function(e){
        if (e.which !== 1) return;
        e.preventDefault();
        var startY = e.clientY, startTop = list.scrollTop;
        var track = this.parentNode;
        var sc = (window.LolStage ? LolStage.scale(list) : 1) || 1;
        var range = track.clientHeight - this.offsetHeight;
        var ratio = range > 0 ? (list.scrollHeight - list.clientHeight) / range : 0;
        $(document).on("mousemove.rlthumb", function(ev){
            list.scrollTop = startTop + (ev.clientY - startY) / sc * ratio;
        }).on("mouseup.rlthumb", function(){ $(document).off(".rlthumb"); });
    });
}

function initDrawnScrollbars() {
    bindDrawnScroll(document.getElementById("runes-categories"),
                    document.querySelector(".rl-well > .rl-scroll"), ".rl-rune, .rl-cat-header");
    bindDrawnScroll(document.getElementById("stats-list"),
                    document.querySelector(".rl-stats-view > .rl-scroll"), ".rl-stat");
    $(window).on("resize", function(){ applyLcuLayout(); updateDrawnScrolls(); })
             .on("load", updateDrawnScrolls);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateDrawnScrolls);
}

// ---------- Tooltip ---------------------------------------------------------

function runeTooltipHtml(rune, era) {
    var esc = typeof lolEscapeHtml === "function" ? lolEscapeHtml : function(s){ return String(s); };
    var kind = runeIsPrimary(rune) ? "Primary" : "Secondary";
    if (era === "lcu") {
        // The client's rune-slot tooltip: <h6> name + <p> description
        // (tooltip-small, 180-300px; css §B6).
        return '<div class="rl-tt-lcu">'
            + '<p class="tt-title">' + esc(rune.name) + '</p>'
            + '<p class="tt-body">' + esc(rune.desc || runeShortText(rune)) + '</p>'
            + '</div>';
    }
    return '<div class="rl-tt" style="--tt-title-color:' + CATEGORY_TT_COLOR[rune.category] + '">'
        + '<div class="tt-row"><span class="tt-tier">Tier: ' + rune.tier + '</span><span class="tt-kind">' + kind + '</span></div>'
        + '<div class="tt-name">' + esc(rune.name) + '</div>'
        + '<div class="tt-desc">' + esc(rune.desc || runeShortText(rune)) + '</div>'
        + '</div>';
}

function showRuneTip(e, rune, el) {
    if (!window.LolTooltip || !rune) return;
    var era = runeEra();
    if (era === "lcu") LolTooltip.show(el, runeTooltipHtml(rune, era), "lcu", { position: "top", className: "rl-tt-lcu-box" });
    // rl-tt-air: the tip at the sheet's 1.1x client scale (css A7).
    else LolTooltip.show(e && e.type !== "focusin" && e.type !== "focus" ? (e.originalEvent || e) : el,
                         runeTooltipHtml(rune, era), "air-rune", { className: "rl-tt-air" });
}

function hideRuneTip() { if (window.LolTooltip) LolTooltip.hide(); }

function runeForRow(el) { return getRuneById(activeRuneDataSet, $(el).attr("data-rune")); }
function runeForSlot(el) { return runeSlots[+$(el).attr("data-slot")] || null; }

// ---------- Stats -------------------------------------------------------------

function computeTotals(level) {
    var base = {}, scaling = {};
    for (var i = 0; i < runeSlots.length; i++) {
        var r = runeSlots[i];
        if (!r) continue;
        if (r.base) for (var k in r.base) base[k] = (base[k] || 0) + r.base[k];
        if (r.perLevel) for (var k2 in r.perLevel) scaling[k2] = (scaling[k2] || 0) + r.perLevel[k2] * level;
    }
    return { base: base, scaling: scaling };
}

// The client lists flat and scaling totals separately ("Magic Resist" /
// "Magic Resist at level 18"); an empty page shows an empty panel.
function recomputeStats() {
    var t = computeTotals(championLevel);
    var $list = $("#stats-list");
    var keep = $list.scrollTop();
    $list.empty();
    for (var i = 0; i < CLIENT_STAT.length; i++) {
        var cfg = CLIENT_STAT[i];
        var rows = [[t.base[cfg.key], false], [t.scaling[cfg.key], true]];
        for (var j = 0; j < rows.length; j++) {
            var v = rows[j][0];
            if (!v) continue;
            // "Cooldown Reduction %" never breaks inside (no lone "%"); the
            // " at level N" qualifier is its own span (AIR: same line, as
            // the client; LCU: a sub-line, css §B4).
            var $name = $("<div>").addClass("rl-stat-name")
                .append($("<span>").addClass("rl-stat-label").text((cfg.statLabel || cfg.label) + (cfg.pct ? " %" : "")));
            if (rows[j][1]) $name.append(document.createTextNode(" "))
                .append($("<span>").addClass("rl-stat-at").text("at level " + championLevel));
            $list.append($("<div>").addClass("rl-stat").toggleClass("is-scaling", rows[j][1])
                .append($name)
                .append($("<div>").addClass("rl-stat-value").text("+ " + fmtClient(v) + (cfg.pct ? "%" : ""))));
        }
    }
    $list.scrollTop(keep);
    updateDrawnScrolls();
}

// ---------- Page name, dirty marker, button states ---------------------------

// AIR: X lit while the page has runes, revert + save while unsaved (Apr
// 2015 capture). LCU (Dec 2016 capture, empty page): SAVE is lit, the
// clear-all ring is the uikit disabled grey (#5b5a56), so clear-all is lit
// while the page has runes and SAVE always (SAVE = Share).
function refreshPageState() {
    var any = runeSlots.some(function(s){ return s !== null; });
    var dirty = isDirty();
    $("#rune-page-name").text((dirty ? "*" : "") + PAGE_NAME);
    $("#action-clear, #lcu-action-clear").prop("disabled", !any);
    $("#action-revert").prop("disabled", !dirty);
    $("#action-save").prop("disabled", !dirty);
    $("#lcu-action-save").prop("disabled", false);
}

// ---------- Hash / share ---------------------------------------------------

function encodeHash() {
    var parts = [];
    for (var i = 0; i < runeSlots.length; i++) {
        parts.push(runeSlots[i] ? runeSlots[i].id : "_");
    }
    var hash = activeRuneDataSetId + "|" + parts.join(",");
    if (championLevel !== 18) hash += "|" + championLevel;
    return hash;
}

function parseRuneHash(raw) {
    if (!raw) return { id: DEFAULT_RUNE_DATA_SET_ID, slotIds: [], level: 18 };
    var parts = raw.split("|");
    if (parts.length === 1) return { id: DEFAULT_RUNE_DATA_SET_ID, slotIds: parts[0].split(","), level: 18 };
    var level = parseInt(parts[2], 10);
    if (!(level >= 1 && level <= 18)) level = 18;
    return { id: parts[0], slotIds: (parts[1] || "").split(","), level: level };
}

function updateLink() {
    var hash = "";
    var hasAny = runeSlots.some(function(s){ return s !== null; });
    if (hasAny || activeRuneDataSetId !== DEFAULT_RUNE_DATA_SET_ID || championLevel !== 18) {
        hash = "#" + encodeHash();
    }
    $("#exportLink").attr("href", document.location.pathname + hash);
    if (document.location.hash !== hash) {
        document.location.replace(hash || "#");
        $(window).unbind("hashchange");
        setTimeout(function(){ $(window).bind("hashchange", updateFromHash); }, 500);
    }
}

function updateFromHash() {
    var parsed = parseRuneHash(document.location.hash.slice(1));
    if (parsed.id !== activeRuneDataSetId) {
        if (!switchRuneDataSet(parsed.id, { skipUpdates: true })) {
            switchRuneDataSet(DEFAULT_RUNE_DATA_SET_ID, { skipUpdates: true });
        }
    } else {
        initSlotsForDataSet(activeRuneDataSet);
    }
    fillSlotsFromIds(parsed.slotIds);
    markSaved();
    setChampionLevel(parsed.level);
    renderAll();
}

function setChampionLevel(level) {
    championLevel = level;
    $("#champ-level").val(level);
    $("#champ-level-value").text(level);
    var el = document.getElementById("champ-level");
    if (el) el.style.setProperty("--rl-level", ((level - 1) / 17 * 100) + "%");
}

// ---------- Season / Patch dropdowns --------------------------------------

function rebuildRunePatchSelect(season, selectedId) {
    var $patch = $("#patch-select").empty();
    for (var i = 0; i < runeDataSets.length; i++) {
        var ds = runeDataSets[i];
        if (ds.season !== season) continue;
        $patch.append($("<option>").attr("value", ds.id).text(ds.patchLabel));
    }
    if (selectedId) $patch.val(selectedId);
}

// Season dropdown + tabs come from the shared season-led nav (nav.js); the
// patch dropdown stays page-local and lists this season's snapshots.
function refreshRunesSeasonNav(dataSet) {
    if (typeof setClientEra === "function") setClientEra(clientEraFor(dataSet.id));
    if (typeof buildSeasonNav !== "function") return;
    buildSeasonNav({
        page: "runes",
        seasonSelect: "#season-select",
        currentKey: "s" + dataSet.season,
        onSeason: function(def){
            for (var i = 0; i < runeDataSets.length; i++) {
                if ("s" + runeDataSets[i].season === def.key) {
                    switchRuneDataSet(runeDataSets[i].id);
                    return true;
                }
            }
            return false;
        }
    });
}

function buildRuneSelectors() {
    var active = getRuneDataSet(activeRuneDataSetId) || getRuneDataSet(DEFAULT_RUNE_DATA_SET_ID);
    refreshRunesSeasonNav(active);
    rebuildRunePatchSelect(active.season, active.id);
    $("#patch-select").on("change", function(){
        switchRuneDataSet($(this).val());
    });
}

// ---------- Clipboard / toast ----------------------------------------------

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject){
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); }
        catch (e) { reject(e); }
        finally { document.body.removeChild(ta); }
    });
}

function showToast(msg) {
    if (window.LolToast) return LolToast.show(msg);
    var $t = $("#toast").text(msg).addClass("visible");
    if (_runeToastTimer) clearTimeout(_runeToastTimer);
    _runeToastTimer = setTimeout(function(){ $t.removeClass("visible"); }, 1800);
}

function shareCurrentPage(okMsg) {
    var href = $("#exportLink").attr("href") || document.location.pathname + document.location.hash;
    var url = new URL(href, document.location.href).toString();
    return copyToClipboard(url).then(
        function(){ showToast(okMsg || "URL copied to clipboard"); },
        function(){ showToast("Copy failed — here it is: " + url); }
    );
}

// ---------- Init -----------------------------------------------------------

$(function(){
    var parsed = parseRuneHash(document.location.hash.slice(1));
    var initial = getRuneDataSet(parsed.id) || getRuneDataSet(DEFAULT_RUNE_DATA_SET_ID);
    activeRuneDataSetId = initial.id;
    activeRuneDataSet = initial;
    initSlotsForDataSet(initial);
    fillSlotsFromIds(parsed.slotIds);
    markSaved();
    setChampionLevel(parsed.level);

    buildRuneSelectors();
    applyEraChrome();
    initDrawnScrollbars();
    renderAll();
    updateLink();

    // Board: click a placed rune to remove it; an empty socket opens its
    // category in the library.
    $("#rune-slots")
        .on("click", ".rune-slot", function(){
            var idx = +$(this).attr("data-slot");
            if (runeSlots[idx] !== null) {
                hideRuneTip();
                assignRuneToSlot(idx, null);
            } else {
                openCategoryFor(categoryOfSlot(idx));
            }
        })
        .on("mouseenter", ".rune-slot.filled", function(e){ showRuneTip(e, runeForSlot(this), this); })
        .on("mousemove", ".rune-slot.filled", function(e){ if (window.LolTooltip) LolTooltip.move(e.originalEvent || e); })
        .on("mouseleave", ".rune-slot", hideRuneTip);

    // Library: header = accordion toggle; row = place in the next free slot.
    function placeFromRow(row) {
        var rune = runeForRow(row);
        if (!rune) return;
        var nextIdx = nextEmptySlotIndex(rune.category);
        if (nextIdx < 0) { showToast("All " + CATEGORY_LABEL[rune.category].toLowerCase() + " slots are full"); return; }
        hideRuneTip();
        assignRuneToSlot(nextIdx, rune);
    }
    $("#runes-categories")
        .on("click", ".rl-cat-header", function(){ hideRuneTip(); toggleCategory($(this).closest(".rl-cat").attr("data-category")); })
        .on("click", ".rl-rune", function(){ placeFromRow(this); })
        .on("keydown", ".rl-cat-header, .rl-rune", function(e){
            if (e.which !== 13 && e.which !== 32) return;
            e.preventDefault();
            if ($(this).hasClass("rl-rune")) placeFromRow(this);
            else toggleCategory($(this).closest(".rl-cat").attr("data-category"));
        })
        .on("mouseenter", ".rl-rune", function(e){ showRuneTip(e, runeForRow(this), this); })
        .on("mousemove", ".rl-rune", function(e){ if (window.LolTooltip) LolTooltip.move(e.originalEvent || e); })
        .on("mouseleave", ".rl-rune", hideRuneTip)
        .on("focusin", ".rl-rune", function(e){ showRuneTip(e, runeForRow(this), this); })
        .on("focusout", ".rl-rune", hideRuneTip)
        .on("scroll", hideRuneTip);

    // Filters: Runes Type dropdown + tier checkboxes.
    $("#rune-category-filter").on("change", function(){
        runeFilters.category = $(this).val();
        if (runeFilters.category !== "all") openCategory = runeFilters.category;
        buildCategoriesSidebar();
    });
    $(".rl-tiers input[type='checkbox']").on("change", function(){
        runeFilters.tiers[parseInt($(this).val(), 10)] = this.checked;
        buildCategoriesSidebar();
    });

    // Champion level scrubber — scaling runes recompute at the new level.
    $("#champ-level").on("input change", function(){
        var level = parseInt($(this).val(), 10);
        if (!(level >= 1 && level <= 18)) level = 18;
        setChampionLevel(level);
        recomputeStats();
        updateLink();
    });

    // Buttons. Clear empties the page; Revert restores the last saved /
    // loaded page; Save = Share (copy link) and clears the "*" marker.
    function clearPage() {
        initSlotsForDataSet(activeRuneDataSet);
        renderAll();
        updateLink();
    }
    function savePage() {
        if (!isDirty() && runeEra() !== "lcu") return;
        markSaved();
        refreshPageState();
        shareCurrentPage("Rune page saved — link copied to clipboard");
    }
    $("#action-clear, #lcu-action-clear").on("click", clearPage);
    $("#action-save, #lcu-action-save").on("click", savePage);
    $("#action-revert").on("click", function(){
        runeSlots = savedSlots.slice();
        renderAll();
        updateLink();
    });
    $("#action-combine").on("click", function(){
        showToast("The Rune Combiner is not simulated");
    });

    $("#share").click(function(){ shareCurrentPage(); });

    $(window).bind("hashchange", updateFromHash);
});
