// render/instagram.js — โพสต์ / สตอรี่ / คอมเมนต์ Instagram (สเตจ 4)

import { resolveProfile } from "../identity.js";
import { getSettings } from "../store.js";
import { resolveTheme } from "../theme.js";
import { escapeHtml, escText, resolveMedia, formatCount } from "./shared.js";

function avatarHtml(profile, size = 32) {
    return profile.avatarUrl
        ? `<img class="tinysocial-ig-avatar" src="${escapeHtml(profile.avatarUrl)}" style="width:${size}px;height:${size}px;" alt="">`
        : `<div class="tinysocial-ig-avatar tinysocial-ig-avatar-fallback" style="width:${size}px;height:${size}px;">${escText((profile.displayName || "?").trim().slice(0, 1).toUpperCase())}</div>`;
}

function renderCommentRow(model, mes) {
    const f = model.fields;
    const username = f.user || resolveProfile("instagram", f.from, mes).handle;
    return `<div class="tinysocial-ig-comment-row">
        <span class="tinysocial-ig-comment-user">${escText(username)}</span>
        <span class="tinysocial-ig-comment-text">${escText(f.text || "")}</span>
        ${f.likes !== undefined || f.time ? `<div class="tinysocial-ig-comment-meta">${f.time ? `<span>${escText(f.time)}</span>` : ""}${f.likes !== undefined ? `<span>${formatCount(f.likes)} likes</span>` : ""}</div>` : ""}
    </div>`;
}

export function renderIgPost(model, mes) {
    const f = model.fields;
    const profile = resolveProfile("instagram", f.from, mes);
    const theme = resolveTheme(getSettings().platforms.instagram.theme);
    const media = resolveMedia({ slug: f.img, kind: "photo", height: "380px" });
    const caption = f.caption ? escText(f.caption).trim() : "";
    const comments = model.comments || [];

    const div = document.createElement("div");
    div.className = "tinysocial-ig-card";
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `
        <div class="tinysocial-ig-head">
            ${avatarHtml(profile)}
            <div class="tinysocial-ig-headtext">
                <span class="tinysocial-ig-name">${escText(profile.displayName)}</span>
                ${f.location ? `<span class="tinysocial-ig-location">${escText(f.location)}</span>` : ""}
            </div>
            <div class="tinysocial-ig-more"><i class="fa-solid fa-ellipsis"></i></div>
        </div>
        <div class="tinysocial-ig-media">${media ? media.html : ""}</div>
        <div class="tinysocial-ig-actions">
            <span><i class="fa-regular fa-heart"></i></span>
            <span><i class="fa-regular fa-comment"></i></span>
            <span><i class="fa-regular fa-paper-plane"></i></span>
            <span class="tinysocial-ig-bookmark"><i class="fa-regular fa-bookmark"></i></span>
        </div>
        <div class="tinysocial-ig-body">
            ${f.likes !== undefined ? `<div class="tinysocial-ig-likes">${formatCount(f.likes)} likes</div>` : ""}
            ${caption ? `<div class="tinysocial-ig-caption"><span class="tinysocial-ig-name">${escText(profile.displayName)}</span> ${caption}</div>` : ""}
            ${comments.length ? `<div class="tinysocial-ig-comments">${comments.map((c) => renderCommentRow(c, mes)).join("")}</div>` : ""}
            ${f.time ? `<div class="tinysocial-ig-time">${escText(f.time)}</div>` : ""}
        </div>`;
    return div;
}

export function renderIgStory(model, mes) {
    const f = model.fields;
    const profile = resolveProfile("instagram", f.from, mes);
    const theme = resolveTheme(getSettings().platforms.instagram.theme);
    const media = resolveMedia({ slug: f.img, kind: "photo", height: "560px" });

    const div = document.createElement("div");
    div.className = "tinysocial-ig-story";
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `
        <div class="tinysocial-ig-story-media">${media ? media.html : ""}</div>
        <div class="tinysocial-ig-story-overlay">
            <div class="tinysocial-ig-story-bar"><div class="tinysocial-ig-story-bar-fill"></div></div>
            <div class="tinysocial-ig-story-head">
                ${avatarHtml(profile, 28)}
                <span class="tinysocial-ig-story-name">${escText(profile.displayName)}</span>
                ${f.time ? `<span class="tinysocial-ig-story-time">${escText(f.time)}</span>` : ""}
                <div class="tinysocial-ig-story-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            ${f.text ? `<div class="tinysocial-ig-story-text">${escText(f.text)}</div>` : ""}
        </div>`;
    return div;
}

/** IG_COMMENT ที่ไม่มี IG_POST นำหน้า (parser ไม่ได้ผูกให้) — โชว์เป็นแถวคอมเมนต์เดี่ยวกันไว้ ไม่ทิ้งข้อมูล */
export function renderIgCommentStandalone(model, mes) {
    const theme = resolveTheme(getSettings().platforms.instagram.theme);
    const div = document.createElement("div");
    div.className = "tinysocial-ig-card tinysocial-ig-comment-standalone";
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `<div class="tinysocial-ig-body">${renderCommentRow(model, mes)}</div>`;
    return div;
}
