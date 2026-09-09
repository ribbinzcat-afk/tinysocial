// store.js — deps = 0 (นอกจาก extension_settings / saveSettingsDebounced ของ ST เอง)
// ที่เดียวที่รู้จักรูปร่างของ extension_settings.tinysocial — ทุกไฟล์อื่นเรียกผ่านฟังก์ชันที่นี่เท่านั้น

import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";

export const extensionName = "tinysocial";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

export const defaultSettings = {
    version: 1,
    enabled: true,
    settingsRev: 0,

    // ---- คลังรูป (Global) ----
    images: {},        // Record<id, TsImage>
    albums: {},         // Record<id, TsAlbum>

    // ---- โปรไฟล์ ผูก identity ----
    profiles: {
        character: {},   // key = characters[i].avatar
        persona: {},      // key = user_avatar
        group: {},        // จองไว้รอบ 2
    },

    // ---- รายแพลตฟอร์ม ----
    platforms: {
        x: { enabled: true, theme: "dark", docsInPrompt: true, exposeAlbumIds: [] },
        instagram: { enabled: true, theme: "dark", docsInPrompt: true, exposeAlbumIds: [] },
        chat: { enabled: true, theme: "light", docsInPrompt: true, exposeAlbumIds: [] },
        stream: { enabled: false, theme: "dark", docsInPrompt: false, exposeAlbumIds: [] },
    },

    prompt: {
        injectEnabled: true,
        position: 0,   // extension_prompt_types.IN_PROMPT
        depth: 1,
        role: 0,       // extension_prompt_roles.SYSTEM
        scan: false,
        templates: {},
        lastTokens: { total: 0, sections: [] },
    },

    api: {
        connectionProfileId: "",
        visionMaxTokens: 300,
    },

    ui: {
        activeTab: "library",
        activeAlbumId: null,
        loadWebFonts: true,
        fontMode: "custom", // "custom" = Sarabun/Kanit ของ TinySocial เอง | "system" = ตามธีม ST / Font Manager (var(--mainFontFamily))
    },
};

function deepMerge(target, defaults) {
    for (const key of Object.keys(defaults)) {
        const defVal = defaults[key];
        if (target[key] === undefined) {
            target[key] = structuredClone(defVal);
        } else if (
            defVal && typeof defVal === "object" && !Array.isArray(defVal) &&
            target[key] && typeof target[key] === "object" && !Array.isArray(target[key])
        ) {
            deepMerge(target[key], defVal);
        }
    }
    return target;
}

export function getSettings() {
    let current = extension_settings[extensionName];
    if (!current || Object.keys(current).length === 0) {
        extension_settings[extensionName] = structuredClone(defaultSettings);
        return extension_settings[extensionName];
    }
    deepMerge(current, defaultSettings);
    return current;
}

export const saveSettings = () => saveSettingsDebounced();

/** เรียกทุกครั้งที่มีการเปลี่ยนแปลงที่กระทบภาพ (รูป/อัลบั้ม/โปรไฟล์/ธีม) — ใช้เป็นส่วนหนึ่งของ idempotency hash ตอน render */
export function bumpRev() {
    getSettings().settingsRev = (getSettings().settingsRev || 0) + 1;
    saveSettings();
}

function genId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
export const genImageId = () => genId("img");
export const genAlbumId = () => genId("alb");

/** path ที่ /api/images/upload คืนมามี "/" นำหน้าอยู่แล้ว (เช่น "/user/images/tinysocial/x.png") —
 *  ห้ามเติม "/" ซ้ำ (จะกลายเป็น "//user/..." ซึ่งเบราว์เซอร์ตีความเป็น protocol-relative URL ไปคนละโฮสต์) */
export function imageUrlToSrc(url) {
    if (!url) return "";
    return url.startsWith("/") ? url : `/${url}`;
}

// ==================== slug ====================
// slug คือชื่อที่ AI ใช้อ้างถึงรูปในแท็ก (img="beach01") ต้องไม่ซ้ำกันทั้งคลัง

export function slugify(str) {
    const base = String(str || "")
        .normalize("NFKD").replace(/[̀-ͯ]/g, "")   // ตัด diacritics
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32)
        .replace(/^-+|-+$/g, "");
    return base || `img-${Date.now().toString(36)}`;
}

export function isSlugTaken(slug, excludeImageId) {
    return Object.values(getSettings().images).some((img) => img.id !== excludeImageId && img.slug === slug);
}

