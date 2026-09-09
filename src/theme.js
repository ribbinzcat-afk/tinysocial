// theme.js — deps = 0 (อ่านแค่ CSS custom property ของ ST ผ่าน DOM ปกติ ไม่ import อะไรจาก core)

let cachedDark = null;

function parseRgb(str) {
    const m = String(str || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** true = ธีม ST ปัจจุบัน "มืด" — อ่านจาก --SmartThemeBlurTintColor แล้วคำนวณ relative luminance */
export function isStDark() {
    if (cachedDark !== null) return cachedDark;
    try {
        const val = getComputedStyle(document.body).getPropertyValue("--SmartThemeBlurTintColor").trim();
        const rgb = parseRgb(val);
        if (!rgb) { cachedDark = true; return cachedDark; } // อ่านไม่ได้ → เดามืด (ธีมส่วนใหญ่ของ ST เป็นมืด)
        const [r, g, b] = rgb;
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        cachedDark = luminance < 0.5;
    } catch {
        cachedDark = true;
    }
    return cachedDark;
}

/** เรียกตอน SETTINGS_UPDATED (ผู้ใช้อาจเปลี่ยนธีม ST) เพื่อคำนวณใหม่ครั้งถัดไปที่ isStDark() ถูกเรียก */
export function invalidateThemeCache() {
    cachedDark = null;
}

export function resolveTheme(platformTheme) {
    if (platformTheme === "auto") return isStDark() ? "dark" : "light";
    return platformTheme === "light" ? "light" : "dark";
}
