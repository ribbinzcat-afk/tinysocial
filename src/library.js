// library.js — จัดการไฟล์รูปจริงบนดิสก์ (อัปโหลด/ลบ) แล้วเรียก store.js เพื่อบันทึกข้อมูล
// ห้ามเก็บ base64 ใน extension_settings — เก็บแค่ path ที่ /api/images/upload คืนมา (มี "/" นำหน้าจริง — ยืนยันจาก
// server: clientRelativePath() = inputPath.slice(root.length) ซึ่งเหลือ path separator ตัวแรกไว้เสมอ)

import { getBase64Async, saveBase64AsFile, getFileExtension, ensureImageFormatSupported } from "../../../../utils.js";
import { deleteMediaFromServer } from "../../../../chats.js";

import { addImage, removeImageRecord, getImage } from "./store.js";

const UPLOAD_SUBFOLDER = "tinysocial";
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // กันเผื่อ request body — โควตาจริงคือดิสก์ ไม่ใช่ตัวเลขนี้

function probeImageDimensions(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = dataUrl;
    });
}

/**
 * อัปโหลดไฟล์รูปหลายไฟล์เข้าคลัง (photo/sticker)
 * @param {FileList|File[]} files
 * @param {"photo"|"sticker"} kind
 * @returns {Promise<{added: object[], skipped: {file: File, reason: string}[]}>}
 */
export async function uploadImages(files, kind = "photo") {
    const added = [];
    const skipped = [];

    for (const file of Array.from(files)) {
        if (!file.type || !file.type.startsWith("image/")) {
            skipped.push({ file, reason: "ไม่ใช่ไฟล์รูปภาพ" });
            continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            skipped.push({ file, reason: "ไฟล์ใหญ่เกิน 12MB" });
            continue;
        }
        try {
            const safeFile = await ensureImageFormatSupported(file);
            const dataUrl = await getBase64Async(safeFile);
            const base64Data = dataUrl.split(",")[1] ?? dataUrl;
            const extension = getFileExtension(safeFile) || "png";
            const stamp = `ts_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
            const path = await saveBase64AsFile(base64Data, UPLOAD_SUBFOLDER, stamp, extension);
            const dims = await probeImageDimensions(dataUrl);
            const image = addImage({
                kind,
                url: path,
                name: file.name.replace(/\.[^/.]+$/, ""),
                w: dims.w,
                h: dims.h,
            });
            added.push(image);
        } catch (error) {
            console.error(`[tinysocial] อัปโหลด ${file.name} ไม่สำเร็จ:`, error);
            skipped.push({ file, reason: "อัปโหลดไม่สำเร็จ (ดู console)" });
        }
    }

    return { added, skipped };
}

/** ลบรูปทั้งไฟล์บนดิสก์และข้อมูลในตั้งค่า — เทียบ path แบบไม่สนใจ "/" นำหน้า กันพลาดไม่ว่า url จะเก็บมาแบบไหน
 *  (นี่คือจุดที่ tinyscene พลาด: เช็คแบบมี "/" นำหน้าทั้งที่ของจริงจากเซิร์ฟเวอร์ไม่มี — เราเช็คทั้งสองแบบให้ชัวร์) */
export async function deleteImage(imageId) {
    const img = getImage(imageId);
    if (!img) return false;
    const normalized = img.url ? img.url.replace(/^\/+/, "") : "";
    if (normalized.startsWith("user/images/")) {
        await deleteMediaFromServer(img.url, true);
    }
    removeImageRecord(imageId);
    return true;
}
