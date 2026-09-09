// render/index.js — จุดเดียวที่ inject.js เรียก dispatch ไปหา renderer ตาม card type

import { renderTweet } from "./x.js";
import { renderChatThread, renderChatCall, renderChatMoney, renderChatNoti } from "./chat.js";
import { renderIgPost, renderIgStory, renderIgCommentStandalone } from "./instagram.js";

/** การ์ดเดี่ยว (ไม่ผ่านการรวมกลุ่มของ groupRuns หรือรวมแล้วแต่ยังเป็น type:"card" เช่น ig_post ที่ผูก comments มาด้วย) */
export function renderCard(model, mes) {
    switch (model.card) {
        case "tweet": return renderTweet(model, mes);
        case "chat_call": return renderChatCall(model);
        case "chat_money": return renderChatMoney(model);
        case "chat_noti": return renderChatNoti(model);
        case "ig_post": return renderIgPost(model, mes);
        case "ig_story": return renderIgStory(model, mes);
        case "ig_comment": return renderIgCommentStandalone(model, mes); // ไม่มี IG_POST นำหน้าให้ผูก
        default: return null; // stream — ยังไม่มี renderer (รอบ 2)
    }
}

/** กลุ่มแท็กแชทที่ groupRuns() รวมไว้ (msg/chat_head/chat_title/chat_slip/chat_gift ที่ติดกัน) */
export function renderGroup(items, mes) {
    return renderChatThread(items, mes);
}
