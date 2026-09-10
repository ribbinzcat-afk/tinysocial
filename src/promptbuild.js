// promptbuild.js — ประกอบพรอมป์จาก prompts.js + คลังรูป + โปรไฟล์ แล้ว setExtensionPrompt ให้ ST
// เฉพาะแพลตฟอร์มที่ enabled && docsInPrompt เท่านั้นที่ถูกส่งเข้าพรอมป์ (ปิดได้แยกจากการแสดงการ์ดในแชท)

import { getContext } from "../../../../extensions.js";

import { getSettings, saveSettings, listAlbums, getAlbumImages } from "./store.js";
import { getPrompt, getPromptDef, buildPlatformDocs, expandTemplate } from "./prompts.js";
import { resolveProfile, currentCharacterKey, currentPersonaKey } from "./identity.js";
import { countTokens } from "./api.js";

const EXT_PROMPT_KEY = "TINYSOCIAL";
let debounceTimer = null;

function activePlatformIds(settings) {
    return Object.entries(settings.platforms).filter(([, p]) => p.enabled && p.docsInPrompt).map(([k]) => k);
}

// "stream" ไม่มีตัวตนที่ผูกโปรไฟล์ (ผู้ชม/โดเนทเป็นชื่อที่ AI ตั้งสดๆ ไม่ผ่าน resolveProfile เลย) — บอก AI
// ว่าตัวละครมี "stream handle" ไปก็ไม่มีความหมายอะไร จึงตัดออกจากบรรทัดตัวตนเสมอ ไม่ว่าจะเปิดแพลตฟอร์มนี้ไว้หรือไม่
const identityLinePlatforms = (platforms) => platforms.filter((p) => p !== "stream");

function buildCharProfileLine(platforms) {
    const idPlatforms = identityLinePlatforms(platforms);
    if (!currentCharacterKey() || !idPlatforms.length) return "";
    const ctx = getContext();
    const parts = idPlatforms.map((p) => {
        const prof = resolveProfile(p, "char", null);
        return `${p}: ${prof.displayName} (${prof.handle})`;
    });
    return `- ${ctx.name2 || "Character"} → ${parts.join(", ")}`;
}

function buildUserProfileLine(platforms) {
    const idPlatforms = identityLinePlatforms(platforms);
    if (!currentPersonaKey() || !idPlatforms.length) return "";
    const parts = idPlatforms.map((p) => {
        const prof = resolveProfile(p, "user", null);
        return `${p}: ${prof.displayName} (${prof.handle})`;
    });
    return `- {{user}} → ${parts.join(", ")}`;
}

/** รวมรูปจากอัลบั้มที่ถูกเลือกส่ง (union ของ exposeAlbumIds ของทุกแพลตฟอร์มที่ active) จัดกลุ่มตามอัลบั้ม
 *  "stream" ไม่มีแท็กไหนอ้างอิงรูปเลย (ไม่มีช่องเลือกอัลบั้มในหน้า settings ด้วย) จึงตัดออกเสมอกันรกพรอมป์เปล่าๆ */
function buildAlbumsText(settings, platforms) {
    const albumIds = new Set();
    for (const p of platforms) {
        if (p === "stream") continue;
        for (const id of settings.platforms[p].exposeAlbumIds) albumIds.add(id);
    }
    if (!albumIds.size) return "";

    const albums = listAlbums().filter((a) => albumIds.has(a.id));
    const blocks = [];
    for (const album of albums) {
        const images = getAlbumImages(album.id);
        if (!images.length) continue;
        const kindLabel = album.kind === "sticker" ? "stickers" : "photos";
        const lines = images.map((img) => `- ${img.slug} — ${img.desc || img.name}`);
        blocks.push(`## ${album.name} (${kindLabel})\n${lines.join("\n")}`);
    }
    return blocks.join("\n\n");
}

/**
 * ประกอบข้อความพรอมป์แบบ sync (ไม่นับโทเคน) — ใช้ preview ทันทีในหน้า settings/แผง
 * @returns {{text:string, sections:{label:string,text:string}[]}}
 */
