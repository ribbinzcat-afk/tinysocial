// settings.js — bind ดรอเวอร์ตั้งค่าในหน้า Extensions: สวิตช์/แพลตฟอร์ม/อัลบั้มที่ส่งให้ AI/prompt editor/ตัวนับโทเคน

import { getSettings, saveSettings, bumpRev, listAlbums } from "../store.js";
import { togglePanel } from "./panel.js";
import { renderAll, teardownAllMessages } from "../inject.js";
import { PROMPT_DEFS, getPrompt, setPrompt, resetPrompt, isPromptCustomized } from "../prompts.js";
import { rebuildInjection, clearInjection } from "../promptbuild.js";
import { applyFontMode } from "../theme.js";
import { showText, escapeHtml, connectionProfileOptionsHtml } from "./widgets.js";

export const WAND_BUTTON_ID = "tinysocial-menu-button";

export function syncWandButtonVisibility() {
    const settings = getSettings();
    $(`#${WAND_BUTTON_ID}`).toggle(Boolean(settings.enabled));
}

function renderPlatformAlbums(platform) {
    const settings = getSettings();
    const albums = listAlbums();
    const $container = $(`.tns-platform-block[data-platform="${platform}"] .tns-platform-albums`);
    if (!albums.length) {
        $container.html(`<p class="tns-hint">ยังไม่มีอัลบั้ม — สร้างในแผง TinySocial ก่อน</p>`);
        return;
    }
    const exposed = settings.platforms[platform].exposeAlbumIds;
    const html = albums.map((a) => `
        <label class="checkbox_label tns-album-check-row">
            <input type="checkbox" class="tns-platform-album-check" data-album="${a.id}" ${exposed.includes(a.id) ? "checked" : ""}>
            <span>${escapeHtml(a.name)} <small>(${a.kind === "sticker" ? "สติกเกอร์" : "ภาพถ่าย"}, ${a.imageIds.length} รูป)</small></span>
        </label>`).join("");
    // ไม่เลือกอัลบั้มเลย = AI ไม่รู้จักรูปในคลังแม้แต่ใบเดียว ทั้งที่ docsInPrompt เปิดอยู่ — สาเหตุอันดับ 1 ของ
    // "AI เขียนแท็กแต่ไม่ใส่รูป หรือเดา slug มั่ว" เตือนไว้ตรงจุดที่แก้ได้เลย กันคนงงว่าทำไม AI ไม่ยอมใช้รูป
    const warning = (settings.platforms[platform].docsInPrompt && !exposed.length)
        ? `<p class="tns-hint tns-album-warning"><i class="fa-solid fa-triangle-exclamation"></i> ยังไม่ได้เลือกอัลบั้มให้แพลตฟอร์มนี้เลย — AI จะไม่รู้จักรูปในคลัง เลยไม่ใส่ img หรือเดาชื่อรูปมั่ว</p>`
        : "";
    $container.html(`<div class="tns-section-title tns-album-check-title">ส่งอัลบั้มไหนให้ AI</div>${warning}${html}`);
}

function renderPromptEditors() {
    const $container = $("#tns-prompt-editors");
    const html = PROMPT_DEFS.map((def) => `
        <div class="tns-prompt-editor" data-prompt="${def.id}">
            <div class="tns-prompt-editor-head">
                <label>${escapeHtml(def.label)}</label>
                <button type="button" class="menu_button tns-prompt-reset" ${isPromptCustomized(def.id) ? "" : "disabled"}>คืนค่าเริ่มต้น</button>
            </div>
            <textarea class="text_pole tns-prompt-textarea" rows="3">${escapeHtml(getPrompt(def.id))}</textarea>
        </div>`).join("");
    $container.html(html);
}

