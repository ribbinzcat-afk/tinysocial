// catalogue.js — deps = 0. แหล่งความจริงเดียวของ: regex parser, เอกสารพรอมป์ (stage 5), และรายการแท็กในหน้า settings
//
// ทุกแท็กรองรับ 2 รูปแบบ:
//   1) attribute (หลัก)  เช่น <TWEET img="beach01" likes="1204">ข้อความ</TWEET>
//   2) pipe เดิม (เข้ากันได้กับ regex-social-media-ui-set.json) เช่น <TWEET>A|Anya|@anya|2h|ข้อความ|1|2|3|4</TWEET>
// ฟิลด์ตัวตน (avatarLetter/name/handle) ในแบบ pipe เดิมถูก "ทิ้ง" เสมอ — โปรไฟล์ที่ผูกไว้ชนะทุกกรณี
// AI ไม่ต้องเขียนฟิลด์ตัวตนเลยในแบบ attribute เช่นกัน

/**
 * @typedef {Object} TagDef
 * @property {string} tag            ชื่อแท็ก (UPPER_CASE) ตรงกับที่ AI พิมพ์
 * @property {"x"|"instagram"|"chat"|"stream"} platform
 * @property {string} card           ประเภทการ์ดที่ render dispatch ใช้ (src/render/index.js)
 * @property {string[]} attrFields   attribute ที่รู้จักในแบบ attribute-form
 * @property {string|null} bodyField ฟิลด์ที่เนื้อหาใน body (>...</TAG>) ของแบบ attribute-form จะ map ไป (null = ไม่มี body)
 * @property {string[]|null} legacyFields ชื่อฟิลด์ตามลำดับ pipe เดิม (null = ไม่รองรับ legacy)
 * @property {(f: Record<string,string>) => Record<string,string>} [legacyMap] แปลงฟิลด์ legacy → โมเดลกลาง (ทิ้งฟิลด์ตัวตน)
 * @property {string} [legacyFrom]   ใช้ตอน legacy ไม่มีฟิลด์ from ชัดเจน — ระบุ "char" หรือ "user" ตายตัวจากชื่อแท็ก
 */

const identity = (f) => ({ ...f });

