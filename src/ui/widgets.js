// widgets.js — ตัวช่วย UI เล็กๆ ที่ใช้ซ้ำได้ทั่วทั้ง extension

import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from "../../../../../popup.js";
import { listConnectionProfiles, profileSupportsVision } from "../api.js";

// native prompt()/confirm() ใช้ไม่ได้แน่นอนถ้า ST ถูกห่อด้วย webview (เช่น Tauri) — ใช้กล่องของ ST เองเสมอ
export async function promptText(title, defaultValue = "") {
    const value = await callGenericPopup(title, POPUP_TYPE.INPUT, defaultValue);
    if (value === false || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
}

export async function confirmAction(title) {
    const result = await callGenericPopup(title, POPUP_TYPE.CONFIRM);
    return result === POPUP_RESULT.AFFIRMATIVE;
}

export async function showText(title, text) {
    const pre = document.createElement("pre");
    pre.className = "tinysocial-preview-pre";
    pre.textContent = text;
    await callGenericPopup(pre, POPUP_TYPE.TEXT, "", { wide: true, large: true });
}

export function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}

/** ตัวเลือก Connection Profile ให้ใส่ใน <select> — ตัวแรกเสมอคือ "ใช้ API หลักของ ST" (value="") */
export function connectionProfileOptionsHtml(selectedId) {
    const profiles = listConnectionProfiles();
    let html = `<option value="">ใช้ API หลักของ SillyTavern</option>`;
    for (const p of profiles) {
        if (!p?.id) continue;
        const vision = profileSupportsVision(p.id);
        const label = `${p.name || p.id}${vision ? "" : " (Text Completion)"}`;
        html += `<option value="${escapeHtml(p.id)}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }
    return html;
}
