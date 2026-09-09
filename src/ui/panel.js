// panel.js — แผงลอย: คลังรูป / อัลบั้ม / โปรไฟล์
// เนื้อหาแต่ละแท็บ re-render ทั้งก้อนทุกครั้งที่เปิดแท็บหรือมีการแก้ไข — ข้อมูลไม่เยอะพอที่จะต้อง diff DOM

import { dragElement } from "../../../../../RossAscends-mods.js";
import { loadMovingUIState } from "../../../../../power-user.js";
import { animation_duration } from "../../../../../../script.js";
import { getContext } from "../../../../../extensions.js";

import { extensionFolderPath, getSettings, listImages, setImageSlug, setImageFields, listAlbums, addAlbum, renameAlbum, removeAlbum, addImageToAlbum, removeImageFromAlbum, getAlbumImages, getProfile, setProfileField, imageUrlToSrc } from "../store.js";
import { uploadImages, deleteImage } from "../library.js";
import { currentCharacterKey, currentPersonaKey, resolveAvatarUrl } from "../identity.js";
import { scheduleRebuildInjection } from "../promptbuild.js";
import { describeImage, profileSupportsVision } from "../api.js";
import { promptText, confirmAction, escapeHtml, connectionProfileOptionsHtml } from "./widgets.js";

const PANEL_ID = "tinysocialPanel";
let panelReady = false;
let libraryFilterKind = "";
let pendingUploadKind = "photo";

function isPanelOpen() {
    const $p = $(`#${PANEL_ID}`);
    return $p.length > 0 && $p.css("display") !== "none" && $p.is(":visible");
}

const imgSrc = imageUrlToSrc;

// ==================== คลังรูป ====================

/** true = โปรไฟล์ที่เลือกอยู่ (หรือไม่เลือกเลย = fallback ST) ใช้บรรยายรูปได้ — เช็คแค่ระดับ "ไม่ใช่ Text Completion" */
function isDescribeAllowed() {
    const profileId = getSettings().api.connectionProfileId;
    if (!profileId) return true; // ไม่เลือก = fallback ไป ST default เสมอ ปล่อยให้กดได้ (พังตอนกดจริงถ้ายังไม่ตั้งค่า)
    return profileSupportsVision(profileId);
}

function renderLibrary() {
    const $panel = $(`#${PANEL_ID}`);
    const images = listImages(libraryFilterKind ? { kind: libraryFilterKind } : {});
    const settings = getSettings();

    $panel.find("#tns-lib-profile").html(connectionProfileOptionsHtml(settings.api.connectionProfileId));

    const describeOk = isDescribeAllowed();
    const describeTitle = describeOk ? "ให้ AI ช่วยบรรยายรูปนี้" : "โปรไฟล์ที่เลือกเป็นสาย Text Completion — ไม่รองรับการส่งรูป เปลี่ยนโปรไฟล์ก่อน";
    $panel.find("#tns-describe-all").prop("disabled", !describeOk).attr("title", describeOk ? "บรรยายทุกรูปที่ desc ว่าง" : describeTitle);

    $panel.find(".tns-filter-btn").removeClass("tns-filter-active");
    $panel.find(`.tns-filter-btn[data-kind="${libraryFilterKind}"]`).addClass("tns-filter-active");
    $panel.find("#tns-lib-count").text(`${images.length} รูป`);

    if (!images.length) {
        $panel.find("#tns-image-grid").html(`<p class="tns-hint">ยังไม่มีรูปในหมวดนี้ — อัปโหลดด้านบนได้เลย</p>`);
        return;
    }

    const html = images.map((img) => `
        <div class="tns-img-card" data-id="${img.id}">
            <div class="tns-img-thumbwrap">
                <img src="${imgSrc(img.url)}" loading="lazy" alt="${escapeHtml(img.name)}">
                <button class="tns-img-del interactable" title="ลบรูปนี้"><i class="fa-solid fa-trash"></i></button>
                <button class="tns-img-kind interactable" title="คลิกเพื่อสลับภาพถ่าย/สติกเกอร์">${img.kind === "sticker" ? "😀 สติกเกอร์" : "🖼️ ภาพถ่าย"}</button>
            </div>
            <div class="tns-img-slug interactable" title="คลิกเพื่อแก้ไข slug (AI ใช้ค่านี้อ้างถึงรูป)">${escapeHtml(img.slug)}</div>
            <div class="tns-img-name interactable" title="คลิกเพื่อแก้ไขชื่อ">${escapeHtml(img.name)}</div>
            <textarea class="tns-img-desc text_pole" placeholder="คำอธิบายรูป (ส่งให้ AI ช่วยเลือกใช้)">${escapeHtml(img.desc)}</textarea>
            <div class="tns-img-describe-row">
                <button class="tns-img-describe menu_button interactable" ${describeOk ? "" : "disabled"} title="${escapeHtml(describeTitle)}">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> บรรยายด้วย AI
                </button>
                ${img.descSource === "ai" ? '<span class="tns-img-ai-badge" title="คำอธิบายนี้มาจาก AI">AI</span>' : ""}
            </div>
        </div>
    `).join("");
    $panel.find("#tns-image-grid").html(html);
}

