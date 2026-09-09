// render/chat.js — กรอบมือถือแบบ LINE + ฟองแชท 6 แบบ (text/sticker/img/voice/location/track) + สลิป/อั่งเปา (ในกรอบ)
// + การ์ดแจ้งเตือนเดี่ยว (call/money/noti) ที่ต้นฉบับออกแบบให้ลอยเดี่ยวเสมอ ไม่ผูกกับกรอบมือถือ

import { resolveProfile } from "../identity.js";
import { getSettings } from "../store.js";
import { resolveTheme } from "../theme.js";
import { escText, resolveMedia } from "./shared.js";

const alignFor = (from) => (from === "user" ? "right" : "left");

function bubbleRow(align, nameLabel, contentHtml, timeLabel) {
    return `<div class="tinysocial-chat-row tinysocial-chat-row-${align}">
        ${nameLabel ? `<span class="tinysocial-chat-namelabel">${escText(nameLabel)}</span>` : ""}
        ${contentHtml}
        ${timeLabel ? `<span class="tinysocial-chat-timelabel">${escText(timeLabel)}</span>` : ""}
    </div>`;
}

function renderMsgContent(f, align) {
    if (f.sticker || f.stickerExternal) {
        const media = resolveMedia({ slug: f.sticker, external: f.stickerExternal, kind: "sticker", height: "140px" });
        return `<div class="tinysocial-chat-sticker">${media ? media.html : ""}</div>`;
    }
    if (f.img || f.imgExternal) {
        const media = resolveMedia({ slug: f.img, external: f.imgExternal, kind: "photo", height: "180px" });
        const text = f.text ? `<p>${escText(f.text)}</p>` : "";
        return `<div class="tinysocial-chat-bubble tinysocial-chat-bubble-${align} tinysocial-chat-imgmsg">${media ? media.html : ""}${text}</div>`;
    }
    if (f.voice) {
        return `<div class="tinysocial-chat-bubble tinysocial-chat-bubble-${align} tinysocial-chat-voice">
            <i class="fa-solid fa-microphone"></i>
            <div class="tinysocial-chat-voicebar"></div>
            <span>${escText(f.voice)}</span>
        </div>`;
    }
    if (f.place) {
        return `<div class="tinysocial-chat-bubble tinysocial-chat-bubble-${align} tinysocial-chat-location">
            <div class="tinysocial-chat-location-icon"><i class="fa-solid fa-location-dot"></i></div>
            <div class="tinysocial-chat-location-text">
                <div class="tinysocial-chat-location-name">${escText(f.place)}</div>
                ${f.address ? `<div class="tinysocial-chat-location-addr">${escText(f.address)}</div>` : ""}
            </div>
        </div>`;
    }
    if (f.track) {
        const media = f.cover ? resolveMedia({ slug: f.cover, kind: "photo", height: "50px" }) : null;
        return `<div class="tinysocial-chat-bubble tinysocial-chat-bubble-${align} tinysocial-chat-track">
            <div class="tinysocial-chat-track-art">${media ? media.html : '<i class="fa-solid fa-music"></i>'}</div>
            <div class="tinysocial-chat-track-info">
                <div class="tinysocial-chat-track-title">${escText(f.track)}</div>
                <div class="tinysocial-chat-track-artist">${escText(f.artist || "")}</div>
            </div>
            <div class="tinysocial-chat-track-play"><i class="fa-solid fa-play"></i></div>
        </div>`;
    }
    return `<div class="tinysocial-chat-bubble tinysocial-chat-bubble-${align}"><p>${escText(f.text || "")}</p></div>`;
}

/** เติม "฿" หน้าจำนวนเงินเสมอ (ยกเว้นว่างเปล่า) — ไม่ยุ่งกับการจัดรูปแบบตัวเลขที่ AI ใส่มา (คอมม่า/ทศนิยม) */
function formatMoney(amount) {
    const value = String(amount ?? "").trim();
    if (!value) return "";
    return value.startsWith("฿") ? value : `฿${value}`;
}

function renderSlipContent(f) {
    return `<div class="tinysocial-chat-slip">
        <div class="tinysocial-chat-slip-head">
            <div class="tinysocial-chat-slip-bank">🏛</div>
            <p class="tinysocial-chat-slip-title">โอนเงินสำเร็จ${f.bank ? ` · ${escText(f.bank)}` : ""}</p>
            <p class="tinysocial-chat-slip-amount">${escText(formatMoney(f.amount))}</p>
            ${(f.date || f.time) ? `<p class="tinysocial-chat-slip-date">${escText(f.date || "")}${f.date && f.time ? " - " : ""}${escText(f.time || "")}</p>` : ""}
        </div>
        <div class="tinysocial-chat-slip-body">
            ${f.payer ? `<div class="tinysocial-chat-slip-row"><span>จาก</span><span>${escText(f.payer)}</span></div>` : ""}
            ${f.to ? `<div class="tinysocial-chat-slip-row"><span>ไปยัง</span><span>${escText(f.to)}</span></div>` : ""}
        </div>
        ${f.note ? `<div class="tinysocial-chat-slip-note"><b>Note:</b> ${escText(f.note)}</div>` : ""}
    </div>`;
}

