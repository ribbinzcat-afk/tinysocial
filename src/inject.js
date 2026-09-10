// inject.js — pipeline หลัก: อ่าน raw mes → parse → render การ์ดจริงลง .mes_text → คืนสภาพเมื่อปิดสวิตช์
// ห้ามอ่าน DOM ที่ render แล้ว (DOMPurify กินแท็กของเราไปหมดแล้วตอนนั้น) ต้องอ่าน ctx.chat[i].mes ดิบเสมอ

import { getContext } from "../../../../extensions.js";

import { getSettings } from "./store.js";
import { parseMessage, groupRuns, hasAnyTag } from "./parser.js";
import { renderCard, renderGroup } from "./render/index.js";

const MARK_ATTR = "tinysocial";
let queued = new Set();
let rafHandle = null;

// เคยลองกัน render ระหว่างสตรีมด้วยธง isStreaming (ตั้งตอน GENERATION_STARTED ปิดตอน GENERATION_ENDED/STOPPED)
// แต่ยืนยันจากซอร์ส ST แล้วว่า GENERATION_STARTED ยิง "ทุกครั้งแม้ generation จะถูกยกเลิกกลางทาง" (script.js) และ
// เจอจริงว่าหลาย path (เช่น dry-run เช็คสถานะ API ตอนบูตของหน้า welcome, คำสั่ง slash ที่ถูกขัดจังหวะ) ไม่ยิง
// ENDED/STOPPED กลับมาเลย ทำให้ isStreaming ค้าง true ถาวรและ render หยุดทำงานทั้งหมด — แม้จะใส่ safety timeout
// ก็ยังเจอ GENERATION_STARTED ยิงซ้ำเรื่อยๆ จนล็อกค้างอยู่ดี จึงตัดออกทั้งหมด: 4 event ที่ queueRender ฟัง
// (CHARACTER_MESSAGE_RENDERED/USER_MESSAGE_RENDERED/MESSAGE_UPDATED/MESSAGE_SWIPED) ไม่มีตัวไหนยิงระหว่างสตรีม
// จริงอยู่แล้ว (CHARACTER_MESSAGE_RENDERED ยิงหลังสตรีมจบเท่านั้น) จึงไม่จำเป็นต้องกันซ้ำ — อย่างมากที่สุดถ้า
// MutationObserver ไปเจอ DOM ที่สร้างขึ้นระหว่างสตรีมจริงๆ ก็แค่ขึ้นข้อความเดิมชั่วคราว (parser ไม่ทำ HTML พัง)
// ซึ่งดีกว่าค้างถาวรมาก

function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h.toString(36);
}

function enabledPlatforms(settings) {
    return Object.entries(settings.platforms).filter(([, p]) => p.enabled).map(([k]) => k);
}

function findMesText(mesId) {
    const el = document.querySelector(`#chat .mes[mesid="${mesId}"] .mes_text`);
    return el || null;
}

function restoreMessage(ctx, mesId) {
    const el = findMesText(mesId);
    if (!el || !el.dataset[MARK_ATTR]) return;
    const mes = ctx.chat?.[mesId];
    if (mes) {
        try { ctx.updateMessageBlock(mesId, mes); } catch (e) { console.warn("[tinysocial] updateMessageBlock ล้มเหลว:", e); }
    }
    const restored = findMesText(mesId);
    if (restored) delete restored.dataset[MARK_ATTR];
}

/** render ข้อความเดียว — idempotent ผ่าน hash(raw + settingsRev) กันสร้าง DOM ซ้ำตอน MutationObserver ยิงถี่ */
export function renderMessage(mesId) {
    const settings = getSettings();
    const ctx = getContext();
    const mes = ctx.chat?.[mesId];
    if (!mes) return;

    if (!settings.enabled) { restoreMessage(ctx, mesId); return; }

    const platforms = enabledPlatforms(settings);
    const raw = mes.extra?.display_text ?? mes.mes ?? "";

    if (!hasAnyTag(raw, platforms)) { restoreMessage(ctx, mesId); return; }

    const el = findMesText(mesId);
    if (!el) return;

    const hash = `${fnv1a(raw)}:${settings.settingsRev}`;
    if (el.dataset[MARK_ATTR] === hash) return;

    const runs = groupRuns(parseMessage(raw, platforms));
    const frag = document.createDocumentFragment();

    for (const run of runs) {
        if (run.type === "text") {
            if (!run.text || !run.text.trim()) continue;
            const div = document.createElement("div");
            div.className = "tinysocial-text";
            div.innerHTML = ctx.messageFormatting(run.text, mes.name, mes.is_system, mes.is_user, mesId, {}, false);
            frag.appendChild(div);
        } else if (run.type === "chat_thread" || run.type === "stream_chat_thread") {
            const node = renderGroup(run.type, run.items, mes);
            if (node) frag.appendChild(node);
        } else if (run.type === "card") {
            const node = renderCard(run, mes);
            if (node) frag.appendChild(node);
            else if (run.raw) frag.appendChild(document.createTextNode(run.raw)); // แท็กไม่มี renderer หรือ parse ไม่ได้ → คงข้อความเดิมไว้
        }
    }

    el.replaceChildren(frag);
    el.dataset[MARK_ATTR] = hash;

    try {
        const mesEl = el.closest(".mes");
        if (mesEl) ctx.addCopyToCodeBlocks?.($(mesEl));
    } catch (e) { /* ไม่ใช่ตัวบล็อกงาน — เงียบไว้พอ */ }
}

export function renderAll() {
    document.querySelectorAll("#chat .mes[mesid]").forEach((mesEl) => {
        const mesId = Number(mesEl.getAttribute("mesid"));
        if (Number.isFinite(mesId)) renderMessage(mesId);
    });
}

function flushQueue() {
    rafHandle = null;
    const ids = Array.from(queued);
    queued.clear();
    for (const id of ids) renderMessage(id);
}

/** รวบหลาย render ที่ยิงรัวๆ (event หลายตัวในเฟรมเดียว) ให้เหลือ requestAnimationFrame เดียว */
export function queueRender(mesId) {
    queued.add(mesId);
    if (rafHandle === null) rafHandle = requestAnimationFrame(flushQueue);
}

/** ปิดสวิตช์หลัก / ปิด extension ชั่วคราว — คืนสภาพทุกข้อความที่เราแทรกไว้กลับเป็นของ ST ปกติเป๊ะ ไม่เหลืออะไรค้าง */
export function teardownAllMessages() {
    const ctx = getContext();
    document.querySelectorAll(`#chat .mes_text[data-${MARK_ATTR}]`).forEach((el) => {
        const mesEl = el.closest(".mes[mesid]");
        const mesId = mesEl ? Number(mesEl.getAttribute("mesid")) : null;
        if (mesId !== null && Number.isFinite(mesId)) restoreMessage(ctx, mesId);
    });
    if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
    queued.clear();
}