async function handleFilesSelected(files, kind) {
    if (!files || !files.length) return;
    const { added, skipped } = await uploadImages(files, kind);
    if (added.length) toastr.success(`อัปโหลดสำเร็จ ${added.length} รูป`, "TinySocial");
    for (const s of skipped) toastr.warning(`${s.file.name}: ${s.reason}`, "TinySocial");
    renderLibrary();
}

function bindLibraryEvents($panel) {
    $panel.on("click", "#tns-upload-photo", () => { pendingUploadKind = "photo"; $panel.find("#tns-file-input").val("").trigger("click"); });
    $panel.on("click", "#tns-upload-sticker", () => { pendingUploadKind = "sticker"; $panel.find("#tns-file-input").val("").trigger("click"); });
    $panel.on("change", "#tns-file-input", function () {
        handleFilesSelected(this.files, pendingUploadKind);
    });

    // ต้อง stopPropagation ทุก event ไม่งั้นจะหลุดไปโดน drag-drop import การ์ดตัวละครระดับ document ของ core
    // (ST ฟัง "drop" บน body เพื่อรับไฟล์ .png เป็นการ์ดตัวละคร — โดนพร้อมกับ dropzone ของเราถ้าไม่กันไว้)
    const $dropzone = $panel.find("#tns-dropzone");
    $dropzone.on("dragover", (e) => { e.preventDefault(); e.stopPropagation(); $dropzone.addClass("tns-dropzone-active"); });
    $dropzone.on("dragleave", (e) => { e.stopPropagation(); $dropzone.removeClass("tns-dropzone-active"); });
    $dropzone.on("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        $dropzone.removeClass("tns-dropzone-active");
        const files = e.originalEvent.dataTransfer?.files;
        if (files?.length) handleFilesSelected(files, "photo");
    });

    $panel.on("click", ".tns-filter-btn", function () {
        libraryFilterKind = $(this).data("kind") || "";
        renderLibrary();
    });

    $panel.on("click", ".tns-img-del", async function () {
        const id = $(this).closest(".tns-img-card").data("id");
        if (!(await confirmAction("ลบรูปนี้ถาวร (รวมไฟล์บนดิสก์) ใช่หรือไม่?"))) return;
        await deleteImage(id);
        renderLibrary();
    });

    $panel.on("click", ".tns-img-kind", function () {
        const $card = $(this).closest(".tns-img-card");
        const id = $card.data("id");
        const img = listImages().find((i) => i.id === id);
        if (!img) return;
        setImageFields(id, { kind: img.kind === "sticker" ? "photo" : "sticker" });
        renderLibrary();
    });

    $panel.on("click", ".tns-img-slug", async function () {
        const $card = $(this).closest(".tns-img-card");
        const id = $card.data("id");
        const img = listImages().find((i) => i.id === id);
        if (!img) return;
        const next = await promptText("แก้ slug (AI จะใช้ชื่อนี้อ้างถึงรูป)", img.slug);
        if (next === null) return;
        setImageSlug(id, next);
        renderLibrary();
    });

    $panel.on("click", ".tns-img-name", async function () {
        const $card = $(this).closest(".tns-img-card");
        const id = $card.data("id");
        const img = listImages().find((i) => i.id === id);
        if (!img) return;
        const next = await promptText("แก้ชื่อรูป (ป้ายในแผง)", img.name);
        if (next === null) return;
        setImageFields(id, { name: next });
        renderLibrary();
    });

    $panel.on("change", ".tns-img-desc", function () {
        const id = $(this).closest(".tns-img-card").data("id");
        const value = $(this).val();
        setImageFields(id, { desc: value, descSource: value ? "manual" : "" });
    });

    $panel.on("change", "#tns-lib-profile", function () {
        getSettings().api.connectionProfileId = $(this).val();
        renderLibrary(); // อัปเดตสถานะ disable ของปุ่มบรรยายใหม่ตามโปรไฟล์ที่เพิ่งเลือก
        $("#tns-api-profile").val($(this).val()); // ซิงก์กับดรอปดาวน์เดียวกันในหน้า settings ถ้าเปิดอยู่
    });

    $panel.on("click", ".tns-img-describe", async function () {
        const id = $(this).closest(".tns-img-card").data("id");
        await describeOneImage(id, $(this));
    });

    $panel.on("click", "#tns-describe-all", async function () {
        const targets = listImages().filter((i) => !i.desc);
        if (!targets.length) { toastr.info("ทุกรูปมีคำอธิบายอยู่แล้ว", "TinySocial"); return; }
        const $btn = $(this).prop("disabled", true);
        let ok = 0;
        for (const img of targets) {
            const $card = $panel.find(`.tns-img-card[data-id="${img.id}"]`);
            const success = await describeOneImage(img.id, $card.find(".tns-img-describe"));
            if (success) ok++;
        }
        $btn.prop("disabled", !isDescribeAllowed());
        toastr.success(`บรรยายสำเร็จ ${ok}/${targets.length} รูป`, "TinySocial");
    });
}