function renderGiftContent(f) {
    const opened = String(f.opened).toLowerCase() === "true";
    if (!opened) {
        return `<div class="tinysocial-chat-gift tinysocial-chat-gift-closed">
            <div class="tinysocial-chat-gift-icon">🧧</div>
            <div class="tinysocial-chat-gift-text"><span>อั่งเปาของขวัญ</span><small>กดเพื่อเปิดซองของขวัญ</small></div>
        </div>`;
    }
    return `<div class="tinysocial-chat-gift tinysocial-chat-gift-opened">
        <div class="tinysocial-chat-gift-icon">🧧</div>
        <span class="tinysocial-chat-gift-label">คุณได้รับอั่งเปาแล้ว</span>
        <div class="tinysocial-chat-gift-amount">${escText(formatMoney(f.amount))}</div>
        ${f.note ? `<div class="tinysocial-chat-gift-note"><b>Note:</b> ${escText(f.note)}</div>` : `<small>โอนเข้าธนาคารเรียบร้อย</small>`}
    </div>`;
}

function renderThreadItemHtml(model, mes) {
    const f = model.fields;
    const align = alignFor(f.from);
    const profile = resolveProfile("chat", f.from, mes);
    if (model.card === "msg") return bubbleRow(align, profile.displayName, renderMsgContent(f, align), f.time);
    if (model.card === "chat_slip") return bubbleRow(align, profile.displayName, renderSlipContent(f), f.time);
    if (model.card === "chat_gift") return bubbleRow(align, profile.displayName, renderGiftContent(f), f.time);
    return "";
}

/** กรอบมือถือเดียว รับ header (chat_head/chat_title ถ้ามี) + ฟองข้อความเรียงตามลำดับ */
export function renderChatThread(items, mes) {
    const theme = resolveTheme(getSettings().platforms.chat.theme);
    const headerItems = items.filter((it) => it.card === "chat_head" || it.card === "chat_title");
    const bodyItems = items.filter((it) => it.card !== "chat_head" && it.card !== "chat_title");

    let headerHtml = "";
    for (const h of headerItems) {
        if (h.card === "chat_head") {
            const profile = resolveProfile("chat", "char", mes);
            const name = h.fields.name || profile.displayName;
            headerHtml += `<div class="tinysocial-chat-head">
                <div class="tinysocial-chat-head-name">${escText(name)}</div>
                <div class="tinysocial-chat-head-status"><span class="tinysocial-chat-dot"></span>${escText(h.fields.status || "Active now")}</div>
            </div>`;
        } else {
            headerHtml += `<div class="tinysocial-chat-title">${escText(h.fields.title || "")}</div>`;
        }
    }

    const bodyHtml = bodyItems.map((it) => renderThreadItemHtml(it, mes)).join("");
    if (!headerHtml && !bodyHtml) return null;

    const div = document.createElement("div");
    div.className = "tinysocial-chat-thread";
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `${headerHtml}${bodyHtml ? `<div class="tinysocial-chat-body">${bodyHtml}</div>` : ""}`;
    return div;
}

// ==================== การ์ดแจ้งเตือนเดี่ยว (ไม่ผูกกรอบมือถือ) ====================

export function renderChatCall(model) {
    const theme = resolveTheme(getSettings().platforms.chat.theme);
    const f = model.fields;
    const type = ["voice", "video", "missed", "ongoing"].includes(f.type) ? f.type : "voice";
    const iconClass = { voice: "fa-phone-volume", video: "fa-video", missed: "fa-phone-slash", ongoing: "fa-phone" }[type];
    const label = { voice: "สายเรียกเข้า...", video: "วิดีโอคอลเข้า...", missed: "สายที่ไม่ได้รับ", ongoing: "แตะเพื่อกลับไปที่การโทร" }[type];

    const div = document.createElement("div");
    div.className = `tinysocial-chat-notif tinysocial-chat-call tinysocial-chat-call-${type}`;
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `
        <div class="tinysocial-chat-call-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="tinysocial-chat-call-body">
            <div class="tinysocial-chat-call-top">
                <span>${escText(f.who || "")}</span>
                ${f.time ? `<small>${escText(f.time)}</small>` : ""}
            </div>
            <div class="tinysocial-chat-call-sub">${escText(label)}${f.dur ? ` · ${escText(f.dur)}` : ""}${f.note ? ` (${escText(f.note)})` : ""}</div>
        </div>`;
    return div;
}

export function renderChatMoney(model) {
    const theme = resolveTheme(getSettings().platforms.chat.theme);
    const f = model.fields;
    const isIn = f.dir !== "out";

    const div = document.createElement("div");
    div.className = `tinysocial-chat-notif tinysocial-chat-money tinysocial-chat-money-${isIn ? "in" : "out"}`;
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `
        <div class="tinysocial-chat-money-icon"><i class="fa-solid fa-arrow-${isIn ? "down" : "up"}"></i></div>
        <div class="tinysocial-chat-money-body">
            <div class="tinysocial-chat-money-top"><span>Bank App</span>${f.time ? `<small>${escText(f.time)}</small>` : ""}</div>
            <div class="tinysocial-chat-money-sub"><b>${isIn ? "เงินเข้า +" : "-"}${escText(formatMoney(f.amount))}</b><br>${isIn ? "จาก" : "ไปยัง"} ${escText(f.who || "")}</div>
        </div>`;
    return div;
}

export function renderChatNoti(model) {
    const theme = resolveTheme(getSettings().platforms.chat.theme);
    const f = model.fields;

    const div = document.createElement("div");
    div.className = "tinysocial-chat-notif tinysocial-chat-plainnoti";
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `
        <div class="tinysocial-chat-noti-top"><b>${escText(f.who || "")}</b>${f.time ? `<small>${escText(f.time)}</small>` : ""}</div>
        <div class="tinysocial-chat-noti-text">${escText(f.text || "")}</div>`;
    return div;
}