// rebuildInjection() เป็น async (นับโทเคนทีละ section) — ถ้าผู้ใช้ติ๊กหลายอันรัวๆ อาจมีหลาย call ค้างพร้อมกัน
// และตัวที่ resolve ทีหลังไม่ใช่ตัวล่าสุดเสมอไป ต้องกันด้วย request id ไม่งั้นตัวเลขที่โชว์จะเก่ากว่าสถานะจริง
let tokenSummaryRequestId = 0;
async function updateTokenSummary() {
    const myId = ++tokenSummaryRequestId;
    const tokens = await rebuildInjection();
    if (myId !== tokenSummaryRequestId) return; // มี call ใหม่กว่าแทรกเข้ามาระหว่างรอ — ทิ้งผลลัพธ์นี้
    const $summary = $("#tns-token-summary");
    if (!tokens.total) {
        $summary.text("โทเคนที่ส่งให้ AI: 0 (ปิดอยู่ หรือยังไม่มีแพลตฟอร์มที่ส่งเอกสารให้ AI)");
        return;
    }
    const breakdown = tokens.sections.map((s) => `${s.label} ${s.tokens}`).join(" / ");
    $summary.text(`โทเคนที่ส่งให้ AI: ${tokens.total} (${breakdown})`);
}

let tokenSummaryTimer = null;
/** debounce กันยิง countTokens รัวตอนพิมพ์ — ใช้กับ input ที่เปลี่ยนถี่ๆ ได้ (prompt textarea) */
function scheduleTokenSummaryUpdate(delay = 350) {
    clearTimeout(tokenSummaryTimer);
    tokenSummaryTimer = setTimeout(updateTokenSummary, delay);
}

/** แสดงแถว "ความลึก" เฉพาะตอนตำแหน่ง = ในประวัติแชท (IN_CHAT) — ตำแหน่งอื่นไม่มีผลอะไรกับความลึกเลย ซ่อนกันงง */
function updateDepthRowVisibility() {
    $("#tns-prompt-depth-row").toggle($("#tns-prompt-position").val() === "1");
}

/** เติมค่าปัจจุบันลงในฟอร์มตั้งค่าตอนโหลดครั้งแรก */
export function loadSettingsUi() {
    const s = getSettings();
    $("#tns-enabled").prop("checked", s.enabled);
    $("#tns-api-profile").html(connectionProfileOptionsHtml(s.api.connectionProfileId));
    $("#tns-vision-max-tokens").val(s.api.visionMaxTokens);
    $("#tns-font-mode").val(s.ui.fontMode);
    $("#tns-inject-enabled").prop("checked", s.prompt.injectEnabled);
    $("#tns-prompt-position").val(String(s.prompt.position));
    $("#tns-prompt-depth").val(s.prompt.depth);
    $("#tns-prompt-role").val(String(s.prompt.role));
    $("#tns-prompt-scan").prop("checked", s.prompt.scan);
    updateDepthRowVisibility();
    for (const [platform, cfg] of Object.entries(s.platforms)) {
        const $block = $(`.tns-platform-block[data-platform="${platform}"]`);
        $block.find(".tns-platform-enabled").prop("checked", cfg.enabled);
        $block.find(".tns-platform-theme").val(cfg.theme);
        $block.find(".tns-platform-docsinprompt").prop("checked", cfg.docsInPrompt);
        renderPlatformAlbums(platform);
    }
    renderPromptEditors();
    syncWandButtonVisibility();
    updateTokenSummary();
}

