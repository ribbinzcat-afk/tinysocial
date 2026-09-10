// index.js — bootstrap เท่านั้น ฟีเจอร์จริงอยู่ใน src/
import { eventSource, event_types } from "../../../events.js";
import { extensionName, extensionFolderPath, getSettings, sweepIntegrity, renameProfileKey, deleteProfileKey, migrateNpcsForCharacterRename, deleteNpcsForCharacter } from "./src/store.js";
import { togglePanel, refreshPanelIfOpen } from "./src/ui/panel.js";
import { loadSettingsUi, bindSettingsHandlers, syncWandButtonVisibility, WAND_BUTTON_ID } from "./src/ui/settings.js";
import { renderAll, queueRender, teardownAllMessages } from "./src/inject.js";
import { invalidateThemeCache, applyFontMode } from "./src/theme.js";
import { scheduleRebuildInjection } from "./src/promptbuild.js";

/** เพิ่มปุ่มลัดในเมนูไม้กายสิทธิ์ (#extensionsMenu) — extension third-party ไม่มี container จองไว้ให้ */
function mountWandButton() {
    if ($(`#${WAND_BUTTON_ID}`).length) return;
    const button = $(`
        <div id="${WAND_BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <div class="fa-solid fa-images extensionsMenuExtensionButton"></div>
            <span>TinySocial</span>
        </div>`);
    button.on("click", () => togglePanel());
    $("#extensionsMenu").append(button);
    syncWandButtonVisibility();
}

const FONT_LINK_ID = "tinysocial-fonts";
function applyFonts() {
    const wants = getSettings().ui.loadWebFonts;
    const existing = document.getElementById(FONT_LINK_ID);
    if (wants && !existing) {
        const link = document.createElement("link");
        link.id = FONT_LINK_ID;
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&family=Kanit:wght@400;500;600;700&display=swap";
        document.head.appendChild(link);
    } else if (!wants && existing) {
        existing.remove();
    }
}

function onMessageEvent(mesId) {
    if (!getSettings().enabled) return;
    queueRender(Number(mesId));
}

function onGenericRefresh() {
    if (!getSettings().enabled) { teardownAllMessages(); return; }
    renderAll();
}

let chatObserverTimer = null;
function setupChatObserver() {
    const chatEl = document.getElementById("chat");
    if (!chatEl) return;
    // redisplayChat()/printMessages() สร้าง .mes ใหม่ทั้งหมดโดยไม่ยิง event ใดๆ — ต้องมี fallback นี้
    // subtree:false เพราะเราเขียนแค่ใน .mes_text (ลึกกว่าลูกตรงของ #chat สองชั้น) จึงไม่ trigger ตัวเอง
    const observer = new MutationObserver(() => {
        clearTimeout(chatObserverTimer);
        chatObserverTimer = setTimeout(() => onGenericRefresh(), 60);
    });
    observer.observe(chatEl, { childList: true });
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
    try {
        getSettings(); // เติมคีย์ที่ขาดหายก่อนวาด UI ใดๆ
        sweepIntegrity(); // ล้างข้อมูลค้าง (รูป/อัลบั้ม/โปรไฟล์ที่อ้างถึงของที่หายไปแล้ว)

        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);
        bindSettingsHandlers();
        loadSettingsUi();
        mountWandButton();

        applyFonts();
        applyFontMode(getSettings().ui.fontMode);
        setupChatObserver();
        onGenericRefresh(); // กวาดข้อความที่มีอยู่แล้วตอนโหลดหน้า

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageEvent);
        eventSource.on(event_types.USER_MESSAGE_RENDERED, onMessageEvent);
        eventSource.on(event_types.MESSAGE_UPDATED, onMessageEvent);
        eventSource.on(event_types.MESSAGE_SWIPED, onMessageEvent);
        eventSource.on(event_types.CHAT_CHANGED, onGenericRefresh);
        eventSource.on(event_types.MORE_MESSAGES_LOADED, onGenericRefresh);

        eventSource.on(event_types.SETTINGS_UPDATED, () => { invalidateThemeCache(); onGenericRefresh(); });

        // ตัวละคร/persona เปลี่ยน — แท็บโปรไฟล์ในแผงต้องตามทัน และ identity_block ในพรอมป์ต้องคำนวณใหม่
        eventSource.on(event_types.CHAT_CHANGED, () => scheduleRebuildInjection());
        eventSource.on(event_types.PERSONA_CHANGED, () => { refreshPanelIfOpen(); scheduleRebuildInjection(); });

        // โปรไฟล์ผูกกับ avatar filename ของตัวละคร — ต้องย้าย/ลบ key ตามเมื่อตัวละครถูกเปลี่ยนชื่อ/ลบ
        eventSource.on(event_types.CHARACTER_RENAMED, (oldAvatar, newAvatar) => {
            renameProfileKey("character", oldAvatar, newAvatar);
            migrateNpcsForCharacterRename(oldAvatar, newAvatar); // NPC ทั้งหมดที่ผูกกับตัวละครนี้ต้องย้าย key ตาม
            refreshPanelIfOpen();
        });
        eventSource.on(event_types.CHARACTER_DELETED, (payload) => {
            const avatar = payload?.character?.avatar;
            if (avatar) {
                deleteProfileKey("character", avatar);
                deleteNpcsForCharacter(avatar); // NPC ที่ผูกกับตัวละครนี้ไม่มีความหมายอีกต่อไปเมื่อตัวละครถูกลบ
            }
            refreshPanelIfOpen();
        });

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
        toastr.error("โหลด TinySocial ไม่สำเร็จ (ดู console)", "TinySocial");
    }
});