export function ensureUniqueSlug(candidate, excludeImageId) {
    let slug = slugify(candidate);
    let n = 2;
    while (isSlugTaken(slug, excludeImageId)) {
        const suffix = `-${n++}`;
        slug = `${slugify(candidate).slice(0, 32 - suffix.length)}${suffix}`;
    }
    return slug;
}

// ==================== images ====================

export function addImage({ kind, url, name, w = 0, h = 0 }) {
    const settings = getSettings();
    const id = genImageId();
    const label = name || url.split("/").pop().replace(/\.[^/.]+$/, "");
    settings.images[id] = {
        id,
        slug: ensureUniqueSlug(label, id),
        kind: kind === "sticker" ? "sticker" : "photo",
        url,
        name: label,
        desc: "",
        descSource: "",
        w, h,
        addedAt: Date.now(),
    };
    saveSettings();
    bumpRev();
    return settings.images[id];
}

/** ลบแค่ข้อมูลในการตั้งค่า (ไม่ยุ่งกับไฟล์บนดิสก์ — ผู้เรียกที่ src/library.js เป็นคนสั่งลบไฟล์ก่อนเรียกฟังก์ชันนี้) */
export function removeImageRecord(imageId) {
    const settings = getSettings();
    const img = settings.images[imageId];
    if (!img) return null;
    delete settings.images[imageId];
    for (const album of Object.values(settings.albums)) {
        album.imageIds = album.imageIds.filter((id) => id !== imageId);
    }
    for (const scope of Object.values(settings.profiles)) {
        for (const profile of Object.values(scope)) {
            if (profile.avatarImageId === imageId) profile.avatarImageId = "";
            for (const ov of Object.values(profile.overrides || {})) {
                if (ov.avatarImageId === imageId) ov.avatarImageId = "";
            }
        }
    }
    saveSettings();
    bumpRev();
    return img;
}

export function setImageSlug(imageId, newSlug) {
    const settings = getSettings();
    const img = settings.images[imageId];
    if (!img) return null;
    img.slug = ensureUniqueSlug(newSlug, imageId);
    saveSettings();
    bumpRev();
    return img;
}

export function setImageFields(imageId, patch) {
    const settings = getSettings();
    const img = settings.images[imageId];
    if (!img) return null;
    Object.assign(img, patch);
    saveSettings();
    bumpRev();
    return img;
}

export function listImages({ kind } = {}) {
    const all = Object.values(getSettings().images).sort((a, b) => b.addedAt - a.addedAt);
    return kind ? all.filter((i) => i.kind === kind) : all;
}

export function getImage(imageId) {
    return getSettings().images[imageId] || null;
}

// ==================== albums ====================

export function addAlbum({ name, kind = "photo", note = "" }) {
    const settings = getSettings();
    const id = genAlbumId();
    settings.albums[id] = { id, name: name || "อัลบั้มใหม่", kind, imageIds: [], note };
    saveSettings();
    bumpRev();
    return settings.albums[id];
}

export function renameAlbum(albumId, name) {
    const settings = getSettings();
    const album = settings.albums[albumId];
    if (!album) return null;
    album.name = name;
    saveSettings();
    return album;
}

export function setAlbumNote(albumId, note) {
    const settings = getSettings();
    const album = settings.albums[albumId];
    if (!album) return null;
    album.note = note;
    saveSettings();
    return album;
}

export function removeAlbum(albumId) {
    const settings = getSettings();
    if (!settings.albums[albumId]) return;
    delete settings.albums[albumId];
    for (const platform of Object.values(settings.platforms)) {
        platform.exposeAlbumIds = platform.exposeAlbumIds.filter((id) => id !== albumId);
    }
    saveSettings();
    bumpRev();
}

export function addImageToAlbum(albumId, imageId) {
    const settings = getSettings();
    const album = settings.albums[albumId];
    if (!album || !settings.images[imageId]) return null;
    if (!album.imageIds.includes(imageId)) album.imageIds.push(imageId);
    saveSettings();
    bumpRev();
    return album;
}

export function removeImageFromAlbum(albumId, imageId) {
    const settings = getSettings();
    const album = settings.albums[albumId];
    if (!album) return null;
    album.imageIds = album.imageIds.filter((id) => id !== imageId);
    saveSettings();
    bumpRev();
    return album;
}

