// prompts.js — คำสั่งทุกตัวที่ส่งให้ AI ต้องแก้ได้จากหน้า settings + มีปุ่มคืนค่าเริ่มต้น (มาตรฐานบังคับของ extension นี้)
// เขียนเนื้อหา default เป็นภาษาอังกฤษ — โมเดลส่วนใหญ่ทำตามคำสั่งรูปแบบ/syntax ได้แม่นกว่าเมื่อสั่งเป็นอังกฤษ
// แม้ UI ทั้งหมดจะเป็นไทย ส่วนนี้คือข้อความที่ "ส่งเข้าพรอมป์ AI" ไม่ใช่ UI

import { getSettings, bumpRev } from "./store.js";
import { tagDocsForPlatform } from "./catalogue.js";

/** @typedef {{id:string, label:string, default:string, tokens?:string[]}} PromptDef */

/** @type {PromptDef[]} */
export const PROMPT_DEFS = [
    {
        id: "system_header",
        label: "หัวข้อคำสั่งหลัก",
        default: "## Social Media UI Tags\nYou can enrich your reply by embedding special tags that render as rich social-media cards in the chat. Follow the rules and the tag reference below exactly.",
    },
    {
        id: "rules_common",
        label: "กฎการเขียนแท็ก",
        default: [
            "- Write tags using the attribute form: `<TAG attr=\"value\">body</TAG>`.",
            "- Do NOT write identity fields (name, handle, avatar) — they are filled in automatically from the bound profile.",
            "- Put long text (captions, messages) inside the tag body, not inside an attribute value.",
            "- Before writing any img/sticker/cover attribute, check the \"Available images\" list below first. If it has an entry that fits the moment, you MUST copy its slug EXACTLY, character for character — never invent, guess, shorten, or paraphrase a slug.",
            "- If nothing in the Available images list fits, omit the img/sticker/cover attribute entirely and write text only. A tag with no image is always correct; a tag with a made-up slug is always wrong.",
            "- If the Available images list is empty or not shown at all, never use img/sticker/cover attributes.",
            "- Use from=\"user\" only when writing as {{user}}; omit it entirely when writing as the character (default).",
        ].join("\n"),
    },
    {
        id: "docs_x",
        label: "เอกสารแท็ก X",
        default: "### X / Twitter tags\n{{tags}}",
        tokens: ["tags"],
    },
    {
        id: "docs_instagram",
        label: "เอกสารแท็ก Instagram",
        default: "### Instagram tags\n{{tags}}",
        tokens: ["tags"],
    },
    {
        id: "docs_chat",
        label: "เอกสารแท็ก Chat",
        default: "### Chat tags\n{{tags}}\nConsecutive chat tags with nothing but whitespace between them render as a single phone conversation — write several MSG tags in a row for a back-and-forth exchange.",
        tokens: ["tags"],
    },
    {
        id: "identity_block",
        label: "ข้อมูลโปรไฟล์",
        default: "### Identity\n{{char_profile}}\n{{user_profile}}",
        tokens: ["char_profile", "user_profile"],
    },
    {
        id: "images_block",
        label: "รายการรูปที่ใช้ได้",
        default: "### Available images\n{{albums}}",
        tokens: ["albums"],
    },
    {
        id: "vision_caption",
        label: "คำสั่งให้ AI ช่วยบรรยายรูป",
        default: "Describe this image in one or two vivid, concrete sentences suitable as a reference caption. Focus on visually distinct details (colors, setting, subject) that would help someone pick the right image later. Do not mention that this is an image description.",
    },
];

const PROMPT_MAP = new Map(PROMPT_DEFS.map((d) => [d.id, d]));

export function getPromptDef(id) {
    return PROMPT_MAP.get(id) || null;
}

/** ข้อความปัจจุบัน — ค่าที่ผู้ใช้แก้ (ถ้ามี) หรือ default */
export function getPrompt(id) {
    const def = getPromptDef(id);
    if (!def) return "";
    const stored = getSettings().prompt.templates[id];
    return stored !== undefined ? stored : def.default;
}

export function isPromptCustomized(id) {
    return getSettings().prompt.templates[id] !== undefined;
}

export function setPrompt(id, text) {
    if (!getPromptDef(id)) return;
    getSettings().prompt.templates[id] = text;
    bumpRev();
}

export function resetPrompt(id) {
    delete getSettings().prompt.templates[id];
    bumpRev();
}

/** แทน {{key}} ด้วยค่าจริง — ใช้ทั้งกับ {{tags}}/{{albums}}/{{char_profile}}/{{user_profile}} และ {{user}} ของ ST เอง */
export function expandTemplate(text, vars) {
    let out = String(text || "");
    for (const [key, value] of Object.entries(vars || {})) {
        out = out.split(`{{${key}}}`).join(String(value ?? ""));
    }
    return out;
}

/** เอกสารแท็กของแพลตฟอร์มหนึ่ง ขยาย {{tags}} ให้แล้ว — เรียกจาก promptbuild.js */
export function buildPlatformDocs(platformId, promptId) {
    const tags = tagDocsForPlatform(platformId);
    if (!tags) return "";
    return expandTemplate(getPrompt(promptId), { tags });
}
