// parser.js — deps = 0. แยกข้อความดิบของ AI เป็นลำดับ run: ข้อความธรรมดา / การ์ด แล้วจัดกลุ่มแท็กแชทที่ติดกัน
// ทำงานกับ ctx.chat[i].mes ดิบเท่านั้น — DOMPurify กิน <TWEET> ฯลฯ ไปแล้วตอนผ่าน messageFormatting() จึงอ่านจาก DOM ไม่ได้

import { TAG_MAP, tagsForPlatforms, GROUPABLE_CHAT_CARDS } from "./catalogue.js";

let cachedRegex = null;
let cachedKey = null;

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** สร้าง regex หลักครั้งเดียวจากรายชื่อแท็กที่เปิดใช้งาน แล้ว cache ไว้ (invalidate เมื่อชุดแท็กเปลี่ยน) */
export function buildMasterRegex(tagNames) {
    const key = tagNames.slice().sort().join(",");
    if (cachedRegex && cachedKey === key) {
        cachedRegex.lastIndex = 0;
        return cachedRegex;
    }
    const alt = tagNames.map(escapeRegExp).join("|");
    cachedRegex = new RegExp(`<(${alt})\\b([^>]*?)\\/?>(?:([\\s\\S]*?)<\\/\\1>)?`, "gi");
    cachedKey = key;
    return cachedRegex;
}

function parseAttrs(attrsBlob) {
    const out = {};
    const re = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m;
    while ((m = re.exec(attrsBlob))) {
        out[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
    }
    return out;
}

function looksLikeAttrForm(attrsBlob) {
    return /[a-zA-Z_][\w-]*\s*=\s*["']?/.test(attrsBlob);
}

/** แยก body ด้วย "|" เป็นฟิลด์ตามลำดับ names — ฟิลด์สุดท้ายกิน "|" ที่เหลือทั้งหมด (กันข้อความที่มี "|" ในตัวมันเอง) */
function zipLegacy(names, body) {
    if (names.length === 1) return { [names[0]]: body };
    const parts = body.split("|");
    const out = {};
    names.forEach((name, i) => {
        out[name] = i === names.length - 1 ? parts.slice(i).join("|") : (parts[i] ?? "");
    });
    return out;
}

/**
 * แปลง match ดิบหนึ่งตัวเป็นโมเดลกลาง { tag, platform, card, fields }
 * คืน null เมื่อแท็กนี้ยังไม่มี renderer (card === null, เช่น Instagram/Stream ในสเตจถัดไป)
 */
export function normalizeMatch(rawTag, attrsBlob, body) {
    const def = TAG_MAP.get(rawTag.toUpperCase());
    if (!def || !def.card) return null;

    const trimmedAttrs = (attrsBlob || "").trim();
    let fields = {};

    if (trimmedAttrs && looksLikeAttrForm(trimmedAttrs)) {
        const attrs = parseAttrs(trimmedAttrs);
        for (const key of def.attrFields) if (attrs[key] !== undefined) fields[key] = attrs[key];
        if (def.bodyField && body !== undefined && body !== null) fields[def.bodyField] = body;
        if (attrs.from) fields.from = attrs.from;
    } else if (def.legacyFields && body !== undefined && body !== null) {
        const legacyRaw = zipLegacy(def.legacyFields, body);
        fields = def.legacyMap ? def.legacyMap(legacyRaw) : legacyRaw;
        if (def.legacyFrom) fields.from = def.legacyFrom;
    } else if (def.bodyField && body !== undefined && body !== null) {
        // ไม่มี attribute เลยแต่มี bodyField เดียว เช่น <CHAT_TITLE>ชื่อกลุ่ม</CHAT_TITLE>
        fields[def.bodyField] = body;
    } else {
        return null;
    }

    if (!fields.from) fields.from = "char";
    return { tag: def.tag, platform: def.platform, card: def.card, fields };
}

/**
 * แยก raw message เป็นลำดับ run: {type:"text", text} หรือ {type:"card", tag, platform, card, fields, raw}
 * @param {string} raw ข้อความดิบจาก ctx.chat[i].mes (หรือ mes.extra.display_text)
 * @param {string[]} enabledPlatforms เช่น ["x","chat"] — มาจาก settings.platforms.*.enabled
 */
export function parseMessage(raw, enabledPlatforms) {
    if (!raw) return [];
    const tagNames = tagsForPlatforms(enabledPlatforms);
    if (!tagNames.length) return [{ type: "text", text: raw }];

    const re = buildMasterRegex(tagNames);
    const runs = [];
    let lastEnd = 0;
    let m;
    while ((m = re.exec(raw))) {
        if (m.index > lastEnd) runs.push({ type: "text", text: raw.slice(lastEnd, m.index) });
        const model = normalizeMatch(m[1], m[2], m[3]);
        if (model) runs.push({ type: "card", ...model, raw: m[0] });
        else runs.push({ type: "text", text: m[0] });
        lastEnd = re.lastIndex;
        if (m[0].length === 0) re.lastIndex++; // กัน infinite loop กรณี match ว่าง (ไม่ควรเกิดกับ pattern นี้ แต่กันไว้)
    }
    if (lastEnd < raw.length) runs.push({ type: "text", text: raw.slice(lastEnd) });
    return runs;
}

/** เร็ว: เช็คว่ามีแท็กที่รู้จักอยู่ใน raw หรือไม่ ก่อนจะเสีย effort parse เต็ม — ใช้ตัดจบใน inject.js */
export function hasAnyTag(raw, enabledPlatforms) {
    if (!raw) return false;
    const tagNames = tagsForPlatforms(enabledPlatforms);
    if (!tagNames.length) return false;
    const re = buildMasterRegex(tagNames);
    re.lastIndex = 0;
    return re.test(raw);
}

/**
 * รวมแท็กแชทที่ groupable และติดกัน (คั่นด้วย whitespace ล้วนเท่านั้น) เป็น { type:"chat_thread", items }
 * รวมแม้มีตัวเดียวก็ตาม — renderer ของ "msg"/"chat_slip"/"chat_gift" ต้องมีกรอบมือถือห่ออยู่เสมอ
 */
export function groupRuns(runs) {
    const out = [];
    let i = 0;
    while (i < runs.length) {
        const run = runs[i];
        if (run.type === "card" && run.platform === "chat" && GROUPABLE_CHAT_CARDS.has(run.card)) {
            const group = [run];
            let j = i + 1;
            while (j < runs.length) {
                const next = runs[j];
                if (next.type === "text") {
                    if (next.text.trim() === "") { j++; continue; }
                    break;
                }
                if (next.type === "card" && next.platform === "chat" && GROUPABLE_CHAT_CARDS.has(next.card)) {
                    group.push(next);
                    j++;
                    continue;
                }
                break;
            }
            out.push({ type: "chat_thread", items: group });
            i = j;
            continue;
        }
        if (run.type === "card" && run.card === "ig_post") {
            // ผูก IG_COMMENT ที่ตามมาติดๆ (คั่นด้วย whitespace ล้วน) เข้ากับโพสต์ก่อนหน้า
            const comments = [];
            let j = i + 1;
            while (j < runs.length) {
                const next = runs[j];
                if (next.type === "text") {
                    if (next.text.trim() === "") { j++; continue; }
                    break;
                }
                if (next.type === "card" && next.card === "ig_comment") {
                    comments.push(next);
                    j++;
                    continue;
                }
                break;
            }
            out.push({ ...run, comments });
            i = j;
            continue;
        }
        out.push(run);
        i++;
    }
    return out;
}
