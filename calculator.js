// calculator.js — the Masteries page (index.html): the classic 30-point
// Offense / Defense / Utility trees (Season 1 - Season 5) and the page
// controller for both mastery systems (keystone-calculator.js draws the
// Ferocity / Cunning / Resolve trees, V5.22 - V7.21).
//
// Datasets: one generated file per listed patch (data/masteries/m-*.js),
// found through the patch registry (patch-registry.js) and loaded by LolData
// (lol-data.js). The dataset a link opens is preloaded synchronously in
// <head> (lolPreloadDataset), so the first draw needs no wait; every other
// dataset loads on demand when the Patch / Season dropdown or the hash
// changes (DESIGN §2.4-§2.5). activeDataSet = registry entry + payload.
//
// Share links (DESIGN §4): "#<id>|<code>[|<page name>]"
//   canonical  id m-V<patch>. Classic code: the bit-packing below over the
//              dataset's arrays, which are in GRID order (tree, then index).
//              Keystone code: keystone-calculator.js exportKeystones.
//   legacy     s1-final … s7-final and the plain "#<code>" (= s3-pbe). The
//              registry alias names a legacy codec (data/masteries/legacy-
//              codecs.js) that turns the old code into mastery keys; the
//              build is then imported into the canonical dataset by key (the
//              carry rules of §4.5) and the hash rewritten to the canonical
//              link. Unlisted patches (m-V4.7 …) open the listed patch in
//              effect, whose data is the same.
//   id alone   "#m-V4.5", "#s4-final" (no "|"): that patch, empty. Only a
//              hash without "|" that is no id is a plain code.
// Patch / season switch: the build carries over by key (§4.5); a different
// tree family (a rework) starts empty. A toast says what did not carry.

var treeNames = [
    "offense",
    "defense",
    "utility",
];
var treeOffsets = [0, 0, 0];
var MAX_POINTS = 30;
var state = [{}, {}, {}];
var totalPoints = 0;
var data = [[], [], []];       // the active classic dataset's trees
var activeDataSet = null;      // registry entry + payload (LolData.get)
var activeDataSetId = null;
var activeIconBase = "";
var activeLook = null;
var buttonClasses = ["unavailable", "available", "full"];
var MASTERY_PAGE = "masteries";

// ---------- In-client (AIR) tree geometry ---------------------------------
// Native client px (measured on the captures)
// times k = 1.1 (the AIR sheet's --air-k), rounded to whole CSS px so the
// 1px frame lines stay crisp. A cell's frame line sits at
//   (treePitch*t + col0 + colPitch*c,  row0 + rowPitch*r)   native px
// and its outer box (the dark outer line) starts 1px before that.
//   client  S2-S5, the 2012-2015 client (lossless nerfplz-s3-doublelift.png).
//           Art images/classic/trees-client.jpg = the client's own panels
//           (825x478 native: 279-wide panels at a 273 pitch, their frames
//           overlap; the icon grid runs at a 275 pitch). Frame 48 native
//           line-to-line -> 55x55 outer; counter 26x13 -> 29x14, right edge
//           1px inside the line, 4px below the frame; connector 11 -> 12
//           wide, from the parent's counter to the child's frame.
//   s1      Season 1, the 2010 client (Riot's wb-riot-2010-masteries.jpg),
//           for every S1 patch from the V1.0.0.32 launch on (the launch-era
//           Offense tree with Demolisher uses the same grid).
//           Art images/classic/trees-2010.jpg: 270x516 panels at a 275
//           pitch. Frame 50 native -> 57x57 outer; counter 28x16 -> 31x18,
//           2px inside the line, 7px below; silver connector 10 -> 11.
// css/masteries-classic.css draws the matching sizes per
// #calculator[data-look] (the dataset's `look`).
var CLASSIC_LOOKS = {
    client: {
        k: 1.1, width: 908, height: 526,
        treePitch: 275, col0: 22, colPitch: 61, row0: 16, rowPitch: 71,
        labelX: [29, 328, 628],                 // "OFFENSE: 21" left edge (CSS px)
        conn: { dx: 22, top: 58 }               // from the parent's outer box (CSS px)
    },
    s1: {
        k: 1.1, width: 902, height: 568,
        treePitch: 275, col0: 16, colPitch: 63, row0: 10, rowPitch: 79,
        labelX: [24, 327, 629],
        conn: { dx: 23, top: 65 }
    }
};

// Tooltip title colour per tree: offense red, defense blue, utility green.
// The captures keep the "Rank:" line at full brightness, so their darker
// titles are the real colour [4.20 "Dangerous Game" peak #6d3332 (luma
// ~68), Dec 2012 "Artificer" #566756 (~98), Nov 2012 "Tenacious" #6c7f9d].
var TREE_TITLE_COLORS = ["#a2281c", "#3b83c7", "#3f7e33"];

function isKeystoneDataSet(ds) {
    return !!ds && ds.system === "keystone";
}

// Recompute the classic globals for a dataset (every classic switch).
function syncDataSetGlobals(dataSet) {
    data = dataSet.data;
    MAX_POINTS = dataSet.maxPoints || 30;
    treeOffsets = [
        0,
        data[0].length,
        data[0].length + data[1].length
    ];
    state = [{}, {}, {}];
    totalPoints = 0;
    activeIconBase = dataSet.iconBase || "";
    activeLook = CLASSIC_LOOKS[dataSet.look] || CLASSIC_LOOKS.client;
}

// Icon art: <iconBase><icon>.png, locked art <iconBase>gray_<icon>.png. A
// mastery whose art lives in another build's folder carries its own
// `iconBase` (DDragon icons are per cell id: the V3.14 launch art, the V5.10
// utility swap); the rest use the dataset's.
function masteryIconUrl(mastery, gray) {
    if (!mastery.icon) return "";
    var rel = (mastery.iconBase || activeIconBase) + (gray ? "gray_" : "") + mastery.icon + ".png";
    // Absolute: the URL travels in a custom property (--ms-art), and a
    // relative url() there would resolve against css/, not the page.
    try { return new URL(rel, document.baseURI).href; } catch (e) { return rel; }
}