export function buildInjection() {
    const settings = getSettings();
    if (!settings.enabled || !settings.prompt.injectEnabled) return { text: "", sections: [] };

    const platforms = activePlatformIds(settings);
    if (!platforms.length) return { text: "", sections: [] };

    const sections = [];
    sections.push({ label: "หัวข้อ", text: getPrompt("system_header") });
    sections.push({ label: "กฎการเขียนแท็ก", text: getPrompt("rules_common") });

    for (const platform of platforms) {
        const promptId = `docs_${platform}`;
        if (!getPromptDef(promptId)) continue; // เผื่ออนาคตมีแพลตฟอร์มที่ยังไม่มี prompt def ของตัวเอง
        const text = buildPlatformDocs(platform, promptId);
        if (text) sections.push({ label: `เอกสารแท็ก: ${platform}`, text });
    }

    const charLine = buildCharProfileLine(platforms);
    const userLine = buildUserProfileLine(platforms);
    if (charLine || userLine) {
        const text = expandTemplate(getPrompt("identity_block"), { char_profile: charLine, user_profile: userLine });
        sections.push({ label: "ตัวตน (โปรไฟล์)", text });
    }

    const albumsText = buildAlbumsText(settings, platforms);
    if (albumsText) {
        const text = expandTemplate(getPrompt("images_block"), { albums: albumsText });
        sections.push({ label: "รูปภาพที่ใช้ได้", text });
    }

    return { text: sections.map((s) => s.text).join("\n\n"), sections };
}

// setExtensionPrompt() ถูกเรียกแบบ sync ก่อน await ตัวแรกเสมอ เรียงตามลำดับที่ผู้ใช้กดจริง จึงไม่มีปัญหาลำดับ —
// แต่ settings.prompt.lastTokens เขียนตอนท้ายหลัง await countTokens หลายตัว ถ้ายิงซ้อนกันหลาย call (ติ๊กรัวๆ)
// call ที่ resolve ทีหลังไม่ใช่ call ล่าสุดเสมอไป ต้องกันด้วย generation counter ไม่งั้นค่า cache จะเก่ากว่าจริง
let rebuildGeneration = 0;

/** ประกอบ + นับโทเคนจริงทุก section + setExtensionPrompt ให้ ST — เรียกตรงเมื่อต้องการผลทันที (เช่น เปิด popup preview) */
export async function rebuildInjection() {
    const myGeneration = ++rebuildGeneration;
    const ctx = getContext();
    const settings = getSettings();
    const { text, sections } = buildInjection();

    if (!text) {
        ctx.setExtensionPrompt(EXT_PROMPT_KEY, "", settings.prompt.position, settings.prompt.depth, settings.prompt.scan, settings.prompt.role);
        const empty = { total: 0, sections: [] };
        if (myGeneration === rebuildGeneration) { settings.prompt.lastTokens = empty; saveSettings(); }
        return empty;
    }

    ctx.setExtensionPrompt(EXT_PROMPT_KEY, text, settings.prompt.position, settings.prompt.depth, settings.prompt.scan, settings.prompt.role);

    const sectionsWithTokens = [];
    let total = 0;
    for (const s of sections) {
        const tokens = await countTokens(s.text);
        sectionsWithTokens.push({ label: s.label, tokens });
        total += tokens;
    }
    const result = { total, sections: sectionsWithTokens };
    if (myGeneration === rebuildGeneration) { settings.prompt.lastTokens = result; saveSettings(); }
    return result;
}

/** เวอร์ชัน debounce — ใช้ตอนผู้ใช้พิมพ์แก้ prompt หรือติ๊กอัลบั้มถี่ๆ กันยิง countTokens รัว */
export function scheduleRebuildInjection(delay = 300) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        rebuildInjection().catch((e) => console.error("[tinysocial] rebuildInjection ล้มเหลว:", e));
    }, delay);
}

/** ปิดสวิตช์หลัก/ปิด extension — ล้าง extension prompt ทันทีไม่ต้องรอ debounce */
export function clearInjection() {
    clearTimeout(debounceTimer);
    const ctx = getContext();
    ctx.setExtensionPrompt(EXT_PROMPT_KEY, "", 0, 0, false, 0);
    const settings = getSettings();
    settings.prompt.lastTokens = { total: 0, sections: [] };
    saveSettings();
}