/** @type {TagDef[]} */
export const TAG_DEFS = [
    // ==================== X / Twitter ====================
    // TWEET เดียวรวม 3 หน้าตา (ข้อความล้วน / รูป+แคปชั่น / รูปล้วน) แยกจาก field ที่มีจริง (img มี/ไม่มี, text มี/ไม่มี)
    {
        tag: "TWEET", platform: "x", card: "tweet", primary: true,
        attrFields: ["img", "likes", "retweets", "replies", "views", "time", "from"], bodyField: "text",
        legacyFields: ["avatarLetter", "name", "handle", "time", "text", "replies", "retweets", "likes", "views"],
        legacyMap: (f) => ({ time: f.time, text: f.text, replies: f.replies, retweets: f.retweets, likes: f.likes, views: f.views }),
    },
    {
        tag: "TWEET_P", platform: "x", card: "tweet",
        attrFields: [], bodyField: null, // legacy-only tag — attribute form ใช้ TWEET แทน
        legacyFields: ["avatarLetter", "name", "handle", "time", "text", "imgDesc", "replies", "retweets", "likes", "views"],
        legacyMap: (f) => ({ time: f.time, text: f.text, imgPlaceholder: f.imgDesc, replies: f.replies, retweets: f.retweets, likes: f.likes, views: f.views }),
    },
    {
        tag: "TWEET_L", platform: "x", card: "tweet",
        attrFields: [], bodyField: null,
        legacyFields: ["avatarLetter", "name", "handle", "time", "imgDesc", "replies", "retweets", "likes", "views"],
        legacyMap: (f) => ({ time: f.time, imgPlaceholder: f.imgDesc, replies: f.replies, retweets: f.retweets, likes: f.likes, views: f.views }),
    },
    {
        tag: "TWEET_PP", platform: "x", card: "tweet",
        attrFields: [], bodyField: null,
        legacyFields: ["avatarLetter", "name", "handle", "time", "text", "catboxFile", "replies", "retweets", "likes", "views"],
        legacyMap: (f) => ({ time: f.time, text: f.text, imgExternal: `https://files.catbox.moe/${f.catboxFile}`, replies: f.replies, retweets: f.retweets, likes: f.likes, views: f.views }),
    },
    {
        tag: "TWEET_LP", platform: "x", card: "tweet",
        attrFields: [], bodyField: null,
        legacyFields: ["avatarLetter", "name", "handle", "time", "catboxFile", "replies", "retweets", "likes", "views"],
        legacyMap: (f) => ({ time: f.time, imgExternal: `https://files.catbox.moe/${f.catboxFile}`, replies: f.replies, retweets: f.retweets, likes: f.likes, views: f.views }),
    },

    // ==================== แชท LINE-like ====================
    {
        tag: "CHAT_HEAD", platform: "chat", card: "chat_head", primary: true,
        attrFields: ["name", "status"], bodyField: null,
        legacyFields: ["name"], // CONTACT
        legacyMap: identity,
    },
    {
        tag: "CONTACT", platform: "chat", card: "chat_head", // legacy tag name เดิม ใช้ได้ตรงๆ เช่นกัน
        attrFields: ["name", "status"], bodyField: null,
        legacyFields: ["name"],
        legacyMap: identity,
    },
    {
        tag: "CHAT_TITLE", platform: "chat", card: "chat_title", primary: true,
        attrFields: [], bodyField: "title",
        legacyFields: ["title"], // CHAT
        legacyMap: identity,
    },
    {
        tag: "CHAT", platform: "chat", card: "chat_title",
        attrFields: [], bodyField: "title",
        legacyFields: ["title"],
        legacyMap: identity,
    },

    // MSG รวม text/sticker/img/voice/place/track ไว้แท็กเดียว แยกกันด้วย attribute ที่มีจริง
    {
        tag: "MSG", platform: "chat", card: "msg", primary: true,
        attrFields: ["from", "time", "sticker", "img", "voice", "place", "address", "track", "artist", "cover"], bodyField: "text",
        legacyFields: null,
    },
    // legacy MSG variants — แต่ละอันคือแท็กชื่อเดิม แปลงเป็นโมเดล "msg" กลางเดียวกัน
    {
        tag: "RECEIVED", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "text", "time"], legacyMap: (f) => ({ text: f.text, time: f.time }),
    },
    {
        tag: "SEND", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "text", "time"], legacyMap: (f) => ({ text: f.text, time: f.time }),
    },
    {
        tag: "RECEIVED_S", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "catboxFile", "time"], legacyMap: (f) => ({ stickerExternal: `https://files.catbox.moe/${f.catboxFile}`, time: f.time }),
    },
    {
        tag: "SEND_S", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "catboxFile", "time"], legacyMap: (f) => ({ stickerExternal: `https://files.catbox.moe/${f.catboxFile}`, time: f.time }),
    },
    {
        tag: "RECEIVED_P", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "catboxFile", "text", "time"], legacyMap: (f) => ({ imgExternal: `https://files.catbox.moe/${f.catboxFile}`, text: f.text, time: f.time }),
    },
    {
        tag: "SEND_P", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "catboxFile", "text", "time"], legacyMap: (f) => ({ imgExternal: `https://files.catbox.moe/${f.catboxFile}`, text: f.text, time: f.time }),
    },
    {
        tag: "RECEIVED_V", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "duration", "time"], legacyMap: (f) => ({ voice: f.duration, time: f.time }),
    },
    {
        tag: "SEND_V", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "duration", "time"], legacyMap: (f) => ({ voice: f.duration, time: f.time }),
    },
    {
        tag: "RECEIVED_L", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "place", "address", "time"], legacyMap: (f) => ({ place: f.place, address: f.address, time: f.time }),
    },
    {
        tag: "SEND_L", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "place", "address", "time"], legacyMap: (f) => ({ place: f.place, address: f.address, time: f.time }),
    },
    {
        tag: "RECEIVED_A", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "albumColor", "albumInitial", "track", "artist", "time"],
        legacyMap: (f) => ({ track: f.track, artist: f.artist, time: f.time }),
    },
    {
        tag: "SEND_A", platform: "chat", card: "msg", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "albumColor", "albumInitial", "track", "artist", "time"],
        legacyMap: (f) => ({ track: f.track, artist: f.artist, time: f.time }),
    },

    // สลิปโอนเงิน
    {
        tag: "CHAT_SLIP", platform: "chat", card: "chat_slip", primary: true,
        attrFields: ["from", "bank", "amount", "to", "payer", "date", "time", "status"], bodyField: null,
        legacyFields: null,
    },
    {
        tag: "RECEIVED_T", platform: "chat", card: "chat_slip", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "bankInitials", "amount", "date", "time", "payer", "to", "note", "msgTime"],
        legacyMap: (f) => ({ bank: f.bankInitials, amount: f.amount, date: f.date, payer: f.payer, to: f.to, note: f.note, time: f.msgTime }),
    },
    {
        tag: "SEND_T", platform: "chat", card: "chat_slip", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "bankInitials", "amount", "date", "time", "payer", "to", "note", "msgTime"],
        legacyMap: (f) => ({ bank: f.bankInitials, amount: f.amount, date: f.date, payer: f.payer, to: f.to, note: f.note, time: f.msgTime }),
    },

    // อั่งเปา/ของขวัญ
    {
        tag: "CHAT_GIFT", platform: "chat", card: "chat_gift", primary: true,
        attrFields: ["from", "amount", "opened", "note", "time"], bodyField: null,
        legacyFields: null,
    },
    {
        tag: "RECEIVED_RC", platform: "chat", card: "chat_gift", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "giftFrom", "time"], legacyMap: (f) => ({ opened: "false", time: f.time }),
    },
    {
        tag: "SEND_RC", platform: "chat", card: "chat_gift", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "giftFrom", "time"], legacyMap: (f) => ({ opened: "false", time: f.time }),
    },
    {
        tag: "RECEIVED_RO", platform: "chat", card: "chat_gift", attrFields: [], bodyField: null, legacyFrom: "char",
        legacyFields: ["name", "amount", "note", "time"], legacyMap: (f) => ({ opened: "true", amount: f.amount, note: f.note, time: f.time }),
    },
    {
        tag: "SEND_RO", platform: "chat", card: "chat_gift", attrFields: [], bodyField: null, legacyFrom: "user",
        legacyFields: ["name", "amount", "note", "time"], legacyMap: (f) => ({ opened: "true", amount: f.amount, note: f.note, time: f.time }),
    },

    // สายโทร
    {
        tag: "CHAT_CALL", platform: "chat", card: "chat_call", primary: true,
        attrFields: ["type", "who", "dur", "time"], bodyField: null,
        legacyFields: null,
    },
    {
        tag: "CALL", platform: "chat", card: "chat_call", attrFields: [], bodyField: null,
        legacyFields: ["who"], legacyMap: (f) => ({ type: "voice", who: f.who }),
    },
    {
        tag: "VDO", platform: "chat", card: "chat_call", attrFields: [], bodyField: null,
        legacyFields: ["who"], legacyMap: (f) => ({ type: "video", who: f.who }),
    },
    {
        tag: "MISS", platform: "chat", card: "chat_call", attrFields: [], bodyField: null,
        legacyFields: ["who", "time", "note"], legacyMap: (f) => ({ type: "missed", who: f.who, time: f.time, note: f.note }),
    },
    {
        tag: "ON_CALL", platform: "chat", card: "chat_call", attrFields: [], bodyField: null,
        legacyFields: ["who", "dur"], legacyMap: (f) => ({ type: "ongoing", who: f.who, dur: f.dur }),
    },

    // เงินเข้า/ออก
    {
        tag: "CHAT_MONEY", platform: "chat", card: "chat_money", primary: true,
        attrFields: ["dir", "amount", "who", "time"], bodyField: null,
        legacyFields: null,
    },
    {
        tag: "IN", platform: "chat", card: "chat_money", attrFields: [], bodyField: null,
        legacyFields: ["time", "amount", "who"], legacyMap: (f) => ({ dir: "in", time: f.time, amount: f.amount, who: f.who }),
    },
    {
        tag: "OUT", platform: "chat", card: "chat_money", attrFields: [], bodyField: null,
        legacyFields: ["time", "amount", "who"], legacyMap: (f) => ({ dir: "out", time: f.time, amount: f.amount, who: f.who }),
    },

    // แจ้งเตือนทั่วไป
    {
        tag: "CHAT_NOTI", platform: "chat", card: "chat_noti", primary: true,
        attrFields: ["who", "time"], bodyField: "text",
        legacyFields: null,
    },
    {
        tag: "MES_NOTI", platform: "chat", card: "chat_noti", attrFields: [], bodyField: null,
        legacyFields: ["time", "who", "text"], legacyMap: identity,
    },

    // ==================== Instagram (สเตจ 4) ====================
    { tag: "IG_POST", platform: "instagram", card: "ig_post", primary: true, attrFields: ["img", "likes", "comments", "location", "time", "from"], bodyField: "caption", legacyFields: null },
    { tag: "IG_STORY", platform: "instagram", card: "ig_story", primary: true, attrFields: ["img", "text", "time", "from"], bodyField: null, legacyFields: null },
    { tag: "IG_COMMENT", platform: "instagram", card: "ig_comment", primary: true, attrFields: ["user", "likes", "time"], bodyField: "text", legacyFields: null },

    // ==================== Live stream (รอบ 2) — ลงทะเบียนไว้ ยังไม่มี renderer ====================

    { tag: "STREAM_TITLE", platform: "stream", card: null, attrFields: [], bodyField: null, legacyFields: null },
    { tag: "STREAM_CHAT", platform: "stream", card: null, attrFields: [], bodyField: null, legacyFields: null },
    { tag: "STREAM_DONO", platform: "stream", card: null, attrFields: [], bodyField: null, legacyFields: null },
    { tag: "STREAM_MEMBER", platform: "stream", card: null, attrFields: [], bodyField: null, legacyFields: null },
    { tag: "STREAM_LIKE", platform: "stream", card: null, attrFields: [], bodyField: null, legacyFields: null },
    { tag: "STREAM_HILIGHT", platform: "stream", card: null, attrFields: [], bodyField: null, legacyFields: null },
    { tag: "STREAM_END", platform: "stream", card: null, attrFields: [], bodyField: null, legacyFields: null },
];

