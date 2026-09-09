// render/shared.js — ตัวช่วยที่ใช้ร่วมกันทุก renderer (x.js, chat.js, instagram.js ในสเตจ 4)

import { power_user } from "../../../../../power-user.js";
import { getSettings, imageUrlToSrc } from "../store.js";

export function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}

/** ถอด HTML entity ที่ AI อาจพิมพ์มาเอง (เช่น &gt; แทน >) ก่อนแสดงผล — เรียกก่อน escapeHtml เสมอ ไม่ใช่หลัง */
export function decodeEntities(str) {
    const ta = document.createElement("textarea");
    ta.innerHTML = String(str ?? "");
    return ta.value;
}

/** decode ก่อน escape เสมอ — ใช้กับข้อความ/ค่าฟิลด์ทุกตัวก่อนแทรกลง HTML */
export function escText(str) {
    return escapeHtml(decodeEntities(str));
}

/** หา image record จาก slug ที่ AI พิมพ์มา — ยอมรับความคลาดเคลื่อน 4 ชั้น
 *  ตรงเป๊ะ → ไม่สนตัวพิมพ์ → ตัดอักขระที่ไม่ใช่ a-z0-9 → ชื่อ (name) ตรง */
export function resolveSlug(slug, kind) {
    if (!slug) return null;
    const settings = getSettings();
    const pool = Object.values(settings.images).filter((i) => !kind || i.kind === kind);
    const exact = pool.find((i) => i.slug === slug);
    if (exact) return exact;
    const lower = String(slug).toLowerCase();
    const ci = pool.find((i) => i.slug.toLowerCase() === lower);
    if (ci) return ci;
    const stripped = lower.replace(/[^a-z0-9]/g, "");
    if (stripped) {
        const alnum = pool.find((i) => i.slug.toLowerCase().replace(/[^a-z0-9]/g, "") === stripped);
        if (alnum) return alnum;
    }
    const byName = pool.find((i) => i.name && i.name.toLowerCase() === lower);
    if (byName) return byName;
    return null;
}

function isExternalUrl(url) {
    return /^https?:\/\//i.test(url);
}

/** คืน src ที่ปลอดภัยให้ <img>: รูปในคลังของเราใช้ได้เสมอ, รูปนอก (legacy catbox) ต้องเช็ค forbid_external_media เอง
 *  เพราะ HTML ที่เราแทรกเองไม่ผ่าน DOMPurify ของ ST เลย — ข้ามการเช็คปกติไปหมด ต้องบังคับเองที่นี่ */
export function safeMediaSrc(url) {
    if (!url) return null;
    if (isExternalUrl(url)) {
        return power_user?.forbid_external_media ? null : url;
    }
    return imageUrlToSrc(url);
}

/** กล่อง placeholder เส้นประ — ใช้แทนรูปที่หาไม่เจอ/ถูกบล็อก กันไม่ให้ scene ดูพังทั้งที่ยังอ่านได้ */
export function placeholderBox(label, height = "200px") {
    return `<div class="tinysocial-placeholder" style="--tinysocial-ph-h:${escapeHtml(height)};">
        <i class="fa-regular fa-image"></i>
        <span>[${escapeHtml(label || "image")}]</span>
    </div>`;
}

/**
 * แก้ปัญหารูปให้ renderer เรียกจุดเดียว: จาก slug ในคลัง (ลำดับแรก) หรือ URL ภายนอก (legacy catbox) หรือคำบรรยาย (legacy placeholder)
 * @returns {{html:string, found:object|null}|null} null = ไม่มีข้อมูลรูปเลย (ไม่ต้อง render กล่องรูป)
 */
export function resolveMedia({ slug, external, placeholder, kind = "photo", height } = {}) {
    if (slug) {
        const found = resolveSlug(slug, kind);
        if (found) {
            const src = safeMediaSrc(found.url);
            if (src) return { html: `<img src="${escapeHtml(src)}" alt="${escapeHtml(found.name)}" loading="lazy">`, found };
        }
        return { html: placeholderBox(slug, height), found: null };
    }
    if (external) {
        const src = safeMediaSrc(external);
        if (src) return { html: `<img src="${escapeHtml(src)}" alt="" loading="lazy">`, found: null };
        return { html: placeholderBox("external image blocked", height), found: null };
    }
    if (placeholder) return { html: placeholderBox(placeholder, height), found: null };
    return null;
}

export function formatCount(n) {
    const num = Number(n);
    if (!n || !Number.isFinite(num)) return n ? escapeHtml(String(n)) : "0";
    if (num < 1000) return String(num);
    if (num < 1_000_000) return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}K`;
    return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`;
}