/** @returns {Promise<boolean>} สำเร็จหรือไม่ */
async function describeOneImage(imageId, $btn) {
    const img = listImages().find((i) => i.id === imageId);
    if (!img) return false;
    const originalHtml = $btn.html();
    $btn.prop("disabled", true).html('<i class="fa-solid fa-spinner fa-spin"></i> กำลังบรรยาย...');
    try {
        const profileId = getSettings().api.connectionProfileId;
        const { text, via, promptTokens } = await describeImage(imgSrc(img.url), { profileId });
        setImageFields(imageId, { desc: text, descSource: "ai" });
        toastr.success(`เส้นทาง: ${via === "profile" ? "Connection Profile" : "ค่าเริ่มต้นของ ST"} · พรอมป์ ${promptTokens} โทเคน`, "บรรยายสำเร็จ");
        renderLibrary();
        return true;
    } catch (error) {
        console.error("[tinysocial] describeImage ล้มเหลว:", error);
        toastr.error(error.message || "บรรยายไม่สำเร็จ (ดู console)", "TinySocial");
        $btn.prop("disabled", !isDescribeAllowed()).html(originalHtml);
        return false;
    }
}

// ==================== อัลบั้ม ====================

function renderAlbums() {
    const $panel = $(`#${PANEL_ID}`);
    const albums = listAlbums();
    if (!albums.length) {
        $panel.find("#tns-album-list").html(`<p class="tns-hint">ยังไม่มีอัลบั้ม — สร้างใหม่ด้านบนได้เลย</p>`);
        return;
    }

    const html = albums.map((album) => {
        const members = getAlbumImages(album.id);
        const memberThumbs = members.map((img) => `
            <div class="tns-album-member" data-img="${img.id}" title="${escapeHtml(img.slug)}">
                <img src="${imgSrc(img.url)}" loading="lazy" alt="${escapeHtml(img.name)}">
                <button class="tns-album-member-del interactable" title="เอาออกจากอัลบั้ม"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `).join("") || `<span class="tns-hint">ยังไม่มีรูปในอัลบั้มนี้</span>`;

        const pickerRows = listImages({ kind: album.kind }).map((img) => {
            const checked = album.imageIds.includes(img.id) ? "checked" : "";
            return `
                <label class="tns-picker-row">
                    <input type="checkbox" class="tns-album-picker-check" data-img="${img.id}" ${checked}>
                    <img src="${imgSrc(img.url)}" loading="lazy" alt="">
                    <span>${escapeHtml(img.slug)}</span>
                </label>`;
        }).join("") || `<span class="tns-hint">ยังไม่มีรูปประเภทนี้ในคลัง</span>`;

        return `
            <div class="tns-album-card" data-id="${album.id}">
                <div class="tns-album-head">
                    <span class="tns-album-name interactable" title="คลิกเพื่อแก้ไขชื่อ">${escapeHtml(album.name)}</span>
                    <span class="tns-album-kind">${album.kind === "sticker" ? "สติกเกอร์" : "ภาพถ่าย"}</span>
                    <span class="tns-album-count">${album.imageIds.length} รูป</span>
                    <button class="tns-album-del interactable" title="ลบอัลบั้ม"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="tns-album-members">${memberThumbs}</div>
                <button class="tns-album-manage menu_button interactable"><i class="fa-solid fa-pen"></i> จัดการรูปในอัลบั้ม</button>
                <div class="tns-album-picker" hidden>${pickerRows}</div>
            </div>`;
    }).join("");
    $panel.find("#tns-album-list").html(html);
}

