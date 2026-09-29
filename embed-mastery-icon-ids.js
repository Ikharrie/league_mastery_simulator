// One-shot tool: stamps an `iconId` on every mastery in the keystone data
// files by matching mastery names against the bundled Data Dragon
// mastery.json for that patch (data/mastery-<version>.json). The icons
// themselves live under images/masteries/<version>/<iconId>.png, so the
// calculator never needs a network fetch. Run with:
//
//     node embed-mastery-icon-ids.js

const fs = require("fs");
const path = require("path");

const FILES = [
    { file: "season6-keystone-data.js",     ddragon: "5.22.3" },
    { file: "preseason7-keystone-data.js",  ddragon: "6.22.1" },
    { file: "season7-keystone-data.js",     ddragon: "7.21.1" },
];

// DDragon names that are corrupted or absent; keyed by normalized name.
const OVERRIDES = {
    "5.22.3": { sorcery: 6114 },
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

for (const { file, ddragon } of FILES) {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "data", `mastery-${ddragon}.json`), "utf8"));
    const byName = {};
    for (const [id, m] of Object.entries(catalog.data)) {
        if (m && m.name) byName[norm(m.name)] = Number(id);
    }
    Object.assign(byName, OVERRIDES[ddragon] || {});

    const data = require(path.join(__dirname, file));
    let src = fs.readFileSync(path.join(__dirname, file), "utf8");
    let stamped = 0;
    const missing = [];
    for (const tree of data.trees) {
        for (const tier of tree.tiers) {
            for (const m of tier.masteries) {
                const iconId = byName[norm(m.name)];
                if (!iconId) { missing.push(`${file}: ${m.name}`); continue; }
                // Anchor on the unique `id: "<slug>", name: "<name>",` pair;
                // replace any pre-existing iconId on that entry.
                const anchor = new RegExp(
                    `(id: "${m.id}",\\s*name: ${JSON.stringify(m.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},)(\\s*iconId: \\d+,)?`);
                if (!anchor.test(src)) { missing.push(`${file}: anchor not found for ${m.id}`); continue; }
                src = src.replace(anchor, `$1 iconId: ${iconId},`);
                stamped++;
            }
        }
    }
    fs.writeFileSync(path.join(__dirname, file), src);
    console.log(`${file}: stamped ${stamped} iconIds (${ddragon})`);
    if (missing.length) console.log("  MISSING:", missing.join("; "));
}
