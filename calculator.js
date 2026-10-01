var treeNames = [
    "offense",
    "defense",
    "utility",
];
var treeOffsets = [0, 0, 0];
var MAX_POINTS = 30;
var state = [{}, {}, {}];
var totalPoints = 0;
var activeDataSetId = null;
var activeIconBase = "";
var activeLook = null;
var buttonClasses = ["unavailable", "available", "full"];
var rankClasses = ["num-unavailable", "num-available", "num-full"];

// ---------- In-client (AIR) tree geometry ---------------------------------
// Native client px (measured on the captures, scratchpad specs/classic.md)
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
//   s1      Season 1, the 2010 client (Riot's wb-riot-2010-masteries.jpg).
//           Art images/classic/trees-2010.jpg: 270x516 panels at a 275
//           pitch. Frame 50 native -> 57x57 outer; counter 28x16 -> 31x18,
//           2px inside the line, 7px below; silver connector 10 -> 11.
// css/masteries-classic.css draws the matching sizes per
// #calculator[data-look].
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

// Recompute globals that depend on the active data set. Call this whenever
// `data` is reassigned (i.e. when the season/patch dropdown changes).
function syncDataSetGlobals(dataSet) {
    data = dataSet.data;
    MAX_POINTS = dataSet.maxPoints;
    treeOffsets = [
        0,
        data[0].length,
        data[0].length + data[1].length
    ];
    state = [{}, {}, {}];
    totalPoints = 0;
    activeDataSetId = dataSet.id;
    activeIconBase = dataSet.iconBase || "";
    activeLook = CLASSIC_LOOKS[dataSet.look] || CLASSIC_LOOKS.client;
}

function masteryIconUrl(mastery, gray) {
    if (!mastery.icon) return "";
    var rel = activeIconBase + (gray ? "gray_" : "") + mastery.icon + ".png";
    // Absolute: the URL travels in a custom property (--ms-art), and a
    // relative url() there would resolve against css/, not the page.
    try { return new URL(rel, document.baseURI).href; } catch (e) { return rel; }
}