/** @type {Map<string, TagDef>} */
export const TAG_MAP = new Map(TAG_DEFS.map((d) => [d.tag, d]));

/** คืนชื่อแท็กทั้งหมดของแพลตฟอร์มที่ "เปิดใช้งาน" — ใช้สร้าง master regex และเอกสารพรอมป์ */
export function tagsForPlatforms(enabledPlatforms) {
    const set = new Set(enabledPlatforms);
    return TAG_DEFS.filter((d) => set.has(d.platform) && d.card).map((d) => d.tag);
}

export const ALL_RENDERABLE_TAGS = TAG_DEFS.filter((d) => d.card).map((d) => d.tag);

/** card ประเภทที่ parser ต้องรวมแท็กติดกัน (คั่นด้วย whitespace ล้วน) เป็นกรอบมือถือเดียว — ตรงข้ามกับการ์ดแจ้งเตือนเดี่ยว
 *  (chat_call/chat_money/chat_noti) ที่ต้นฉบับออกแบบให้ลอยเดี่ยวเสมอ ไม่มี name/time label แบบฟองแชท */
export const GROUPABLE_CHAT_CARDS = new Set(["msg", "chat_head", "chat_title", "chat_slip", "chat_gift"]);

function exampleFor(def) {
    const attrsStr = def.attrFields.filter((a) => a !== "from").map((a) => `${a}="..."`).join(" ");
    const open = `<${def.tag}${attrsStr ? " " + attrsStr : ""}>`;
    return def.bodyField ? `${open}...</${def.tag}>` : open;
}

/**
 * สร้างเอกสารรายการแท็ก (เฉพาะแท็กแบบ attribute หลัก — ไม่รวม alias/legacy) ของแพลตฟอร์มหนึ่ง
 * ใช้ขยาย {{tags}} ในพรอมป์ (src/prompts.js) และแสดงในหน้า settings — เพิ่ม/แก้แท็กใน TAG_DEFS แล้วตรงนี้ตามอัตโนมัติ
 */
export function tagDocsForPlatform(platform) {
    const defs = TAG_DEFS.filter((d) => d.platform === platform && d.primary);
    if (!defs.length) return "";
    return defs.map((d) => `- ${exampleFor(d)}`).join("\n");
}