export function bindSettingsHandlers() {
    $(document).on("input", "#tns-enabled", function () {
        const v = Boolean($(this).prop("checked"));
        getSettings().enabled = v;
        saveSettings();
        syncWandButtonVisibility();
        if (v) { renderAll(); updateTokenSummary(); }
        else { teardownAllMessages(); clearInjection(); document.getElementById("tinysocial-fonts")?.remove(); }
    });

    $(document).on("click", "#tns-open-panel", () => togglePanel());

    // อัลบั้ม/Connection Profile อาจเปลี่ยนขณะดรอเวอร์นี้ปิดอยู่ — รีเฟรชทุกครั้งที่เปิดดรอเวอร์
    $(document).on("click", ".tinysocial-settings > .inline-drawer > .inline-drawer-toggle", () => {
        for (const platform of Object.keys(getSettings().platforms)) renderPlatformAlbums(platform);
        $("#tns-api-profile").html(connectionProfileOptionsHtml(getSettings().api.connectionProfileId));
    });

    $(document).on("change", "#tns-api-profile", function () {
        getSettings().api.connectionProfileId = $(this).val();
        saveSettings();
    });

    $(document).on("change", "#tns-font-mode", function () {
        const mode = $(this).val();
        getSettings().ui.fontMode = mode;
        saveSettings();
        applyFontMode(mode);
    });

    $(document).on("change", "#tns-vision-max-tokens", function () {
        const n = Math.max(50, Number($(this).val()) || 300);
        getSettings().api.visionMaxTokens = n;
        $(this).val(n);
        saveSettings();
    });

    $(document).on("input", "#tns-inject-enabled", function () {
        getSettings().prompt.injectEnabled = Boolean($(this).prop("checked"));
        saveSettings();
        updateTokenSummary();
    });

    $(document).on("change", "#tns-prompt-position", function () {
        getSettings().prompt.position = Number($(this).val());
        saveSettings();
        updateDepthRowVisibility();
        updateTokenSummary();
    });

    $(document).on("change", "#tns-prompt-depth", function () {
        const n = Math.max(0, Number($(this).val()) || 0);
        getSettings().prompt.depth = n;
        $(this).val(n);
        saveSettings();
        updateTokenSummary();
    });

    $(document).on("change", "#tns-prompt-role", function () {
        getSettings().prompt.role = Number($(this).val());
        saveSettings();
        updateTokenSummary();
    });

    $(document).on("input", "#tns-prompt-scan", function () {
        getSettings().prompt.scan = Boolean($(this).prop("checked"));
        saveSettings();
        updateTokenSummary();
    });

    $(document).on("input", ".tns-platform-enabled", function () {
        const platform = $(this).closest(".tns-platform-block").data("platform");
        getSettings().platforms[platform].enabled = Boolean($(this).prop("checked"));
        bumpRev();
        renderAll();
        updateTokenSummary();
    });

    $(document).on("change", ".tns-platform-theme", function () {
        const platform = $(this).closest(".tns-platform-block").data("platform");
        getSettings().platforms[platform].theme = $(this).val();
        bumpRev();
        renderAll();
    });

    $(document).on("input", ".tns-platform-docsinprompt", function () {
        const platform = $(this).closest(".tns-platform-block").data("platform");
        getSettings().platforms[platform].docsInPrompt = Boolean($(this).prop("checked"));
        saveSettings();
        renderPlatformAlbums(platform); // เตือน/เลิกเตือนสด ถ้ายังไม่มีอัลบั้มถูกเลือก
        updateTokenSummary();
    });

    $(document).on("input", ".tns-platform-album-check", function () {
        const platform = $(this).closest(".tns-platform-block").data("platform");
        const albumId = $(this).data("album");
        const list = getSettings().platforms[platform].exposeAlbumIds;
        const idx = list.indexOf(albumId);
        if (this.checked && idx === -1) list.push(albumId);
        else if (!this.checked && idx !== -1) list.splice(idx, 1);
        saveSettings();
        renderPlatformAlbums(platform); // อัปเดตคำเตือนสด (หายไปทันทีที่เลือกอัลบั้มแรก)
        updateTokenSummary();
    });

    $(document).on("input", ".tns-prompt-textarea", function () {
        const id = $(this).closest(".tns-prompt-editor").data("prompt");
        setPrompt(id, $(this).val());
        $(this).closest(".tns-prompt-editor").find(".tns-prompt-reset").prop("disabled", false);
        scheduleTokenSummaryUpdate();
    });

    $(document).on("click", ".tns-prompt-reset", function () {
        const $editor = $(this).closest(".tns-prompt-editor");
        const id = $editor.data("prompt");
        resetPrompt(id);
        $editor.find(".tns-prompt-textarea").val(getPrompt(id));
        $(this).prop("disabled", true);
        updateTokenSummary();
    });

    $(document).on("click", "#tns-preview-prompt", async () => {
        const tokens = await rebuildInjection();
        const { buildInjection } = await import("../promptbuild.js");
        const { text } = buildInjection();
        await showText("พรอมป์ที่ส่งให้ AI จริง", text ? `${text}\n\n--- รวม ${tokens.total} โทเคน ---` : "(ว่างเปล่า — ปิดอยู่ หรือยังไม่มีแพลตฟอร์มที่ส่งเอกสารให้ AI)");
    });
}

/** เรียกจาก index.js ตอนอัลบั้มถูกสร้าง/ลบในแผง หรือรูปถูกลบ — รายชื่ออัลบั้มในหน้า settings ต้องตามทัน */
export function refreshAlbumCheckboxesIfSettingsOpen() {
    if (!$(".tinysocial-settings").length) return;
    for (const platform of Object.keys(getSettings().platforms)) renderPlatformAlbums(platform);
}
