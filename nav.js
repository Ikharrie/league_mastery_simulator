// Season-led navigation, shared by all three pages (index.html, runes.html,
// runes-reforged.html). The Season dropdown in the header is the primary
// control: it lists every covered season, and the page tabs adapt to what
// existed in that era —
//   Seasons 1-7 (separate systems):  [Masteries] [Runes]
//   Seasons 8+  (combined system):   [Runes Reforged]
// Each entry carries the default dataset id per page so cross-page jumps
// land on the right season. A null page means "did not exist / no catalog
// yet" and renders as a disabled tab.

var SEASON_NAV = [
    { key: "s1",    label: "Season 1",           masteries: "s1-final",    runes: null },
    { key: "s2",    label: "Season 2",           masteries: "s2-ahri",     runes: null },
    { key: "s3",    label: "Season 3",           masteries: "s3-pbe",      runes: "preReforged-V3.14" },
    { key: "s4",    label: "Season 4",           masteries: "s4-final",    runes: "preReforged-V4.20" },
    { key: "s5",    label: "Season 5",           masteries: "s5-final",    runes: "preReforged-V5.21" },
    { key: "s6",    label: "Season 6",           masteries: "s6-launch",   runes: "preReforged-V6.24" },
    { key: "s7",    label: "Season 7",           masteries: "s7-final",    runes: "preReforged-V7.21" },
    { key: "s8",    label: "Season 8 (2018)",    reforged: "rr-v8-23" },
    { key: "s9",    label: "Season 9 (2019)",    reforged: "rr-v9-23" },
    { key: "s10",   label: "Season 10 (2020)",   reforged: "rr-v10-23" },
    { key: "s11",   label: "Season 11 (2021)",   reforged: "rr-v11-23" },
    { key: "s12",   label: "Season 12 (2022)",   reforged: "rr-v12-23" },
    { key: "s13",   label: "Season 13 (2023)",   reforged: "rr-v13-24" },
    { key: "s14",   label: "Season 14 (2024)",   reforged: "rr-v14-19" },
    { key: "s2025", label: "Season 2025",        reforged: "rr-v25-24" },
    { key: "s2026", label: "Season 2026 (Current)", reforged: "rr-v26-13" },
];

function seasonNavFind(key) {
    for (var i = 0; i < SEASON_NAV.length; i++)
        if (SEASON_NAV[i].key === key) return SEASON_NAV[i];
    return null;
}

// URL that opens `page` pre-selected to this season, or null if the season
// has no such page.
function seasonNavUrl(def, page) {
    if (page === "masteries" && def.masteries) return "index.html#" + def.masteries + "|";
    if (page === "runes" && def.runes) return "runes.html#" + def.runes + "|";
    if (page === "reforged" && def.reforged) return "runes-reforged.html#" + def.reforged;
    return null;
}

function seasonNavPrimaryUrl(def) {
    return seasonNavUrl(def, "masteries")
        || seasonNavUrl(def, "reforged")
        || seasonNavUrl(def, "runes")
        || "index.html";
}

function renderSeasonNavTabs(opts, def) {
    var $tabs = $(".header-tabs");
    if (!$tabs.length || !def) return;
    $tabs.empty();
    var addTab = function(label, page) {
        var url = seasonNavUrl(def, page);
        if (url) {
            $tabs.append($("<a>")
                .addClass("header-tab")
                .toggleClass("active", opts.page === page)
                .attr("href", url)
                .text(label));
        } else {
            $tabs.append($("<span>")
                .addClass("header-tab")
                .addClass("disabled")
                .attr("title", "No " + label.toLowerCase() + " catalog for this season yet")
                .text(label));
        }
    };
    if (def.reforged) {
        addTab("Runes Reforged", "reforged");
    } else {
        addTab("Masteries", "masteries");
        addTab("Runes", "runes");
    }
}

// (Re)build the season dropdown + tabs. `opts`:
//   page          "masteries" | "runes" | "reforged"
//   seasonSelect  selector of this page's season <select>
//   currentKey    SEASON_NAV key of the active dataset
//   onSeason(def) called when the chosen season exists on THIS page type;
//                 switch datasets in-page and return true. Returning a
//                 falsy value falls back to a cross-page navigation.
function buildSeasonNav(opts) {
    var $season = $(opts.seasonSelect);
    if (!$season.length) return;
    $season.empty();
    SEASON_NAV.forEach(function(def){
        $season.append($("<option>").attr("value", def.key).text(def.label));
    });
    $season.val(opts.currentKey);
    renderSeasonNavTabs(opts, seasonNavFind(opts.currentKey));

    $season.off("change.nav").on("change.nav", function(){
        var def = seasonNavFind($(this).val());
        if (!def) return;
        if (def[opts.page] && opts.onSeason && opts.onSeason(def)) return;
        document.location.href = seasonNavPrimaryUrl(def);
    });
}
