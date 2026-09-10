// render/index.js — จุดเดียวที่ inject.js เรียก dispatch ไปหา renderer ตาม card type

import { renderTweet } from "./x.js";
import { renderChatThread, renderChatCall, renderChatMoney, renderChatNoti } from "./chat.js";
import { renderIgPost, renderIgStory, renderIgCommentStandalone } from "./instagram.js";
import { renderStreamTitle, renderStreamMember, renderStreamDono, renderStreamLike, renderStreamHilight, renderStreamEnd, renderStreamChatFeed } from "./stream.js";

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
        case "stream_title": return renderStreamTitle(model);
        case "stream_member": return renderStreamMember(model);
        case "stream_dono": return renderStreamDono(model);
        case "stream_like": return renderStreamLike(model);
        case "stream_hilight": return renderStreamHilight(model);
        case "stream_end": return renderStreamEnd(model);
        case "stream_chat_legacy": return renderStreamChatFeed(model.fields.pairs || []); // ALLCOM เดิม — ไม่ผ่านการรวมกลุ่ม มี pairs ในตัวอยู่แล้ว
        default: return null;
    }
}

/** กลุ่มแท็กที่ groupRuns() รวมไว้: แชท LINE (msg/chat_head/chat_title/chat_slip/chat_gift) หรือแชทสด (stream_comment) */
export function renderGroup(runType, items, mes) {
    if (runType === "stream_chat_thread") {
        return renderStreamChatFeed(items.map((it) => it.fields));
    }
    return renderChatThread(items, mes);
}