function drawCalculator() {
    var look = activeLook || CLASSIC_LOOKS.client;
    $("#calculator")
        .attr("data-look", (activeDataSet && activeDataSet.look) || "client")
        .attr("data-dataset", activeDataSetId || "")
        .css({ width: look.width + "px", height: look.height + "px" });

    for (var tree = 0; tree < 3; tree++)
        for (var index = 0; index < data[tree].length; index++)
            drawButton(tree, index);

    // "OFFENSE: 21" inside each tree panel (bottom-left).
    for (var t = 0; t < 3; t++) {
        $("#calculator").append(
            $("<div>")
                .addClass("tree-label")
                .attr("data-tree", t)
                .css({ left: look.labelX[t] + "px" })
                .append($("<span>").addClass("tree-label-name").text(treeNames[t].toUpperCase() + ":"))
                .append($("<span>").addClass("tree-label-gap").text(" "))
                .append($("<span>").addClass("tree-label-count").text("0"))
        );
    }

    $("#calculator").off("contextmenu.calc").on("contextmenu.calc", function(event){ event.preventDefault(); });

    // Warm the cache with both art states so a state flip never flashes.
    for (var pt = 0; pt < 3; pt++)
        for (var pi = 0; pi < data[pt].length; pi++) {
            (new Image()).src = masteryIconUrl(data[pt][pi], false);
            (new Image()).src = masteryIconUrl(data[pt][pi], true);
        }
}

function drawButton(tree, index) {
    var look = activeLook || CLASSIC_LOOKS.client;
    var mastery = data[tree][index];
    var buttonPos = masteryButtonPosition(tree, index);
    var status = mastery.index < 5 ? "available" : "unavailable";
    var rank = 0;

    // Requirement connector: from the parent's rank counter down to this
    // mastery's frame (may span two rows in S1-S3).
    var parent = mastery.parent;
    var parentLink = null;
    if (parent != undefined) {
        var parentPos = masteryButtonPosition(tree, parent);
        var top = parentPos.y + look.conn.top;
        // Two-row connectors (S2/S3) carry their own full-length gold art.
        var span = masteryTier(tree, index) - masteryTier(tree, parent);
        $("#calculator").append(parentLink =
            $("<div>")
                .addClass("requirement")
                .addClass(span > 1 ? "span" + span : "")
                .addClass(status)
                .css({
                    left: (parentPos.x + look.conn.dx) + "px",
                    top: top + "px",
                    height: Math.max(0, buttonPos.y - top) + "px",
                })
        );
    }

    var $btn = $("<div>")
        .addClass("button")
        .addClass(status)
        .data("parentLink", parentLink)
        .attr("data-tree", tree)
        .attr("data-index", index)
        .attr("data-key", mastery.key || "")
        .css({
            left: buttonPos.x + "px",
            top: buttonPos.y + "px",
        })
        .append(
            $("<span>")
                .addClass("ms-art")
                .attr("style", "--ms-art:url(\"" + masteryIconUrl(mastery, false) + "\");" +
                               "--ms-art-gray:url(\"" + masteryIconUrl(mastery, true) + "\")")
        )
        .append(
            $("<span>")
                .addClass("counter")
                .text("0/" + mastery.ranks)
        );

    var showTip = function(event){
        if (!window.LolTooltip) return;
        LolTooltip.show(event || $btn, masteryTooltipHtml(tree, index, rank), "air-mastery",
                        { className: "ms-classic-tt" });
    };
    $btn
        .mouseenter(function(event){
            $(this).data("hover", true);
            showTip(event.originalEvent || event);
        })
        .mousemove(function(event){
            if (window.LolTooltip) LolTooltip.move(event.originalEvent || event);
        })
        .mouseleave(function(){
            $(this).data("hover", false);
            if (window.LolTooltip) LolTooltip.hide();
        })
        .mousedown(function(event){
            switch (event.which) {
                case 1:
                    // Left click
                    if (isValidState(tree, index, rank, +1)) {
                        setState(tree, index, rank, +1);
                    }
                    break;
                case 3:
                    // Right click
                    if (isValidState(tree, index, rank, -1)) {
                        setState(tree, index, rank, -1);
                    }
                    break;
            }
        })
        .data("update", function() {
            rank = state[tree][index] || 0;
            if (rank == mastery.ranks) {
                status = "full";
            } else {
                // check if available
                if (masteryPointReq(tree, index) <= treePoints(tree) && masteryParentReq(tree, index))
                    status = "available";
                else
                    status = "unavailable";

                // check if points spent
                if (totalPoints >= MAX_POINTS)
                    if (rank > 0)
                        status = "available";
                    else
                        status = "unavailable";
            }
            // State classes drive frame, art (colour / gray_), counter and
            // connector looks in css/masteries-classic.css. Instant, no
            // transition (the AIR client never animated these).
            if ( !$(this).hasClass(status) )
                $(this).removeClass(buttonClasses.join(" ")).addClass(status);
            $(this).find(".counter").text(rank + "/" + mastery.ranks);

            var parentLink = $(this).data("parentLink");
            if (parentLink != null && !parentLink.hasClass(status))
                parentLink.removeClass(buttonClasses.join(" ")).addClass(status);

            // live tooltip refresh (rank / requirement lines)
            if ($(this).data("hover") && window.LolTooltip && LolTooltip.isVisible()) {
                var el = LolTooltip.element();
                var content = el && el.querySelector(".lol-tt-content");
                if (content) content.innerHTML = masteryTooltipHtml(tree, index, rank);
            }
        });

    // Mouse wheel: up adds a point, down removes one (the client's own help
    // box: "...or using the mouse wheel").
    $btn[0].addEventListener("wheel", function(event){
        var mod = event.deltaY < 0 ? +1 : (event.deltaY > 0 ? -1 : 0);
        if (!mod) return;
        event.preventDefault();
        if (isValidState(tree, index, rank, mod)) setState(tree, index, rank, mod);
    }, { passive: false });

    $("#calculator").append($btn);
}

