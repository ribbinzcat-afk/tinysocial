// identity.js — หา "ตัวตน" ปัจจุบัน (ตัวละคร/persona) และคลี่โปรไฟล์ที่ผูกไว้ให้เป็นชื่อ/handle/อวาตาร์ที่พร้อมใช้
// AI ไม่ต้องเขียนฟิลด์พวกนี้เอง — เราคลี่ให้ตอน render จาก extension_settings.tinysocial.profiles

import { getContext } from "../../../../extensions.js";
import { user_avatar, getUserAvatar } from "../../../../personas.js";

import { getProfile, getImage, imageUrlToSrc, npcKey } from "./store.js";

/** key ของตัวละครปัจจุบัน = avatar filename (คงที่แม้เปลี่ยนชื่อ เพราะ CHARACTER_RENAMED จะย้าย key ให้เอง) */
export function currentCharacterKey() {
    const ctx = getContext();
    return ctx.characters?.[ctx.characterId]?.avatar || null;
}

export function currentPersonaKey() {
    return user_avatar || null;
}

/** หา avatar filename ของตัวละครจากชื่อ — ใช้ตอนแชทกลุ่มที่ mes.name อาจไม่ใช่ตัวละครที่ active อยู่ */
function findCharacterKeyByName(name) {
    const ctx = getContext();
    const found = ctx.characters?.find((c) => c.name === name);
    return found?.avatar || null;
}

function deriveHandle(name) {
    const slug = String(name || "")
        .toLowerCase()
        .normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "");
    return slug ? `@${slug}` : "@user";
}

/**
 * แปลง from="char"|"user"|"<ชื่อ>" ให้เป็น {scope, key, fallbackName}
 * @param {"char"|"user"|string} from
 * @param {object} mes ข้อความ chat ปัจจุบัน (ctx.chat[i]) ใช้หา owner ตอน from="char" ในแชทกลุ่ม
 */
function resolveIdentityKey(from, mes) {
    const ctx = getContext();
    if (from === "user") {
        return { scope: "persona", key: currentPersonaKey(), fallbackName: ctx.name1 || "User" };
    }
    // from === "char" หรือชื่อเฉพาะ — ถ้าเป็นแชทกลุ่มและชื่อใน mes ไม่ตรงตัวละครที่ active ให้หาโดยชื่อ
    const name = (from && from !== "char") ? from : mes?.name;
    const activeKey = currentCharacterKey();
    if (name && ctx.groupId) {
        const byName = findCharacterKeyByName(name);
        if (byName) return { scope: "character", key: byName, fallbackName: name };
    }
    // ชื่อเฉพาะที่ไม่ใช่ตัวละครหลักที่ active และไม่ใช่ตัวละครในกลุ่ม = NPC ที่ AI เล่าขึ้นมาเอง
    // (ไม่มีการ์ดจริง) ผูกไว้กับตัวละครหลักตัวนี้ — คนละคนกับ "หมอ" ในเรื่องของตัวละครอื่น
    if (name && activeKey && name !== ctx.name2) {
        return { scope: "npc", key: npcKey(activeKey, name), fallbackName: name };
    }
    return { scope: "character", key: activeKey, fallbackName: name || ctx.name2 || "Character" };
}

/** เปิดให้ src/ui/panel.js ใช้แสดงพรีวิวอวาตาร์ตรงๆ โดยไม่ต้องผ่าน resolveProfile ทั้งก้อน */
export function resolveAvatarUrl(imageId, scope, key) {
    if (imageId) {
        const img = getImage(imageId);
        if (img) return imageUrlToSrc(img.url);
    }
    const ctx = getContext();
    if (scope === "character" && key) {
        return ctx.getThumbnailUrl ? ctx.getThumbnailUrl("avatar", key) : `/characters/${encodeURIComponent(key)}`;
    }
    if (scope === "persona" && key) {
        return ctx.getThumbnailUrl ? ctx.getThumbnailUrl("persona", key) : `/${getUserAvatar(key)}`;
    }
    return "";
}

/**
 * คลี่โปรไฟล์เต็มสำหรับแพลตฟอร์มหนึ่ง ๆ พร้อม fallback ครบสาย:
 * override รายแพลตฟอร์ม → ค่าโปรไฟล์กลาง → ชื่อการ์ด/persona จริงของ ST
 * @param {"x"|"instagram"|"chat"} platform
 * @param {"char"|"user"|string} from
 * @param {object} mes
 * @returns {{displayName:string, handle:string, avatarUrl:string, verified:boolean, scope:string, key:string}}
 */
export function resolveProfile(platform, from, mes) {
    const { scope, key, fallbackName } = resolveIdentityKey(from, mes);
    const profile = getProfile(scope, key);
    const ov = profile.overrides?.[platform] || {};

    const displayName = ov.displayName || profile.displayName || fallbackName || "Unknown";
    const handle = ov.handle || profile.handle || deriveHandle(displayName);
    const avatarImageId = ov.avatarImageId || profile.avatarImageId || "";
    const avatarUrl = resolveAvatarUrl(avatarImageId, scope, key);
    const verified = platform === "x" ? Boolean(ov.verified) : false;

    return { displayName, handle, avatarUrl, verified, scope, key };
}