export function listAlbums({ kind } = {}) {
    const all = Object.values(getSettings().albums).sort((a, b) => a.name.localeCompare(b.name));
    return kind ? all.filter((a) => a.kind === kind) : all;
}

export function getAlbum(albumId) {
    return getSettings().albums[albumId] || null;
}

export function getAlbumImages(albumId) {
    const settings = getSettings();
    const album = settings.albums[albumId];
    if (!album) return [];
    return album.imageIds.map((id) => settings.images[id]).filter(Boolean);
}

// ==================== profiles ====================
// scope: "character" | "persona" | "group"   key: avatar filename (character/persona) หรือ group id

function emptyProfile() {
    return {
        displayName: "",
        handle: "",
        avatarImageId: "",
        bio: "",
        overrides: {
            x: { displayName: "", handle: "", avatarImageId: "", verified: false },
            instagram: { displayName: "", handle: "", avatarImageId: "" },
            chat: { displayName: "", handle: "", avatarImageId: "" },
        },
    };
}

/** คืนโปรไฟล์ที่มีอยู่ หรือ shape ว่างเปล่า (ยังไม่ถูกบันทึกจนกว่าจะแก้ไขจริงผ่าน setProfileField) */
export function getProfile(scope, key) {
    if (!key) return emptyProfile();
    const settings = getSettings();
    return settings.profiles[scope]?.[key] || emptyProfile();
}

export function hasProfile(scope, key) {
    return Boolean(key && getSettings().profiles[scope]?.[key]);
}

/** patch ระดับบนสุด เช่น {displayName, handle, avatarImageId, bio}
 *  หรือระดับ override: setProfileField(scope, key, {overrides: {x: {handle: "..."}}}) */
export function setProfileField(scope, key, patch) {
    if (!key) return null;
    const settings = getSettings();
    if (!settings.profiles[scope]) settings.profiles[scope] = {};
    if (!settings.profiles[scope][key]) settings.profiles[scope][key] = emptyProfile();
    const profile = settings.profiles[scope][key];

    if (patch.overrides) {
        for (const [platform, ov] of Object.entries(patch.overrides)) {
            profile.overrides[platform] = { ...profile.overrides[platform], ...ov };
        }
        const { overrides, ...rest } = patch;
        Object.assign(profile, rest);
    } else {
        Object.assign(profile, patch);
    }
    saveSettings();
    bumpRev();
    return profile;
}

export function renameProfileKey(scope, oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey) return;
    const settings = getSettings();
    const bucket = settings.profiles[scope];
    if (!bucket || !bucket[oldKey]) return;
    bucket[newKey] = bucket[oldKey];
    delete bucket[oldKey];
    saveSettings();
    bumpRev();
}

export function deleteProfileKey(scope, key) {
    const settings = getSettings();
    const bucket = settings.profiles[scope];
    if (!bucket || !bucket[key]) return;
    delete bucket[key];
    saveSettings();
    bumpRev();
}

export function listProfileKeys(scope) {
    return Object.keys(getSettings().profiles[scope] || {});
}

// ==================== integrity ====================

/** เรียกตอน boot — ล้างข้อมูลค้างที่อ้างถึงของที่ไม่มีอยู่แล้ว */
export function sweepIntegrity() {
    const settings = getSettings();
    let changed = false;

    for (const album of Object.values(settings.albums)) {
        const before = album.imageIds.length;
        album.imageIds = album.imageIds.filter((id) => settings.images[id]);
        if (album.imageIds.length !== before) changed = true;
    }

    for (const platform of Object.values(settings.platforms)) {
        const before = platform.exposeAlbumIds.length;
        platform.exposeAlbumIds = platform.exposeAlbumIds.filter((id) => settings.albums[id]);
        if (platform.exposeAlbumIds.length !== before) changed = true;
    }

    for (const scope of Object.values(settings.profiles)) {
        for (const profile of Object.values(scope)) {
            if (profile.avatarImageId && !settings.images[profile.avatarImageId]) {
                profile.avatarImageId = "";
                changed = true;
            }
            for (const ov of Object.values(profile.overrides || {})) {
                if (ov.avatarImageId && !settings.images[ov.avatarImageId]) {
                    ov.avatarImageId = "";
                    changed = true;
                }
            }
        }
    }

    for (const img of Object.values(settings.images)) {
        if (!img.slug) {
            img.slug = ensureUniqueSlug(img.name || img.id, img.id);
            changed = true;
        }
    }

    if (changed) saveSettings();
}