function masteryEsc(s) {
    return typeof lolEscapeHtml === "function" ? lolEscapeHtml(s) : String(s);
}

function masteryTooltipHtml(tree, index, rank) {
    var mastery = data[tree][index];
    var showNext = !(rank < 1 || rank >= mastery.ranks);
    var req = masteryTooltipReq(tree, index);
    var html = '<div class="tt-title" style="--tt-title-color:' + TREE_TITLE_COLORS[tree] + '">' + masteryEsc(mastery.name) + '</div>' +
        '<div class="tt-rank">Rank: ' + rank + '/' + mastery.ranks + '</div>';
    if (req) html += '<div class="tt-req">' + masteryEsc(req).replace(/\n/g, "<br>") + '</div>';
    html += '<div class="tt-body">' + masteryTooltipBody(mastery, rank) + '</div>';
    if (showNext)
        html += '<div class="tt-next"><div class="tt-rank">Next rank:</div>' + masteryTooltipBody(mastery, rank + 1) + '</div>';
    return html;
}

function masteryTooltipBody(mastery, rank)  {
    // Rank 1 is index 0, but Rank 0 is also index 0
    rank = Math.max(0, rank - 1);
    // Data Dragon era (V3.14 - V5.21): the client's own per-rank strings.
    if (mastery.rankDesc && mastery.rankDesc[rank] != null)
        return masteryEsc(mastery.rankDesc[rank]).replace(/\n/g, "<br>");
    // Wiki era (S1 - S3): a template with "#" per value list and |names|.
    var desc = String(mastery.desc || "");
    var info = mastery.rankInfo || [];
    desc = desc.replace(/#/, info[rank]);
    desc = desc.replace(/\n/g, "<br>");
    desc = desc.replace(/\|(.+?)\|/g, "<span class='tt-value'>$1</span>");
    if (mastery.perlevel) {
        desc = desc.replace(/#/, Math.round(info[rank]*180)/10);
    }
    if (mastery.rankInfo2) {
        desc = desc.replace(/#/, mastery.rankInfo2[rank]);
    }
    return desc;
}

function masteryTooltipReq(tree, index) {
    var missing = [];
    var pointReq = masteryPointReq(tree, index)
    if (pointReq > treePoints(tree))
        missing.push("Requires " + pointReq + " points in " + treeNames[tree][0].toUpperCase() + treeNames[tree].slice(1));
    if (!masteryParentReq(tree, index)) {
        var parent = data[tree][index].parent;
        missing.push("Requires " + data[tree][parent].ranks + " points in " + data[tree][parent].name);
    }

    return missing.join("\n");
}

// Outer-box position of a mastery cell, from its 1-based grid `index`
// (row = floor((index-1)/4), column = (index-1)%4): the frame line sits at
// the native grid point x k, rounded; the outer box starts 1px before it.
function masteryButtonPosition(tree, index) {
    var look = activeLook || CLASSIC_LOOKS.client;
    var idx = data[tree][index].index - 1;
    var ix = idx % 4;
    var iy = Math.floor(idx / 4);
    return {
        x: Math.round(look.k * (look.treePitch * tree + look.col0 + look.colPitch * ix)) - 1,
        y: Math.round(look.k * (look.row0 + look.rowPitch * iy)) - 1
    };
}

function masteryTier(tree, index) {
    return Math.floor((data[tree][index].index-1) / 4);
}

function masteryPointReq(tree, index) {
    return masteryTier(tree, index) * 4;
}

function masteryParentReq(tree, index) {
    var parent = data[tree][index].parent;
    // parent is an array index: 0 is a real parent (S4/S5 Block -> Unyielding)
    if (parent != null && (state[tree][parent] || 0) < data[tree][parent].ranks)
        return false;
    return true;
}

function treePoints(tree, tier) {
    var points = 0;
    for (var i in state[tree])
        if (!tier || tier > masteryTier(tree, i))
            points += state[tree][i];
    return points;
}

function isValidState(tree, index, rank, mod) {
    var mastery = data[tree][index];
    if (rank+mod < 0 || rank+mod > mastery.ranks)
        return false;

    // Incrementing
    if (mod > 0) {
        // Check max points
        if (totalPoints + mod > MAX_POINTS)
            return false;

        // Check this mastery's rank requirements: never account for current rank
        if (masteryPointReq(tree, index) > treePoints(tree) - rank)
            return false;

        // Check this mastery's parent requirements
        if (!masteryParentReq(tree, index))
            return false;
    }

    // Decrementing
    if (mod < 0) {
        // Check tree rank requirements
        for (var i in state[tree])
            if (i != index)
                // Figure out tier, multiply by 4 to get req points
                if (state[tree][i] > 0 &&
                    // Calculate points in this tree up to this tier, and
                    // subtract one if we're removing from this portion
                    masteryPointReq(tree, i) > treePoints(tree, masteryTier(tree, i)) - (masteryTier(tree, index) < masteryTier(tree, i)))
                    return false;

        // Check child requirements
        for (var i in state[tree])
            if (i != index)
                if (state[tree][i] > 0 && data[tree][i].parent == index)
                    return false;
    }

    return true;
}

function setState(tree, index, rank, mod) {
    state[tree][index] = rank + mod;
    totalPoints += mod;

    updateButtons();
    updateLabels();
    updateLink();
}

// If quiet flag is true, does not call updates
function resetStates(quiet) {
    // The keystone system keeps its own state — delegate.
    if (isKeystoneDataSet(activeDataSet)) {
        if (typeof resetKeystones === "function") resetKeystones();
        return;
    }

    for (var tree=0; tree<3; tree++)
        resetTree(tree);

    if (quiet != true) {
        updateButtons();
        updateLabels();
        updateLink();
    }
}

// Used in both resetStates and via panel
function resetTree(tree, update) {
    totalPoints -= treePoints(tree);
    for (var index in state[tree])
        state[tree][index] = 0;
}

function updateButtons() {
    $("#calculator .button").each(function(){
        $(this).data("update").call(this, 0);
    });
}

function updateLabels() {
    for (var tree=0; tree<3; tree++)
        $("#calculator .tree-label[data-tree="+tree+"] .tree-label-count").text(treePoints(tree));
    updateMasterySidebar();
}

// ---------- AIR mastery sidebar (air-sheet.js AirMasterySidebar) -----------
// One sidebar for classic S1-S5 and keystone AIR (V5.22 - V6.24); hidden in
// the LCU era by CSS. syncMasterySidebar() after every dataset switch (it
// resets the saved baseline), updateMasterySidebar() after every change.

function masterySidebarConfig(dataSet) {
    if (isKeystoneDataSet(dataSet)) {
        // Ferocity / Cunning / Resolve reuse the 2010-2015 emblems (red
        // swords, blue star-shield) plus the book in violet (Oct 2015 PBE).
        var emblem = { ferocity: "ferocity", cunning: "cunning", resolve: "resolve" };
        return {
            trees: dataSet.data.trees.map(function(t){ return { name: t.name, emblem: emblem[t.id] || t.id }; }),
            maxPoints: dataSet.maxPoints,
            getCode: function(){ return typeof exportKeystones === "function" ? exportKeystones() : ""; },
            onReturn: function(){ resetStates(); },
            onRevert: function(code){
                if (typeof importKeystones !== "function") return;
                importKeystones(code);
                updateKeystoneLink();
            },
            onTreeReset: function(i){
                var tree = dataSet.data.trees[i];
                if (tree && typeof resetKeystoneTree === "function") resetKeystoneTree(tree.id);
            }
        };
    }
    return {
        trees: treeNames.map(function(n){ return { name: n.charAt(0).toUpperCase() + n.slice(1), emblem: n }; }),
        maxPoints: dataSet ? dataSet.maxPoints : MAX_POINTS,
        getCode: function(){ return exportMasteries(); },
        onReturn: function(){ resetStates(); },
        onRevert: function(code){ importMasteries(code); },
        onTreeReset: function(i){
            resetTree(i, true);
            updateButtons();
            updateLabels();
            updateLink();
        }
    };
}

// A renamed page (pencil, LCU edit, "+", Delete, Revert) rewrites the hash
// so Share / Save links carry the name. The sidebar repaints its name text
// on every change; act only when the name itself changed.
function watchPageNameForLink() {
    var sb = window.AirMasterySidebar, aside = sb && sb.element();
    if (!aside || !window.MutationObserver || aside._nameLinkObserved) return;
    aside._nameLinkObserved = true;
    var last = sb.pageName();
    new MutationObserver(function(){
        var n = sb.pageName();
        if (n === last) return;
        last = n;
        var ds = activeDataSet;
        if (!ds) return;
        if (isKeystoneDataSet(ds)) {
            if (typeof updateKeystoneLink === "function" && typeof keystoneActiveDataSetId !== "undefined"
                    && keystoneActiveDataSetId === ds.id) updateKeystoneLink();
        } else {
            updateLink();
        }
    }).observe(aside, { subtree: true, childList: true, characterData: true });
}

function syncMasterySidebar(dataSet) {
    if (!window.AirMasterySidebar) return;
    AirMasterySidebar.render(masterySidebarConfig(dataSet));
    updateMasterySidebar();
    AirMasterySidebar.markSaved();
}

function updateMasterySidebar() {
    if (!window.AirMasterySidebar) return;
    if (isKeystoneDataSet(activeDataSet)) {
        if (typeof keystoneActiveDataSet === "undefined" || !keystoneActiveDataSet) return;
        AirMasterySidebar.update({
            points: keystoneActiveDataSet.data.trees.map(function(t){ return keystoneTreePoints(t.id); }),
            available: keystoneActiveDataSet.maxPoints - getKeystoneTotalPoints()
        });
    } else {
        AirMasterySidebar.update({
            points: [treePoints(0), treePoints(1), treePoints(2)],
            available: MAX_POINTS - totalPoints
        });
    }
}

// Optional last hash segment: the page name (AIR sidebar / LCU info bar),
// URI-encoded; left out for the default "Mastery Page 1", so links without
// a custom name are exactly what they were.
function pageNameHashSegment() {
    var sb = window.AirMasterySidebar;
    var name = sb ? sb.pageName() : "";
    return (!name || name === sb.DEFAULT_NAME) ? "" : "|" + encodeURIComponent(name);
}

// Write our own hash without re-importing it (one pending re-bind at a time,
// so quick changes never stack several hashchange handlers).
var hashRebindTimer = null;
var masteryShownHash = null;   // the hash of what the page shows (last written)
function normMasteryHash(h) { return "#" + String(h || "").replace(/^#/, ""); }
function replaceHashQuietly(hash) {
    $("#exportLink").attr("href", document.location.pathname + hash);
    masteryShownHash = normMasteryHash(hash);
    if (document.location.hash == hash) return;
    // Using replace() causes no change in browser history
    $(window).unbind('hashchange');
    document.location.replace(hash);
    clearTimeout(hashRebindTimer);
    hashRebindTimer = setTimeout(function(){
        $(window).unbind('hashchange').bind('hashchange', updateMasteries);
    }, 500);
}

function masteryPageDefaultId() {
    var e = window.LolPatches ? LolPatches.pageDefault(MASTERY_PAGE) : null;
    return e ? e.id : null;
}

function updateLink() {
    var code = exportMasteries();
    var name = pageNameHashSegment();
    // Hash format: "<dataset-id>|<mastery-code>[|<page-name>]".
    var hash;
    if (code.length <= 3 && !name) {
        // For empty/near-empty trees, still surface the data set so a fresh
        // page load lands on the same season/patch the user picked.
        hash = (activeDataSetId === masteryPageDefaultId()) ? '' : activeDataSetId + '|';
    } else {
        hash = activeDataSetId + '|' + (code.length <= 3 ? '' : code) + name;
    }
    replaceHashQuietly('#' + hash);
}

// ---------- Classic share code -----------------------------------------------
// There are max 4 points per mastery, or 3 bits each. There is a 1 bit padding
// that is a flag to determine whether the following 5 bits are a sequence of
// mastery codes or an index increase. We greedily take masteries until the next
// one would put us over capacity, at which point we flush the buffer. You will
// always flush at the end of a tree.
//
// The codec runs on a SPEC: per tree, the code fields in order, each
// {key, ranks, hashRanks?, hashNote?}. Canonical links use the dataset's own
// arrays (grid order). Legacy links use their legacy codec's field order.
// Field widths are fixed per field (floor(ranks/2)+1 bits). A legacy field
// may keep `hashRanks` = the count its old links were written with (S1
// Preservation 3, S4/S5 Inspiration 1): plain codes use that width, values
// are clamped to the real ranks (hashNote tells why), and a "~" prefix means
// "current widths" (old links whose build the legacy widths could not hold).
// Canonical datasets have no hashRanks, so new links never need "~".
var maxbits = 5;
var exportChars = "WvlgUCsA7pGZ3zSjakbP2x0mTB6htH8JuKMq1yrnwEQDLY5IVNXdcioe9fF4OR_-";
var CODE_CURRENT_PREFIX = "~";

// Because we used a random string, we need to reverse it
var importChars = {}
for (var i=0; i<exportChars.length; i++) {
    importChars[exportChars[i]] = i;
}

function codeBitlen(spec, tree, index, current) {
    var m = spec[tree] && spec[tree][index];
    if (m == undefined)
        return 0;
    var ranks = (!current && m.hashRanks != null) ? m.hashRanks : m.ranks;
    return Math.floor(ranks/2)+1;
}

// returns how many of the next fields can fit in size bits
function codeBitfit(spec, tree, index, bits, current) {
    var start = index;
    while (true) {
        var len = codeBitlen(spec, tree, index, current);
        if (len > bits || len == 0)
            return index - start;
        bits -= len;
        index++;
    }
}

// ranks[tree][field] -> code (no "~" handling)
function encodeClassicCode(spec, ranks, current) {
    var str = "";
    var bits = 0;
    var collected = 0; // number of bits collected in this substr
    var tree, jumpStart = -1; // jumpStart is the start of the index, which we can turn to a bool by comparing >-1
    var st = function(t, i) { return (ranks[t] && ranks[t][i]) || 0; };
    var flush = function() {
        str += exportChars[(jumpStart>-1) << maxbits | bits];
        bits = 0;
        collected = 0;
        jumpStart = -1;
    }
    for (tree = 0; tree < 3; tree++) {
        var len = (spec[tree] || []).length;
        for (var index = 0; index < len; index++) {
            var space = codeBitfit(spec, tree, index, maxbits - collected, current);

            // check if we should flush
            if (space < 1) {
                flush();
                space = codeBitfit(spec, tree, index, maxbits, current);
            }

            // if we are collecting or the condition is right for collecting:
            // - if we are jumping and this is 0, SKIP.
            if (jumpStart > -1 && !(st(tree, index) > 0))
                continue;
            // otherwise:
            // - either we were collecting already (and haven't flushed)
            // - or we can collect any within the next subset that would fit in
            //   this bit.
            if (collected > 0 ||
                [0,1,2,3,4]
                    .filter(function(a){ return a < space; })
                    .map(function(a){ return st(tree, index+a); })
                    .some(function(a){ return a > 0; })){
                // check if we are at the end of a jump
                if (jumpStart > -1) {
                    bits = index - jumpStart;
                    flush();
                }

                // collect more
                var l = codeBitlen(spec, tree, index, current);
                bits = (bits << l) | st(tree, index);
                collected += l;
            } else if(jumpStart < 0) {
                // this is the start of a jump
                // check for flush
                if (collected > 0)
                    flush();
                jumpStart = index;
            }
        }
        // before switching trees, flush unless we just did
        if (jumpStart > -1) {
            bits = index - jumpStart;
            flush();
        } else if (collected > 0) {
            flush();
        }
    }

    return str;
}

// Legacy widths when every rank fits them, else "~" + a code in the current
// widths (only legacy specs have hashRanks).
function classicCodeFor(spec, ranks) {
    for (var t = 0; t < spec.length; t++)
        for (var i = 0; i < spec[t].length; i++) {
            var m = spec[t][i];
            if (m.hashRanks == null) continue;
            var bits = Math.floor(m.hashRanks/2)+1;
            if (((ranks[t] && ranks[t][i]) || 0) > (1 << bits) - 1)
                return CODE_CURRENT_PREFIX + encodeClassicCode(spec, ranks, true);
        }
    return encodeClassicCode(spec, ranks, false);
}

// code -> { ranks: [[rank per field]] x3, notes: [hashNote…] }. Values are
// clamped to the field's ranks; bad input stops the decode.
function decodeClassicCode(spec, str) {
    str = String(str || "");
    var current = str.charAt(0) === CODE_CURRENT_PREFIX;
    if (current) str = str.slice(1);
    var ranks = spec.map(function(t){ return t.map(function(){ return 0; }); });
    var notes = [];
    var tree = 0;
    var index = 0;
    for (var i=0; i<str.length && tree < spec.length; i++) {
        var cur = importChars[str[i]];
        // check for bad input
        if (cur == undefined)
            break;
        // if the first bit is a 0, we know it's not a jump
        if ((cur & 0x20) == 0) {
            // extract data
            var num = codeBitfit(spec, tree, index, maxbits, current); // how many we can fit
            var sizes = [0, 1, 2, 3, 4] // an array of each field held in this char
                            .filter(function(a){ return a < num; })
                            .map(function(a){ return codeBitlen(spec, tree, index+a, current); });
            for (var j=0; j<sizes.length; j++, index++) {
                // shift amount is the sum of all elements to the right of this one
                var shift = sizes.slice(j + 1).reduce(function(a, b){ return a + b; }, 0);
                // shift off the bits we don't want and AND it with a bit mask
                var value = (cur >> shift) & ((1 << sizes[j]) - 1);
                // clamp: a legacy field can be wider than the fixed ranks
                var m = spec[tree][index];
                if (value > m.ranks && m.hashNote && notes.indexOf(m.hashNote) < 0)
                    notes.push(m.hashNote);
                ranks[tree][index] = Math.min(value, m.ranks);
            }
        } else {
            // jump
            index += cur & 0x1f;
        }

        // increment when we're done with a tree
        if (index >= spec[tree].length) {
            tree++;
            index = 0;
        }
    }
    return { ranks: ranks, notes: notes };
}

// [{key: rank}] x3 <-> ranks per field of a spec
function classicMapsFromRanks(spec, ranks) {
    return spec.map(function(tree, t){
        var o = {};
        tree.forEach(function(m, i){ if (ranks[t] && ranks[t][i] > 0) o[m.key] = (o[m.key] || 0) + ranks[t][i]; });
        return o;
    });
}

function classicRanksFromState() {
    return data.map(function(tree, t){
        return tree.map(function(m, i){ return state[t][i] || 0; });
    });
}

function exportMasteries() {
    return classicCodeFor(data, classicRanksFromState());
}

// The current classic build by key ([{key: rank}] x3).
function captureClassicMaps() {
    return classicMapsFromRanks(data, classicRanksFromState());
}

function classicMapsTotal(maps) {
    var n = 0;
    (maps || []).forEach(function(o){ for (var k in o) n += o[k] || 0; });
    return n;
}

// Carry-over into the active classic dataset (DESIGN §4.5): map by key
// within the same tree, clamp to the new ranks, then accept bottom-up, tier
// by tier (tree, then grid order inside a tier): a mastery keeps its points
// only if its tier requirement (4 x tier points in that tree from accepted
// lower tiers) and its parent are met, while budget remains (partial ranks
// allowed). Sets state / totalPoints; -> { total, kept, missing: [keys] }.
function carryClassicInto(maps) {
    var total = classicMapsTotal(maps);
    var cells = [];
    data.forEach(function(tree, t){
        tree.forEach(function(m, i){ cells.push({ t: t, i: i, m: m, tier: Math.floor((m.index - 1) / 4) }); });
    });
    cells.sort(function(a, b){ return a.tier - b.tier || a.t - b.t || a.i - b.i; });
    var accepted = [{}, {}, {}];
    var budget = MAX_POINTS;
    cells.forEach(function(c){
        var want = Math.min(((maps[c.t] || {})[c.m.key]) || 0, c.m.ranks);
        if (!want) return;
        var lower = 0;
        data[c.t].forEach(function(m, i){
            if (Math.floor((m.index - 1) / 4) < c.tier) lower += accepted[c.t][i] || 0;
        });
        if (lower < 4 * c.tier) return;
        if (c.m.parent != null) {
            var p = data[c.t][c.m.parent];
            if (!p || (accepted[c.t][c.m.parent] || 0) < p.ranks) return;
        }
        var take = Math.min(want, budget);
        if (take > 0) { accepted[c.t][c.i] = take; budget -= take; }
    });
    state = accepted;
    totalPoints = MAX_POINTS - budget;
    var missing = [];
    (maps || []).forEach(function(o, t){
        var have = {};
        (data[t] || []).forEach(function(m){ have[m.key] = true; });
        for (var k in o) if (o[k] > 0 && !have[k]) missing.push({ tree: t, key: k, points: o[k] });
    });
    return { total: total, kept: totalPoints, missing: missing };
}

// Sidebar Revert: a canonical code of the active dataset.
function importMasteries(str) {
    var dec = decodeClassicCode(data, str);
    carryClassicInto(classicMapsFromRanks(data, dec.ranks));
    updateButtons();
    updateLabels();
    updateLink();
}

// A link's build: canonical (codec null) or legacy. -> carry info + notes.
function importClassicLink(code, codec) {
    var spec = codec ? codec.trees : data;
    var dec = decodeClassicCode(spec, code);
    var maps = classicMapsFromRanks(spec, dec.ranks);
    var info = carryClassicInto(maps);
    info.notes = dec.notes;
    // A legacy field the canonical tree no longer has, with its reason
    // (s1-final Demolisher: "Demolisher was removed in V1.0.0.63").
    info.dropNotes = [];
    info.explained = 0;
    if (codec) info.missing.forEach(function(x){
        var f = null;
        (codec.trees[x.tree] || []).forEach(function(m){ if (m.key === x.key && m.dropNote) f = m; });
        if (f) {
            if (info.dropNotes.indexOf(f.dropNote) < 0) info.dropNotes.push(f.dropNote);
            info.explained += x.points;
        }
    });
    updateButtons();
    updateLabels();
    return info;
}

// ---------- Hash ---------------------------------------------------------------

function parseHash(raw) {
    // Hash format: "<dataset-id>|<mastery-code>[|<page-name>]" (current) or
    // just "<mastery-code>" (legacy plain code). Neither code alphabet
    // contains "|"; the name is URI-encoded. A hash without "|" can also be
    // a dataset id alone (index.html#m-V4.5): LolPatches.fromHash tells
    // (r.bare), and openMasteryLink then ignores the code read here.
    raw = String(raw || "");
    if (!raw) return { id: null, code: "", name: null, empty: true };
    var pipe = raw.indexOf('|');
    if (pipe < 0) return { id: null, code: raw, name: null, plain: true };
    var rest = raw.slice(pipe + 1), name = null;
    var pipe2 = rest.indexOf('|');
    if (pipe2 >= 0) {
        try { name = decodeURIComponent(rest.slice(pipe2 + 1)); }
        catch (e) { name = rest.slice(pipe2 + 1); }
        rest = rest.slice(0, pipe2);
    }
    return { id: raw.slice(0, pipe), code: rest, name: name };
}

// ---------- Datasets, switching, carry-over ------------------------------------

var masteryLoadToken = 0;
var masteryLoadingTimer = null;

// Run fn(dataset, codec) once the entry's dataset (and the alias's legacy
// codec, if any) are registered: synchronously when they already are (the
// preloaded first view), else after LolData loads them.
function withMasteryData(entry, alias, fn, fail) {
    var codecKey = alias && alias.codec ? alias.codec : null;
    var ds = LolData.get(entry);
    var codec = codecKey ? LolData.getCodec(codecKey) : null;
    if (ds && (!codecKey || codec)) { fn(ds, codec); return; }
    Promise.all([LolData.load(entry), codecKey ? LolData.loadCodec(alias) : null])
        .then(function(r){ fn(r[0], r[1]); }, function(err){ if (fail) fail(err); });
}

function masteryLoading(on) {
    clearTimeout(masteryLoadingTimer);
    if (on) masteryLoadingTimer = setTimeout(function(){ $("body").addClass("ms-loading"); }, 150);
    else $("body").removeClass("ms-loading");
}

// Show a dataset with an empty build: client era, AIR sheet period, the
// matching calculator, sidebar, season nav and Patch dropdown.
function showDataSet(ds) {
    if (window.LolTooltip) LolTooltip.hide();
    activeDataSet = ds;
    activeDataSetId = ds.id;
    if (typeof setClientEra === "function") setClientEra(ds.era || "air");
    if (window.AirSheet) AirSheet.sync(ds);
    if (isKeystoneDataSet(ds)) {
        // The keystone system (V5.22 onwards) has its own render path in
        // keystone-calculator.js; CSS keys off body.keystone-system.
        $("body").addClass("keystone-system");
        if (typeof drawKeystoneCalculator === "function") drawKeystoneCalculator(ds);
    } else {
        $("body").removeClass("keystone-system");
        syncDataSetGlobals(ds);
        redrawCalculator();
        updateButtons();
    }
    syncMasterySidebar(ds);
    refreshMasteriesSeasonNav(ds);
    rebuildPatchSelect(ds);
}

// Tear down and redraw the classic calculator.
function redrawCalculator() {
    if (window.LolTooltip) LolTooltip.hide();
    $("#calculator").empty();
    drawCalculator();
}

// The current build by key, for a carry-over.
function captureMasteryBuild() {
    var ds = activeDataSet;
    if (!ds) return null;
    if (isKeystoneDataSet(ds)) {
        var k = typeof captureKeystoneMaps === "function" ? captureKeystoneMaps() : null;
        return k ? { ds: ds, keystone: true, trees: k.trees, ks: k.keystone, total: k.total } : null;
    }
    var maps = captureClassicMaps();
    return { ds: ds, keystone: false, maps: maps, total: classicMapsTotal(maps) };
}

function masteryPoints(n) { return n + " point" + (n === 1 ? "" : "s"); }

// Write the link of the active build (canonical id and code).
function writeMasteryLink() {
    if (isKeystoneDataSet(activeDataSet)) { if (typeof updateKeystoneLink === "function") updateKeystoneLink(); }
    else updateLink();
}

function markMasteryPageSaved() {
    if (window.AirMasterySidebar) AirMasterySidebar.markSaved();
}

// A carry-over keeps points only inside one tree family (DESIGN §1.7, §4.5).
function masterySameFamily(from, ds) {
    return from.ds.family === ds.family && !!from.keystone === isKeystoneDataSet(ds);
}

// The patch that introduced the later of two tree families: the earliest
// listed patch of an unbroken run of that family ending at `later`.
// cb(patch) — loads the in-between datasets it needs (small local files;
// synchronous when they are in already).
function masteryReworkPatch(a, b, cb) {
    var later = LolPatches.compare(a.patch, b.patch) >= 0 ? a : b;
    var earlier = later === a ? b : a;
    var list = LolPatches.entries(MASTERY_PAGE);
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === later.id) idx = i;
    var start = later.patch;
    var step = function(j){
        var e = list[j];
        if (!e || LolPatches.compare(e.patch, earlier.patch) <= 0) { cb(start); return; }
        var next = function(ds){
            if (ds.family !== later.family || ds.system !== later.system) { cb(start); return; }
            start = e.patch;
            step(j - 1);
        };
        var have = LolData.get(e);
        if (have) next(have);
        else LolData.load(e).then(next, function(){ cb(start); });
    };
    if (idx < 0) cb(start); else step(idx - 1);
}

// Apply a captured build of the same family to the (freshly shown) active
// dataset; toast what did not carry over.
function applyMasteryCarry(from) {
    var to = activeDataSet;
    if (!from || !to || !from.total) return;
    var info = from.keystone ? keystoneCarryInto(from.trees, from.ks) : carryClassicInto(from.maps);
    if (from.keystone) drawKeystoneCalculator();
    else { updateButtons(); updateLabels(); }
    var lost = info.total - info.kept;
    if (lost > 0 && window.LolToast)
        LolToast.show(masteryPoints(lost) + " could not carry over to " + to.patch, { duration: 5000 });
}

// Patch / Season dropdown: switch in-page, carrying the build over. A switch
// into another tree family starts empty and says which patch reworked the
// trees (found before the switch is shown, so view, link and toast change
// together).
function switchMasteryPatch(entry) {
    if (!entry) return false;
    if (activeDataSet && entry.id === activeDataSet.id) { rebuildPatchSelect(activeDataSet); return true; }
    var from = captureMasteryBuild();
    var token = ++masteryLoadToken;
    masteryLoading(true);
    withMasteryData(entry, null, function(ds){
        if (token !== masteryLoadToken) return;
        var reset = !!(from && from.total) && !masterySameFamily(from, ds);
        var finish = function(reworkPatch){
            if (token !== masteryLoadToken) return;
            masteryLoading(false);
            showDataSet(ds);
            if (reset) {
                if (window.LolToast) LolToast.show("Masteries were reworked in " + reworkPatch + ": page reset", { duration: 5000 });
            } else applyMasteryCarry(from);
            writeMasteryLink();
            markMasteryPageSaved();
            prefetchMasterySeason(ds);
        };
        if (reset) masteryReworkPatch(from.ds, ds, finish); else finish(null);
    }, function(){
        if (token !== masteryLoadToken) return;
        masteryLoading(false);
        if (activeDataSet) { refreshMasteriesSeasonNav(activeDataSet); rebuildPatchSelect(activeDataSet); }
        if (window.LolToast) LolToast.show("Could not load " + entry.patch + " data");
    });
    return true;
}

function prefetchMasterySeason(ds) {
    if (window.LolData && LolData.prefetch) LolData.prefetch(LolPatches.list(MASTERY_PAGE, ds.season));
}

// Open what a hash names (first load, hashchange, Back / Forward): its
// dataset, its build (legacy codes through their codec) and its page name;
// then rewrite the hash to the canonical link and mark the page saved.
function openMasteryLink(raw, isBoot) {
    var r = LolPatches.fromHash(MASTERY_PAGE, "#" + String(raw || ""));
    var parsed = parseHash(raw);
    if (!r.entry) return;
    var token = ++masteryLoadToken;
    if (!isBoot) masteryLoading(true);
    withMasteryData(r.entry, r.alias, function(ds, codec){
        if (token !== masteryLoadToken) return;
        masteryLoading(false);
        if (!activeDataSet || activeDataSet.id !== ds.id) showDataSet(ds);
        else { refreshMasteriesSeasonNav(ds); rebuildPatchSelect(ds); }   // the dropdowns may show a cancelled switch
        // The link names the page (default name when it carries none); set
        // it before the import so the rewritten hash keeps it.
        if (window.AirMasterySidebar)
            AirMasterySidebar.pageName(parsed.name || AirMasterySidebar.DEFAULT_NAME);
        // An unknown id opens the page default without its build; an id
        // alone (no "|", r.bare) has none.
        var code = (r.unknown || r.bare) ? "" : parsed.code;
        var info;
        if (isKeystoneDataSet(ds)) info = typeof importKeystones === "function" ? importKeystones(code, codec) : null;
        else info = importClassicLink(code, codec);
        writeMasteryLink();
        // A loaded build is a saved page: no "*", Save / Revert greyed.
        markMasteryPageSaved();
        masteryImportToast(info, ds);
        prefetchMasterySeason(ds);
    }, function(){
        if (token !== masteryLoadToken) return;
        masteryLoading(false);
        if (window.LolToast) LolToast.show("Could not load " + r.entry.patch + " data");
        // First load: fall back to the page default.
        var def = LolPatches.pageDefault(MASTERY_PAGE);
        if (!activeDataSet && def && def.id !== r.entry.id)
            withMasteryData(def, null, function(ds){ showDataSet(ds); writeMasteryLink(); markMasteryPageSaved(); });
    });
}

// e.g. an old S1 link with Perseverance 2-3 in the Defense slot that is
// Preservation (1 rank) now: the tree total drops, so say why; a legacy
// Demolisher point (removed in V1.0.0.63) says so too.
function masteryImportToast(info, ds) {
    if (!info || !window.LolToast) return;
    var parts = [];
    (info.notes || []).forEach(function(n){ parts.push(n); });
    (info.dropNotes || []).forEach(function(n){ parts.push(/[.!?]$/.test(n) ? n : n + "."); });
    var lost = info.total - info.kept - (info.explained || 0);
    if (lost > 0)
        parts.push(((info.dropNotes || []).length ? lost + " more point" + (lost === 1 ? "" : "s") : masteryPoints(lost))
            + " could not carry over to " + ds.patch + ".");
    if (parts.length) LolToast.show(parts.join(" "), { duration: 5000 });
}

// hashchange (an edited URL, Back / Forward). A hash that names what the
// page already shows needs nothing: that is the page's own location.replace
// arriving late (file:// commits it a task later; a loaded machine can push
// it past the re-bind), and it must not cancel a Patch switch in flight.
function updateMasteries() {
    if (activeDataSet && normMasteryHash(document.location.hash) === masteryShownHash) return;
    openMasteryLink(document.location.hash.slice(1), false);
}

// Patch dropdown: this season's listed patches, oldest first (registry
// labels), the active one selected.
function rebuildPatchSelect(ds) {
    if (!ds || !$("#patch-select").length) return;
    LolPatches.fillPatchSelect($("#patch-select")[0], MASTERY_PAGE, ds.season, ds.id);
}

// Season dropdown + tabs come from the shared season-led nav (nav.js); the
// Season dropdown stays in-page on the season's default patch.
function refreshMasteriesSeasonNav(ds) {
    if (typeof buildSeasonNav !== "function") return;
    buildSeasonNav({
        page: MASTERY_PAGE,
        seasonSelect: "#season-select",
        entry: ds,
        onSeason: function(def){
            var e = LolPatches.seasonDefault(MASTERY_PAGE, def.key);
            return e ? switchMasteryPatch(e) : false;
        }
    });
}

$(function(){
    // Panel: the AIR sidebar (emblems + counts, Points Available, Save /
    // Return / Delete / Revert, double-click an emblem to reset its tree).
    watchPageNameForLink();

    $("#patch-select").on("change", function(){
        var e = LolPatches.entry(MASTERY_PAGE, $(this).val());
        if (e) switchMasteryPatch(e);
    });

    $("#share").click(function(){
        var href = $("#exportLink").attr("href") || (document.location.pathname + document.location.hash);
        var url = new URL(href, document.location.href).toString();
        copyToClipboard(url).then(function(){
            showToast("URL copied to clipboard");
        }, function(){
            showToast("Copy failed — here it is: " + url);
        });
    });

    // The dataset the hash names (preloaded: drawn synchronously).
    openMasteryLink(document.location.hash.slice(1), true);

    // Listen for hash changes
    $(window).bind('hashchange', updateMasteries);
});

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    // Fallback for non-secure contexts (e.g. plain http on local server)
    return new Promise(function(resolve, reject){
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
            var ok = document.execCommand("copy");
            ok ? resolve() : reject(new Error("execCommand returned false"));
        } catch (e) {
            reject(e);
        } finally {
            document.body.removeChild(ta);
        }
    });
}

var _toastTimer = null;
function showToast(msg) {
    if (window.LolToast) return LolToast.show(msg);
    var $t = $("#toast").text(msg).addClass("visible");
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function(){ $t.removeClass("visible"); }, 1800);
}
