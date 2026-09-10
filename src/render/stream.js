// render/stream.js — การ์ดสไตล์โอเวอร์เลย์ไลฟ์สตรีม (หัวข้อ/แชทสด/โดเนท/สมาชิกใหม่/ไลก์/ไฮไลท์คอมเมนต์/สรุปจบสตรีม)
// "name" ในแท็กกลุ่มนี้คือชื่อผู้ชมที่ AI ตั้งขึ้นสดๆ ไม่ใช่ตัวตนที่ผูกโปรไฟล์ไว้ — ไม่ผ่าน resolveProfile() เลย
// สีไอคอนคงที่ตามประเภทการแจ้งเตือน (ไม่ให้ AI เลือกเอง กันพลาด) ยกเว้นสีชื่อในแชทสดที่สุ่มจาก hash ของชื่อให้แยกคนง่าย

import { getSettings } from "../store.js";
import { resolveTheme } from "../theme.js";
import { escText } from "./shared.js";

const NAME_PALETTE = ["#F87171", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA", "#F472B6", "#38BDF8", "#FB923C"];

function colorForName(name) {
    const str = String(name || "");
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return NAME_PALETTE[hash % NAME_PALETTE.length];
}

function initialOf(name) {
    return escText(String(name || "?").trim().slice(0, 1).toUpperCase());
}

function streamTheme() {
    return resolveTheme(getSettings().platforms.stream.theme);
}

function makeCard(className, theme) {
    const div = document.createElement("div");
    div.className = className;
    div.dataset.tinysocialTheme = theme;
    return div;
}

export function renderStreamTitle(model) {
    const f = model.fields;
    const div = makeCard("tinysocial-stream-card tinysocial-stream-title", streamTheme());
    div.innerHTML = `
        <div class="tinysocial-stream-title-bar">
            <div class="tinysocial-stream-live-badge">LIVE</div>
            <div class="tinysocial-stream-title-scroll">
                <div class="tinysocial-stream-title-track">${escText(f.title || "")}</div>
            </div>
            <div class="tinysocial-stream-title-stats">
                ${f.viewers ? `<span><i class="fa-solid fa-eye"></i> ${escText(f.viewers)}</span>` : ""}
                ${f.likes ? `<span><i class="fa-solid fa-heart"></i> ${escText(f.likes)}</span>` : ""}
            </div>
        </div>`;
    return div;
}

function notifRow(iconHtml, accentColor, labelHtml, subHtml, timeText) {
    return `
        <div class="tinysocial-stream-icon" style="background:${accentColor};">${iconHtml}</div>
        <div class="tinysocial-stream-body">
            ${labelHtml}
            ${subHtml}
            ${timeText ? `<div class="tinysocial-stream-time">${escText(timeText)}</div>` : ""}
        </div>`;
}

export function renderStreamMember(model) {
    const f = model.fields;
    const color = "#A78BFA";
    const div = makeCard("tinysocial-stream-card tinysocial-stream-notif", streamTheme());
    div.style.setProperty("--tns-stream-accent", color);
    div.innerHTML = notifRow(
        `<span>${initialOf(f.name)}</span>`, color,
        `<div class="tinysocial-stream-label" style="color:${color};">NEW MEMBER</div>`,
        `<div class="tinysocial-stream-sub"><b>${escText(f.name || "")}</b> สมัครสมาชิกแล้ว!</div>`,
        f.time,
    );
    return div;
}

export function renderStreamDono(model) {
    const f = model.fields;
    const color = "#FBBF24";
    const div = makeCard("tinysocial-stream-card tinysocial-stream-notif", streamTheme());
    div.style.setProperty("--tns-stream-accent", color);
    div.innerHTML = notifRow(
        `<span>${initialOf(f.name)}</span>`, color,
        `<div class="tinysocial-stream-label" style="color:${color};">DONATION</div>`,
        `<div class="tinysocial-stream-sub"><b>${escText(f.name || "")}</b> สนับสนุน <b style="color:${color};">${escText(f.amount || "")}</b>${f.message ? `<div class="tinysocial-stream-msg">${escText(f.message)}</div>` : ""}</div>`,
        f.time,
    );
    return div;
}

export function renderStreamLike(model) {
    const f = model.fields;
    const color = "#F91880";
    const div = makeCard("tinysocial-stream-card tinysocial-stream-notif", streamTheme());
    div.style.setProperty("--tns-stream-accent", color);
    div.innerHTML = notifRow(
        `<i class="fa-solid fa-thumbs-up"></i>`, color,
        `<div class="tinysocial-stream-label" style="color:${color};">NEW LIKES</div>`,
        `<div class="tinysocial-stream-sub"><b>${escText(f.name || "")}</b> ถูกใจสิ่งนี้!</div>`,
        f.time,
    );
    return div;
}

export function renderStreamHilight(model) {
    const f = model.fields;
    const color = "#60A5FA";
    const div = makeCard("tinysocial-stream-card tinysocial-stream-notif", streamTheme());
    div.style.setProperty("--tns-stream-accent", color);
    div.innerHTML = notifRow(
        `<i class="fa-solid fa-comment-dots"></i>`, color,
        `<div class="tinysocial-stream-label" style="color:${color};">${escText(f.name || "")}</div>`,
        `<div class="tinysocial-stream-sub">${escText(f.text || "")}</div>`,
        f.time,
    );
    return div;
}

export function renderStreamEnd(model) {
    const f = model.fields;
    const div = makeCard("tinysocial-stream-card tinysocial-stream-end", streamTheme());
    div.innerHTML = `
        <div class="tinysocial-stream-end-title">Stream Ended</div>
        ${f.time ? `<div class="tinysocial-stream-end-sub">${escText(f.time)}</div>` : ""}
        <div class="tinysocial-stream-end-grid">
            <div class="tinysocial-stream-end-stat"><span class="tinysocial-stream-end-label">DURATION</span><span class="tinysocial-stream-end-value" style="color:#A78BFA;">${escText(f.duration || "—")}</span></div>
            <div class="tinysocial-stream-end-stat"><span class="tinysocial-stream-end-label">NEW FOLLOWERS</span><span class="tinysocial-stream-end-value" style="color:#34D399;">${escText(f.followers || "—")}</span></div>
            <div class="tinysocial-stream-end-stat"><span class="tinysocial-stream-end-label">TOTAL VIEWS</span><span class="tinysocial-stream-end-value" style="color:#60A5FA;">${escText(f.views || "—")}</span></div>
            <div class="tinysocial-stream-end-stat"><span class="tinysocial-stream-end-label">DONATIONS</span><span class="tinysocial-stream-end-value" style="color:#FBBF24;">${escText(f.donations || "—")}</span></div>
        </div>
        <div class="tinysocial-stream-end-close">Close Summary</div>`;
    return div;
}

/**
 * กล่อง "LIVE CHAT" สไตล์ overlay — ใช้ร่วมกันทั้งจาก STREAM_COMMENT ที่ parser รวมกลุ่มมาให้ (model.fields ต่อแถว)
 * และจาก ALLCOM แบบเก่า (pairs อยู่ในโมเดลเดียวตั้งแต่ต้น ไม่ผ่านการรวมกลุ่ม)
 * @param {{name:string, text:string}[]} rows
 */
export function renderStreamChatFeed(rows) {
    const div = makeCard("tinysocial-stream-card tinysocial-stream-chatfeed", streamTheme());
    const rowsHtml = rows.map((r) => `
        <div class="tinysocial-stream-chat-row">
            <span class="tinysocial-stream-chat-name" style="color:${colorForName(r.name)};">${escText(r.name || "")}:</span>
            ${escText(r.text || "")}
        </div>`).join("") || `<span class="tinysocial-hint-inline">ยังไม่มีข้อความ</span>`;
    div.innerHTML = `
        <div class="tinysocial-stream-chat-head">
            <span>LIVE CHAT</span>
            <div class="tinysocial-stream-chat-dots"><span></span><span></span><span></span></div>
        </div>
        <div class="tinysocial-stream-chat-body">${rowsHtml}</div>`;
    return div;
}
