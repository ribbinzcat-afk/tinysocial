// render/x.js — การ์ดทวีต (X/Twitter) หน้าตาเดียว 3 สภาพ: ข้อความล้วน / รูป+แคปชั่น / รูปล้วน
// รวมแท็กเดิม 5 ตัว (TWEET, TWEET_P, TWEET_L, TWEET_PP, TWEET_LP) ของ regex-social-media-ui-set.json ไว้ที่นี่

import { resolveProfile } from "../identity.js";
import { getSettings } from "../store.js";
import { resolveTheme } from "../theme.js";
import { escapeHtml, escText, resolveMedia, formatCount } from "./shared.js";

export function renderTweet(model, mes) {
    const f = model.fields;
    const profile = resolveProfile("x", f.from, mes);
    const theme = resolveTheme(getSettings().platforms.x.theme);

    const text = f.text ? escText(f.text).trim() : "";
    const media = resolveMedia({ slug: f.img, external: f.imgExternal, placeholder: f.imgPlaceholder, kind: "photo", height: "250px" });

    const avatarHtml = profile.avatarUrl
        ? `<img class="tinysocial-x-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="">`
        : `<div class="tinysocial-x-avatar tinysocial-x-avatar-fallback">${escapeHtml((profile.displayName || "?").trim().slice(0, 1).toUpperCase())}</div>`;

    const div = document.createElement("div");
    div.className = "tinysocial-x-card";
    div.dataset.tinysocialTheme = theme;
    div.innerHTML = `
        <div class="tinysocial-x-head">
            ${avatarHtml}
            <div class="tinysocial-x-headtext">
                <div class="tinysocial-x-names">
                    <span class="tinysocial-x-name">${escText(profile.displayName)}</span>
                    ${profile.verified ? '<i class="fa-solid fa-circle-check tinysocial-x-verified"></i>' : ""}
                    <span class="tinysocial-x-handle">${escText(profile.handle)}</span>
                    ${f.time ? `<span class="tinysocial-x-dot">·</span><span class="tinysocial-x-time">${escText(f.time)}</span>` : ""}
                </div>
            </div>
            <div class="tinysocial-x-more"><i class="fa-solid fa-ellipsis"></i></div>
        </div>
        <div class="tinysocial-x-body">
            ${text ? `<p class="tinysocial-x-text">${text.replace(/\n/g, "<br>")}</p>` : ""}
            ${media ? `<div class="tinysocial-x-media">${media.html}</div>` : ""}
            <div class="tinysocial-x-actions">
                <span><i class="fa-regular fa-comment"></i>${f.replies !== undefined ? ` ${formatCount(f.replies)}` : ""}</span>
                <span><i class="fa-solid fa-retweet"></i>${f.retweets !== undefined ? ` ${formatCount(f.retweets)}` : ""}</span>
                <span class="tinysocial-x-like"><i class="fa-solid fa-heart"></i>${f.likes !== undefined ? ` ${formatCount(f.likes)}` : ""}</span>
                <span><i class="fa-solid fa-chart-simple"></i>${f.views !== undefined ? ` ${formatCount(f.views)}` : ""}</span>
                <span><i class="fa-regular fa-share-from-square"></i></span>
            </div>
        </div>`;
    return div;
}