function bindAlbumEvents($panel) {
    $panel.on("click", "#tns-new-album-photo", async () => {
        const name = await promptText("ชื่ออัลบั้มภาพถ่ายใหม่");
        if (!name) return;
        addAlbum({ name, kind: "photo" });
        renderAlbums();
    });
    $panel.on("click", "#tns-new-album-sticker", async () => {
        const name = await promptText("ชื่ออัลบั้มสติกเกอร์ใหม่");
        if (!name) return;
        addAlbum({ name, kind: "sticker" });
        renderAlbums();
    });

    $panel.on("click", ".tns-album-name", async function () {
        const id = $(this).closest(".tns-album-card").data("id");
        const album = listAlbums().find((a) => a.id === id);
        if (!album) return;
        const next = await promptText("แก้ชื่ออัลบั้ม", album.name);
        if (!next) return;
        renameAlbum(id, next);
        renderAlbums();
    });

    $panel.on("click", ".tns-album-del", async function () {
        const id = $(this).closest(".tns-album-card").data("id");
        if (!(await confirmAction("ลบอัลบั้มนี้? (รูปในคลังจะไม่ถูกลบ)"))) return;
        removeAlbum(id);
        renderAlbums();
    });

    $panel.on("click", ".tns-album-manage", function () {
        $(this).closest(".tns-album-card").find(".tns-album-picker").toggle();
    });

    $panel.on("click", ".tns-album-member-del", function () {
        const albumId = $(this).closest(".tns-album-card").data("id");
        const imgId = $(this).closest(".tns-album-member").data("img");
        removeImageFromAlbum(albumId, imgId);
        renderAlbums();
    });

    $panel.on("change", ".tns-album-picker-check", function () {
        const albumId = $(this).closest(".tns-album-card").data("id");
        const imgId = $(this).data("img");
        if (this.checked) addImageToAlbum(albumId, imgId);
        else removeImageFromAlbum(albumId, imgId);
        renderAlbums();
        // เก็บ picker ให้ยังเปิดอยู่หลัง re-render (มิฉะนั้นจะปิดทุกครั้งที่ติ๊ก)
        $(`#${PANEL_ID}`).find(`.tns-album-card[data-id="${albumId}"] .tns-album-picker`).show();
    });
}

// ==================== โปรไฟล์ ====================

function profileFormHtml(scope, key, fallbackLabel) {
    const profile = getProfile(scope, key);
    const photos = listImages({ kind: "photo" });
    const avatarOptions = photos.map((img) =>
        `<option value="${img.id}" ${profile.avatarImageId === img.id ? "selected" : ""}>${escapeHtml(img.slug)}</option>`,
    ).join("");
    const previewSrc = resolveAvatarUrl(profile.avatarImageId, scope, key);

    return `
        <div class="tns-row">
            <label>ชื่อที่แสดง</label>
            <input type="text" class="text_pole tns-p-displayName" value="${escapeHtml(profile.displayName)}" placeholder="${escapeHtml(fallbackLabel)}">
        </div>
        <div class="tns-row">
            <label>Username</label>
            <input type="text" class="text_pole tns-p-handle" value="${escapeHtml(profile.handle)}" placeholder="@username">
        </div>
        <div class="tns-row tns-avatar-row">
            <label>รูปโปรไฟล์</label>
            <div class="tns-avatar-picker">
                <img class="tns-avatar-preview" src="${previewSrc}" alt="">
                <select class="text_pole tns-p-avatar">
                    <option value="">(ใช้รูปการ์ด/Persona เริ่มต้น)</option>
                    ${avatarOptions}
                </select>
            </div>
        </div>
        <div class="tns-row">
            <label>Bio</label>
            <textarea class="text_pole tns-p-bio" rows="2">${escapeHtml(profile.bio)}</textarea>
        </div>`;
}

function renderProfiles() {
    const $panel = $(`#${PANEL_ID}`);
    const ctx = getContext();
    const charKey = currentCharacterKey();
    const personaKey = currentPersonaKey();

    if (charKey) {
        const charName = ctx.characters?.[ctx.characterId]?.name || "ตัวละคร";
        $panel.find("#tns-profile-character-label").text(`ตัวละคร: ${charName}`);
        $panel.find("#tns-profile-character .tns-profile-form").html(profileFormHtml("character", charKey, charName));
        $panel.find("#tns-profile-character").removeAttr("hidden");
    } else {
        $panel.find("#tns-profile-character").attr("hidden", true);
    }

    if (personaKey) {
        const personaName = ctx.powerUserSettings?.personas?.[personaKey] || ctx.name1 || "Persona";
        $panel.find("#tns-profile-persona-label").text(`Persona: ${personaName}`);
        $panel.find("#tns-profile-persona .tns-profile-form").html(profileFormHtml("persona", personaKey, personaName));
        $panel.find("#tns-profile-persona").removeAttr("hidden");
    } else {
        $panel.find("#tns-profile-persona").attr("hidden", true);
    }

    $panel.find("#tns-profile-empty").attr("hidden", Boolean(charKey || personaKey));
}

