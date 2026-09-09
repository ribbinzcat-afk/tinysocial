// api.js — ที่เดียวที่ยิง generation ของทั้ง extension: นับโทเคน, list/ตรวจ Connection Profile, บรรยายรูปด้วย AI

import { getContext } from "../../../../extensions.js";
import { ConnectionManagerRequestService, getMultimodalCaption } from "../../../../extensions/shared.js";

import { getPrompt } from "./prompts.js";

/** นับโทเคนด้วย tokenizer ของ ST เอง (ให้ตัวเลขตรงกับที่ ST รายงานจริง) — fallback chars/4 ถ้าเวอร์ชันไม่มีให้ */
export async function countTokens(text) {
    const str = String(text || "");
    if (!str) return 0;
    const ctx = getContext();
    try {
        if (typeof ctx.getTokenCountAsync === "function") {
            const n = await ctx.getTokenCountAsync(str);
            if (typeof n === "number" && n >= 0) return n;
        }
    } catch (e) { console.warn("[tinysocial] getTokenCountAsync ล้มเหลว:", e); }
    try {
        if (typeof ctx.getTokenCount === "function") {
            const n = ctx.getTokenCount(str);
            if (typeof n === "number" && n >= 0) return n;
        }
    } catch (e) { console.warn("[tinysocial] getTokenCount ล้มเหลว:", e); }
    return Math.ceil(str.length / 4);
}

export function listConnectionProfiles() {
    try {
        return getContext().extensionSettings?.connectionManager?.profiles || [];
    } catch {
        return [];
    }
}

export function getConnectionProfile(profileId) {
    if (!profileId) return null;
    return listConnectionProfiles().find((p) => p.id === profileId) || null;
}

/** true = โปรไฟล์นี้เป็นสาย Chat Completion (มีโอกาสรองรับ vision) — Text Completion ไม่รองรับ image input แน่นอน */
export function profileSupportsVision(profileId) {
    const profile = getConnectionProfile(profileId);
    if (!profile?.api) return false;
    try {
        const map = getContext().CONNECT_API_MAP?.[profile.api];
        return map?.selected === "openai";
    } catch {
        return false;
    }
}

async function urlToDataUrl(url) {
    const blob = await (await fetch(url)).blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("อ่านไฟล์รูปไม่สำเร็จ"));
        reader.readAsDataURL(blob);
    });
}

/**
 * ให้ AI ช่วยบรรยายรูป — ใช้ Connection Profile ที่เลือกไว้ (ถ้ามี, ต้องเป็นสาย Chat Completion)
 * ไม่เลือก profile → fallback ไปตั้งค่า Image Captioning หลักของ ST (Extensions > Image Captioning)
 * @param {string} imageUrl path/URL ของรูป (relative ก็ได้ — fetch ใช้ origin ปัจจุบันเสมอ)
 * @param {{profileId?: string, maxTokens?: number}} [opts]
 * @returns {Promise<{text: string, via: "profile"|"st-default", promptTokens: number}>}
 */
export async function describeImage(imageUrl, { profileId, maxTokens = 300 } = {}) {
    const dataUrl = await urlToDataUrl(imageUrl);
    const prompt = getPrompt("vision_caption");
    const promptTokens = await countTokens(prompt);

    if (profileId) {
        if (!profileSupportsVision(profileId)) {
            throw new Error("โปรไฟล์นี้เป็นสาย Text Completion — ไม่รองรับการส่งรูป เลือกโปรไฟล์สาย Chat Completion แทน");
        }
        const messages = [{
            role: "user",
            content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl } },
            ],
        }];
        const res = await ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens);
        const text = (res && typeof res.content === "string") ? res.content.trim() : "";
        if (!text) throw new Error("โปรไฟล์ที่เลือกตอบว่าง");
        return { text, via: "profile", promptTokens };
    }

    const caption = await getMultimodalCaption(dataUrl, prompt);
    const text = String(caption || "").trim();
    if (!text) throw new Error("Image Captioning หลักของ ST ตอบว่าง");
    return { text, via: "st-default", promptTokens };
}
