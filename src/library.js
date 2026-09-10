// library.js — จัดการไฟล์รูปจริงบนดิสก์ (อัปโหลด/ลบ) แล้วเรียก store.js เพื่อบันทึกข้อมูล
// ห้ามเก็บ base64 ใน extension_settings — เก็บแค่ path ที่ /api/images/upload คืนมา (มี "/" นำหน้าจริง — ยืนยันจาก
// server: clientRelativePath() = inputPath.slice(root.length) ซึ่งเหลือ path separator ตัวแรกไว้เสมอ)

import { getBase64Async, saveBase64AsFile, getFileExtension, ensureImageFormatSupported } from "../../../../utils.js";
import { deleteMediaFromServer } from "../../../../chats.js";

import { addImage, removeImageRecord, getImage } from "./store.js";

const UPLOAD_SUBFOLDER = "tinysocial";
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // กันเผื่อ request body — โควตาจริงคือดิสก์ ไม่ใช่ตัวเลขนี้

// ย่อรูปก่อนอัปโหลดจริง กันคลังบวมเปลืองพื้นที่เซิร์ฟเวอร์เมื่อมีรูปเยอะๆ (ผู้ใช้กังวลเรื่องนี้โดยตรง)
const PHOTO_MAX_DIM = 1600; // การ์ดที่ใหญ่สุด (IG post) จำกัดสูง 500px อยู่แล้ว — 1600 กว้างพอสำหรับจอ retina/ซูม
const STICKER_MAX_DIM = 512; // สติกเกอร์โชว์แค่ ~120-140px ในฟองแชท เผื่อจอความละเอียดสูงไว้พอ
const ANIMATED_TYPES = new Set(["image/gif", "image/apng"]); // ย่อแล้วเหลือเฟรมเดียว แอนิเมชันพังแน่ๆ — ข้ามเสมอ

function probeImageDimensions(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = dataUrl;
    });
}

function loadImageEl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("โหลดรูปเพื่อย่อขนาดไม่สำเร็จ"));
        img.src = dataUrl;
    });
}

/**
 * คืน {dataUrl, extension} ที่พร้อมอัปโหลดจริง — ย่อ+บีบอัดถ้าคุ้ม ไม่งั้นคืนไฟล์เดิมตรงๆ
 * ภาพถ่ายแปลงเป็น JPEG (เติมพื้นหลังขาวถ้ามีโปร่งใส กัน JPEG เพี้ยนเป็นดำ) — สติกเกอร์คง PNG ไว้เพื่อรักษา alpha
 * ข้าม GIF/APNG เสมอ (ย่อผ่าน canvas จะเหลือเฟรมเดียว ทำลายแอนิเมชัน)
 */
async function prepareForUpload(file, kind) {
    const originalDataUrl = await getBase64Async(file);
    const originalExtension = getFileExtension(file) || "png";

    if (ANIMATED_TYPES.has(file.type)) {
        return { dataUrl: originalDataUrl, extension: originalExtension };
    }

    // เช็คจาก "ขนาดพิกเซลจริง" เท่านั้น ห้ามใช้ byte-size เป็นทางลัดข้ามการย่อ — รูปเรียบๆ (เช่นสติกเกอร์วงกลมสีล้วน)
    // ไฟล์เล็กมากได้ทั้งที่พิกเซลใหญ่เกินเพดาน (พบจริงตอนทดสอบ: สติกเกอร์ 1000x1000 หนักแค่ 41KB แต่ควรย่อเหลือ 512)
    const img = await loadImageEl(originalDataUrl);
    const maxDim = kind === "sticker" ? STICKER_MAX_DIM : PHOTO_MAX_DIM;
    if (img.naturalWidth <= maxDim && img.naturalHeight <= maxDim) {
        return { dataUrl: originalDataUrl, extension: originalExtension }; // เล็กกว่าเพดานอยู่แล้ว ไม่ต้องย่อซ้ำ
    }

    const scale = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (kind !== "sticker") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    if (kind === "sticker") {
        return { dataUrl: canvas.toDataURL("image/png"), extension: "png" };
    }
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), extension: "jpg" };
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
            const { dataUrl, extension } = await prepareForUpload(safeFile, kind);
            const base64Data = dataUrl.split(",")[1] ?? dataUrl;
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