function drawCalculator() {
    var look = activeLook || CLASSIC_LOOKS.client;
    var ds = getDataSet(activeDataSetId);
    $("#calculator")
        .attr("data-look", (ds && ds.look) || "client")
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

    $("#points>.count").text(MAX_POINTS);
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
        $("#calculator").append(parentLink =
            $("<div>")
                .addClass("requirement")
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

function masteryTooltipHtml(tree, index, rank) {
    var mastery = data[tree][index];
    var showNext = !(rank < 1 || rank >= mastery.ranks);
    var esc = typeof lolEscapeHtml === "function" ? lolEscapeHtml : function(s){ return String(s); };
    var req = masteryTooltipReq(tree, index);
    var html = '<div class="tt-title" style="--tt-title-color:' + TREE_TITLE_COLORS[tree] + '">' + esc(mastery.name) + '</div>' +
        '<div class="tt-rank">Rank: ' + rank + '/' + mastery.ranks + '</div>';
    if (req) html += '<div class="tt-req">' + esc(req).replace(/\n/g, "<br>") + '</div>';
    html += '<div class="tt-body">' + masteryTooltipBody(mastery, rank) + '</div>';
    if (showNext)
        html += '<div class="tt-next"><div class="tt-rank">Next rank:</div>' + masteryTooltipBody(mastery, rank + 1) + '</div>';
    return html;
}

function masteryTooltipBody(mastery, rank)  {
    // Rank 1 is index 0, but Rank 0 is also index 0
    rank = Math.max(0, rank - 1);
    var desc = mastery.desc;
    desc = desc.replace(/#/, mastery.rankInfo[rank]);
    desc = desc.replace(/\n/g, "<br>");
    desc = desc.replace(/\|(.+?)\|/g, "<span class='tt-value'>$1</span>");
    if (mastery.perlevel) {
        desc = desc.replace(/#/, Math.round(mastery.rankInfo[rank]*180)/10);
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
    var ds = getDataSet(activeDataSetId);
    if (ds && ds.system === "keystone") {
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
    $("#points>.count").text(MAX_POINTS - totalPoints);
    updateMasterySidebar();
}

// ---------- AIR mastery sidebar (air-sheet.js AirMasterySidebar) -----------
// One sidebar for classic S1-S5 and keystone AIR (V5.22 / V6.22); hidden in
// the LCU era by CSS. syncMasterySidebar() after every dataset switch (it
// resets the saved baseline), updateMasterySidebar() after every change.

function masterySidebarConfig(dataSet) {
    if (dataSet && dataSet.system === "keystone") {
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

function syncMasterySidebar(dataSet) {
    if (!window.AirMasterySidebar) return;
    AirMasterySidebar.render(masterySidebarConfig(dataSet));
    updateMasterySidebar();
    AirMasterySidebar.markSaved();
}

function updateMasterySidebar() {
    if (!window.AirMasterySidebar) return;
    var ds = getDataSet(activeDataSetId);
    if (ds && ds.system === "keystone") {
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

function updateLink() {
    var code = exportMasteries();
    // Hash format: "<dataset-id>|<mastery-code>". Old format (no pipe) is
    // still accepted on import and treated as the default data set.
    var hash;
    if (code.length <= 3) {
        // For empty/near-empty trees, still surface the data set so a fresh
        // page load lands on the same season/patch the user picked.
        hash = (activeDataSetId === DEFAULT_DATA_SET_ID) ? '' : activeDataSetId + '|';
    } else {
        hash = activeDataSetId + '|' + code;
    }
    hash = '#' + hash;

    // Update link and url only if we have to
    $("#exportLink").attr("href", document.location.pathname + hash);
    if (document.location.hash != hash) {
        // Using replace() causes no change in browser history
        document.location.replace(hash);
        // Temporarily unbind change
        $(window).unbind('hashchange');
        setTimeout(function(){
            $(window).bind('hashchange', updateMasteries);
        }, 500);
    }
}

// There are max 4 points per mastery, or 3 bits each. There is a 1 bit padding
// that is a flag to determine whether the following 5 bits are a sequence of
// mastery codes or an index increase. We greedily take masteries until the next
// one would put us over capacity, at which point we flush the buffer. You will
// always flush at the end of a tree.
var maxbits = 5;
var exportChars = "WvlgUCsA7pGZ3zSjakbP2x0mTB6htH8JuKMq1yrnwEQDLY5IVNXdcioe9fF4OR_-";
//
// Field widths are fixed per mastery (floor(ranks/2)+1 bits, array order),
// so a data fix that changes a rank count would shift every later field of
// old links. Such entries keep `hashRanks` = the count the old links were
// written with (S1 Preservation 3, S4/S5 Inspiration 1): plain codes always
// use it, so links made before the fix decode to the same build (values are
// clamped to the real ranks). A build the old widths cannot hold
// (Inspiration 2/2) is written as "~" + a code in the current widths.
var CODE_CURRENT_PREFIX = "~";
var codecCurrent = false;
var bitlen = function(tree, index) {
    var m = data[tree][index];
    if (m == undefined)
        return 0;
    var ranks = (!codecCurrent && m.hashRanks != null) ? m.hashRanks : m.ranks;
    return Math.floor(ranks/2)+1;
}
// True when every rank fits the legacy (hashRanks) field widths.
function legacyCodeFits() {
    for (var t = 0; t < 3; t++)
        for (var i = 0; i < data[t].length; i++) {
            var m = data[t][i];
            if (m.hashRanks == null) continue;
            var bits = Math.floor(m.hashRanks/2)+1;
            if ((state[t][i] || 0) > (1 << bits) - 1) return false;
        }
    return true;
}
// returns how many of the next masteries can fit in size bits
var bitfit = function(tree, index, bits) {
    var start = index;
    while (true) {
        var len = bitlen(tree, index);
        if (len > bits || len == 0)
            return index - start;
        bits -= len;
        index++;
    }
}
function exportMasteries() {
    codecCurrent = false;
    if (legacyCodeFits()) return encodeMasteries();
    codecCurrent = true;
    try { return CODE_CURRENT_PREFIX + encodeMasteries(); }
    finally { codecCurrent = false; }
}
function encodeMasteries() {
    var str = "";
    var bits = 0;
    var collected = 0; // number of bits collected in this substr
    var tree, jumpStart = -1; // jumpStart is the start of the index, which we can turn to a bool by comparing >-1
    var flush = function() {
        str += exportChars[(jumpStart>-1) << maxbits | bits];
        bits = 0;
        collected = 0;
        jumpStart = -1;
    }
    for (tree = 0; tree < 3; tree++) {
        for (var index = 0; index < data[tree].length; index++) {
            var space = bitfit(tree, index, maxbits - collected);

            // check if we should flush
            if (space < 1) {
                flush();
                space = bitfit(tree, index, maxbits);
            }

            // if we are collecting or the condition is right for collecting:
            // - if we are jumping and this is 0, SKIP. 
            if (jumpStart > -1 && !(state[tree][index] > 0))
                continue;
            // otherwise:
            // - either we were collecting already (and haven't flushed)
            // - or we can collect any within the next subset that would fit in
            //   this bit. we do this with some cool filter/map/reduce
            if (collected > 0 || 
                [0,1,2,3,4]
                    .filter(function(a){ return a < space; })
                    .map(function(a){ return state[tree][index+a] || 0; })
                    .some(function(a){ return a > 0; })){
                // check if we are at the end of a jump
                if (jumpStart > -1) {
                    bits = index - jumpStart;
                    flush();
                }
                    
                // collect more
                var len = bitlen(tree, index);
                bits = (bits << len) | (state[tree][index] || 0);
                collected += len;
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

// Because we used a random string, we need to reverse it
var importChars = {}
for (var i=0; i<exportChars.length; i++) {
    importChars[exportChars[i]] = i;
}
// Notes (mastery.hashNote) of legacy fields that held more points than the
// corrected mastery has; filled by decodeMasteries, shown once per import.
var decodeNotes = [];
function importMasteries(str) {
    resetStates(true);
    str = String(str || "");
    codecCurrent = str.charAt(0) === CODE_CURRENT_PREFIX;
    if (codecCurrent) str = str.slice(1);
    decodeNotes = [];
    try { decodeMasteries(str); }
    finally { codecCurrent = false; }

    updateButtons();
    updateLabels();
    updateLink();

    // e.g. an old S1 link with Perseverance 2-3 in the Defense slot that is
    // Preservation (1 rank) now: the tree total drops, so say why.
    if (decodeNotes.length && window.LolToast)
        LolToast.show(decodeNotes.join(" "), { duration: 5000 });
}
function decodeMasteries(str) {
    var tree = 0;
    var index = 0;
    for (var i=0; i<str.length; i++) {
        var cur = importChars[str[i]];
        // check for bad input
        if (cur == undefined) 
            return;
        // if the first bit is a 0, we know it's not a jump
        if ((cur & 0x20) == 0) {
            // extract data
            var num = bitfit(tree, index, maxbits); // how many we can fit
            var sizes = [0, 1, 2, 3, 4] // an array of each mastery held in this char
                            .filter(function(a){ return a < num; })
                            .map(function(a){ return bitlen(tree, index+a); });
            for (var j=0; j<sizes.length; j++, index++) {
                // shift amount is the sum of all elements to the right of this one
                var shift = sizes.slice(j + 1).reduce(function(a, b){ return a + b; }, 0);
                // shift off the bits we don't want and AND it with a bit mask
                var value = (cur >> shift) & ((1 << sizes[j]) - 1);
                // clamp: a legacy field can be wider than the fixed ranks
                var m = data[tree][index];
                if (value > m.ranks && m.hashNote && decodeNotes.indexOf(m.hashNote) < 0)
                    decodeNotes.push(m.hashNote);
                value = Math.min(value, m.ranks);

                state[tree][index] = value;
                totalPoints += value;
            }
        } else {
            // jump
            var dist = cur & 0x1f;
            index += dist;
        }

        // increment when we're done with a tree
        if (index >= data[tree].length) {
            tree++;
            index = 0;
            // break when we're done with all trees
            if (tree >= data.length)
                break;
        }
    }
}

function parseHash(raw) {
    // Hash format: "<dataset-id>|<mastery-code>" (current) or just
    // "<mastery-code>" (legacy — assume default data set).
    if (!raw) return { id: DEFAULT_DATA_SET_ID, code: "" };
    var pipe = raw.indexOf('|');
    if (pipe < 0) return { id: DEFAULT_DATA_SET_ID, code: raw };
    return { id: raw.slice(0, pipe), code: raw.slice(pipe + 1) };
}

function updateMasteries() {
    var parsed = parseHash(document.location.hash.slice(1));
    if (parsed.id !== activeDataSetId) {
        // Switch silently — switchDataSet() will redraw and then we import
        // the mastery code into the fresh state.
        switchDataSet(parsed.id, { skipUpdates: true });
    }
    var ds = getDataSet(activeDataSetId);
    if (ds && ds.system === "keystone") {
        // Keystone builds use their own code format (keystone-calculator.js).
        if (typeof importKeystones === "function") importKeystones(parsed.code);
    } else {
        importMasteries(parsed.code);
    }
    // A loaded build is a saved page: no "*", Save / Revert greyed.
    if (window.AirMasterySidebar) AirMasterySidebar.markSaved();
}

// Tear down and redraw the calculator. Called when switching seasons/patches.
// Icons are vendored per dataset (dataSet.iconBase + mastery.icon); there
// is no runtime Data Dragon fetch.
function redrawCalculator() {
    if (window.LolTooltip) LolTooltip.hide();
    $("#calculator").empty();
    drawCalculator();
}

// Switch to a different season/patch snapshot. Resets state, redraws the
// calculator, and re-syncs the panel UI.
function switchDataSet(id, opts) {
    opts = opts || {};
    var dataSet = getDataSet(id);
    if (!dataSet) return false;

    var system = dataSet.system || "classic";
    activeDataSetId = id;

    // Toggle which calculator container is visible. The keystone system
    // (V5.22 onwards) is structurally different and uses its own render
    // path in keystone-calculator.js. CSS keys off `body.keystone-system`.
    // The AIR sidebar serves both systems (re-synced after the draw).
    if (system === "keystone") {
        $("body").addClass("keystone-system");
        if (typeof drawKeystoneCalculator === "function") {
            drawKeystoneCalculator(dataSet);
        }
    } else {
        $("body").removeClass("keystone-system");
        syncDataSetGlobals(dataSet);
        redrawCalculator();
    }
    syncMasterySidebar(dataSet);

    // Reflect the active set in the season nav + patch dropdown (without
    // re-firing change handlers).
    refreshMasteriesSeasonNav(dataSet);
    if ($("#patch-select").length) {
        rebuildPatchSelect(dataSet.season, dataSet.id);
    }

    if (!opts.skipUpdates) {
        if (system === "keystone") {
            if (typeof updateKeystoneLink === "function") updateKeystoneLink();
        } else {
            updateLabels();
            updateLink();
        }
    }
    return true;
}

// Repopulate the Patch dropdown with the patches available for a given
// season, then select the requested set id.
function rebuildPatchSelect(season, selectedId) {
    var $patch = $("#patch-select");
    if (!$patch.length) return;
    $patch.empty();
    for (var i = 0; i < masteryDataSets.length; i++) {
        var ds = masteryDataSets[i];
        if (ds.season !== season) continue;
        $patch.append($("<option>").attr("value", ds.id).text(ds.patchLabel));
    }
    if (selectedId) $patch.val(selectedId);
}

// Season dropdown + tabs come from the shared season-led nav (nav.js); the
// patch dropdown stays page-local and lists this season's snapshots.
function refreshMasteriesSeasonNav(dataSet) {
    if (typeof setClientEra === "function") setClientEra(clientEraFor(dataSet.id));
    if (typeof buildSeasonNav !== "function") return;
    buildSeasonNav({
        page: "masteries",
        seasonSelect: "#season-select",
        currentKey: "s" + dataSet.season,
        onSeason: function(def){
            // Stay in-page: first dataset of the chosen season.
            for (var i = 0; i < masteryDataSets.length; i++) {
                if ("s" + masteryDataSets[i].season === def.key) {
                    switchDataSet(masteryDataSets[i].id);
                    return true;
                }
            }
            return false;
        }
    });
}

function buildSeasonPatchSelectors() {
    var active = getDataSet(activeDataSetId) || getDataSet(DEFAULT_DATA_SET_ID);
    refreshMasteriesSeasonNav(active);
    rebuildPatchSelect(active.season, active.id);
    $("#patch-select").on("change", function(){
        switchDataSet($(this).val());
    });
}

$(function(){
    // Bootstrap the active data set so treeOffsets/MAX_POINTS/state are sane
    // before the first draw. Keystone datasets have a different data shape
    // (an object with `trees`, not three arrays), so when the hash points at
    // one we bootstrap the classic globals from the default classic set and
    // let updateMasteries() below perform the actual switch.
    var initial = parseHash(document.location.hash.slice(1));
    var initialDs = getDataSet(initial.id) || getDataSet(DEFAULT_DATA_SET_ID);
    var bootstrapDs = (initialDs.system === "keystone") ? getDataSet(DEFAULT_DATA_SET_ID) : initialDs;
    syncDataSetGlobals(bootstrapDs);

    // Calculator
    drawCalculator();

    // Panel: the AIR sidebar (emblems + counts, Points Available, Save /
    // Return / Delete / Revert, double-click an emblem to reset its tree).
    // #return is the V7.21 LCU row's button.
    $("#return").click(resetStates);
    syncMasterySidebar(bootstrapDs);

    buildSeasonPatchSelectors();

    $("#share").click(function(){
        var href = $("#exportLink").attr("href") || (document.location.pathname + document.location.hash);
        var url = new URL(href, document.location.href).toString();
        copyToClipboard(url).then(function(){
            showToast("URL copied to clipboard");
        }, function(){
            showToast("Copy failed — here it is: " + url);
        });
    });

    // Once set up, load if hash present
    if (document.location.hash != "")
        updateMasteries();

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