function currentScopeKey($form) {
    const scope = $form.data("scope");
    const key = scope === "character" ? currentCharacterKey() : currentPersonaKey();
    return { scope, key };
}

function bindProfileEvents($panel) {
    $panel.on("input change", ".tns-p-displayName", function () {
        const { scope, key } = currentScopeKey($(this).closest(".tns-profile-form"));
        setProfileField(scope, key, { displayName: $(this).val() });
        scheduleRebuildInjection();
    });
    $panel.on("input change", ".tns-p-handle", function () {
        const { scope, key } = currentScopeKey($(this).closest(".tns-profile-form"));
        setProfileField(scope, key, { handle: $(this).val() });
        scheduleRebuildInjection();
    });
    $panel.on("input change", ".tns-p-bio", function () {
        const { scope, key } = currentScopeKey($(this).closest(".tns-profile-form"));
        setProfileField(scope, key, { bio: $(this).val() });
    });
    $panel.on("change", ".tns-p-avatar", function () {
        const $form = $(this).closest(".tns-profile-form");
        const { scope, key } = currentScopeKey($form);
        const imageId = $(this).val();
        setProfileField(scope, key, { avatarImageId: imageId });
        $form.find(".tns-avatar-preview").attr("src", resolveAvatarUrl(imageId, scope, key));
    });
}

// ==================== เปลือกแผง (เปิด/ปิด/ลาก/แท็บ) ====================

function updateTokenChip() {
    const tokens = getSettings().prompt.lastTokens;
    $(`#${PANEL_ID} #tns-panel-tokens`).text(tokens?.total ? `${tokens.total} โทเคน` : "");
}

function switchTab(tab) {
    const $panel = $(`#${PANEL_ID}`);
    $panel.find(".tns-tab-btn").removeClass("tns-tab-active");
    $panel.find(`.tns-tab-btn[data-tab="${tab}"]`).addClass("tns-tab-active");
    $panel.find(".tns-tab-pane").attr("hidden", true);
    $panel.find(`.tns-tab-pane[data-pane="${tab}"]`).removeAttr("hidden");
    getSettings().ui.activeTab = tab;

    if (tab === "library") renderLibrary();
    else if (tab === "albums") renderAlbums();
    else if (tab === "profiles") renderProfiles();
    updateTokenChip();
}

function bindPanelEvents() {
    const $panel = $(`#${PANEL_ID}`);
    $panel.on("click", ".tns-tab-btn", function () { switchTab($(this).data("tab")); });
    $panel.on("click", "#tinysocialPanelClose", () => closePanel());
    bindLibraryEvents($panel);
    bindAlbumEvents($panel);
    bindProfileEvents($panel);
}

export async function initPanel() {
    if (panelReady) return;
    const html = await $.get(`${extensionFolderPath}/panel.html`);
    $("#movingDivs").append(html);
    bindPanelEvents();
    panelReady = true;
}

export function closePanel() {
    const $panel = $(`#${PANEL_ID}`);
    if (!$panel.length) return;
    $panel.transition({ opacity: 0, duration: animation_duration }, () => $panel.css("display", "none"));
}

export async function openPanel() {
    await initPanel();
    const $panel = $(`#${PANEL_ID}`);
    $panel.css({ display: "block", opacity: 1 });
    if (!$panel.data("tns-drag-bound")) {
        loadMovingUIState();
        dragElement($panel);
        $panel.data("tns-drag-bound", true);
    }
    switchTab(getSettings().ui.activeTab || "library");
}

export function togglePanel() {
    if (isPanelOpen()) closePanel();
    else openPanel();
}

/** เรียกจาก index.js ตอนเปลี่ยนตัวละคร/persona ขณะแผงเปิดอยู่ — ให้แท็บโปรไฟล์ตามทัน */
export function refreshPanelIfOpen() {
    if (!isPanelOpen()) return;
    const tab = getSettings().ui.activeTab || "library";
    switchTab(tab);
}
