/**
 * REO TRAVEL ACADEMY — Application emailer + Live Chat backend
 * ============================================================
 * Built from scratch on Google Apps Script. No Meta, no Tawk.to,
 * no third-party chat service. Two jobs:
 *
 *  1. APPLICATIONS — receives the website application form
 *     (POST, type:"application") and emails it to the academy inbox
 *     via MailApp from your own Google account.
 *
 *  2. LIVE CHAT — receives visitor chat messages (POST, type:"chat"),
 *     stores them in a Google Sheet ("Chats" tab, auto-created in your
 *     Drive), serves them to the owner's password-protected Live Chat
 *     Desk (?page=admin), and notifies you by email (+ optional phone
 *     push via ntfy.sh) whenever a visitor sends a message.
 *
 * SETUP
 *  1. Paste this file into your Apps Script project at script.google.com.
 *  2. Set ACADEMY_EMAIL below to the inbox where notifications should land.
 *  3. (Recommended) Set NOTIFY_PUSH_URL for instant phone notifications
 *     — install the free "ntfy" app, subscribe to a secret topic name,
 *     and put https://ntfy.sh/YOUR-TOPIC-NAME here.
 *  4. Deploy > Manage deployments > Edit > Version: New version > Deploy
 *     (Execute as: Me / Who has access: Anyone). Keep the same URL — the
 *     website already points at it.
 *  5. Live Chat Desk: <web app URL>?page=admin — login with ADMIN_PASSWORD.
 *  6. Run testApplicationEmail() and testChatNotification() from the
 *     editor to confirm both routes.
 *
 * Optional: paste a Google Sheet ID into SPREADSHEET_ID to log every
 * application and chat in one spreadsheet.
 */

/* ---------------------------------------------------------
   CONFIG
--------------------------------------------------------- */
const ACADEMY_EMAIL  = "info.academy@reotravelsandtours.org"; // where application + chat notifications land
const SPREADSHEET_ID = "";                            // optional: a Google Sheet ID to log applications
const ADMIN_PASSWORD = "reo-academy-2027";            // password for the Live Chat Desk page (change it!)

/* --- WhatsApp relay (Meta Cloud API) -------------------------------
   Visitor chat → arrives in YOUR WhatsApp → you reply from WhatsApp
   → your reply appears back on the website chat. Fill these in from
   Meta > your app > WhatsApp > API Setup. See README.md for the
   permanent-token steps (System User token never expires). */
const WHATSAPP_TOKEN  = "EAAaqFYvMgdUBSiaYe5NKswR3GH9cUtCQkUMP6V75ZBzfBmXPKE3Ny9p7JuAQGjGj8qJaHlfPwUKfA4cJrCVfu5bZBZAsPbEkLtGXn83y3jHfyZCh4cp01wPTMhvqvDOZBk3MTp7BwZAqH1ZAf9llvsqblq1fIu1DrUoksXtmCtgb7A0KdRngUNvBX11dPxG7AZDZD";   // permanent System User token (Never expires)
const PHONE_NUMBER_ID = "1333267616541093";            // Meta > WhatsApp > API Setup
const OWNER_PHONE     = "2349134458065";            // your WhatsApp (digits only, with country code)
const VERIFY_TOKEN    = "reo-academy-2027";         // must match the Meta webhook config

// Optional INSTANT phone notifications via ntfy (backup to WhatsApp):
// install the free "ntfy" app, subscribe to a secret topic, put its URL here.
const NOTIFY_PUSH_URL = "https://ntfy.sh/reo-academy-chat-7xk2p9qz";
const CHAT_NOTIFY_THROTTLE_MIN = 0; // 0 = INSTANT — email + phone push for EVERY message.
                                     // Set to e.g. 3 to limit repeat alerts from one visitor.

/* ---------------------------------------------------------
   ENTRY POINTS
--------------------------------------------------------- */
// Invisible reply-polling widget: served by HtmlService (200, NO redirect
// through the flaky script.googleusercontent.com echo). The website embeds
// it as an invisible iframe with ALLOWALL and receives replies via
// postMessage — its google.script.run calls use Google's own RPC endpoint,
// which never touches our /exec URL at all.
const POLL_FRAME_HTML = `
<!DOCTYPE html>
<html>
<head><base target="_top"><meta charset="utf-8"/></head>
<body>
<script>
(function () {
  var qs = {};
  (location.search.replace(/^\\?/, "").split("&")).forEach(function (kv) {
    var p = kv.split("=");
    qs[p[0]] = decodeURIComponent(p[1] || "");
  });
  var sid = qs.sessionId || "";
  var after = Number(qs.after) || 0;
  function tick() {
    if (!sid || typeof google === "undefined" || !google.script) return;
    google.script.run
      .withSuccessHandler(function (d) {
        try {
          var reps = (d && d.replies) || [];
          reps.forEach(function (m) { if (m.t > after) after = m.t; });
          parent.postMessage({
            source: "reo-chat-poll",
            replies: reps,
            activeSession: (d && d.activeSession) || "",
          }, "*");
        } catch (err) {}
      })
      .withFailureHandler(function () {})
      .pollReplies_(sid, after);
  }
  tick();
  setInterval(tick, 5000);
})();
</script>
</body>
</html>
`;

function doGet(e) {
  const params = (e && e.parameter) || {};

  // (a) Meta's webhook verification handshake (once, when saving the
  //     webhook URL in the Meta dashboard)
  if (params["hub.mode"] === "subscribe" && params["hub.verify_token"] === VERIFY_TOKEN) {
    return ContentService.createTextOutput(params["hub.challenge"]);
  }

  // (b0) Invisible reply-polling iframe — ALLOWALL so the academy site can
  // embed it cross-origin. Only used if the fetch-based poll is blocked.
  if (params.page === "pollframe") {
    return HtmlService.createHtmlOutput(POLL_FRAME_HTML)
      .setTitle("")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // (b) The owner's password-protected Live Chat Desk
  if (params.page === "admin") {
    return HtmlService.createHtmlOutput(ADMIN_HTML)
      .setTitle("REO Academy — Live Chat Desk");
  }

  // (b) The website polling for agent replies to a chat session.
  //     GET is kept for curl/diagnostics; the site itself polls via POST
  //     (body.type === "poll" in doPost) — both share pollReplies_ below.
  if (params.sessionId) {
    return jsonOut(pollReplies_(params.sessionId, Number(params.after) || 0));
  }

  return ContentService.createTextOutput(
    "REO Travel Academy backend is running. Add ?page=admin for the chat desk."
  );
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ success: false, error: "invalid JSON" });
  }

  // (a) Application form from the website → email
  if (body.type === "application") {
    handleApplication(body);
    return jsonOut({ success: true });
  }

  // (b) Live chat message from the website → Google Sheet + your WhatsApp
  if (body.type === "chat") {
    handleChatMessage(body);
    return jsonOut({ success: true });
  }

  // (b1) Website polling for agent replies — served via POST so the response
  // never crosses Google's script.googleusercontent.com redirect (some Chrome
  // setups answer that redirect target with 404). This is the exact same
  // transport the working chat sends already use.
  if (body.type === "poll") {
    return jsonOut(pollReplies_(body.sessionId, Number(body.after) || 0));
  }

  // (b2) Website re-claims the conversation when a previously-chatty
  // session reopens its chat panel, so the owner's next WhatsApp reply is
  // stored under the session that is actually on screen. Sends no message.
  if (body.type === "touch") {
    if (body.sessionId) {
      PropertiesService.getScriptProperties().setProperty("active_session", String(body.sessionId));
      Logger.log("touch: active_session -> " + String(body.sessionId));
    }
    return jsonOut({ success: true });
  }

  // (c) Inbound webhook from Meta — a WhatsApp message YOU sent as a reply
  if (body.object === "whatsapp_business_account") {
    handleWhatsAppInbound(body);
    return jsonOut({ success: true });
  }

  return jsonOut({ success: false, error: "unrecognized payload" });
}

/* ---------------------------------------------------------
   REPLY POLL — shared by the GET (doGet) and POST (doPost) entry points.
   Returns every agent message for `sessionId` newer than `after`, plus
   active_session so the site can detect when replies are being stored
   under a different conversation than the one on screen.
--------------------------------------------------------- */
function pollReplies_(sessionId, after) {
  const sid = String(sessionId || "");
  const sheet = getChatSheet_();
  const rows = sheet.getDataRange().getValues();
  const replies = [];
  for (let i = 1; i < rows.length; i++) {
    const ts = rows[i][0] instanceof Date ? rows[i][0].getTime() : 0;
    if (sid && String(rows[i][1]) === sid && String(rows[i][2]) === "agent" && ts > after) {
      replies.push({ t: ts, text: String(rows[i][3]) });
    }
  }
  return {
    replies: replies,
    // Lets the site detect a session mismatch: if this differs from the
    // session it is polling, the owner's replies are landing elsewhere.
    activeSession: PropertiesService.getScriptProperties().getProperty("active_session") || "",
  };
}

/* ---------------------------------------------------------
   LIVE CHAT — storage (Google Sheet, auto-created on first use)
   Layout:  Timestamp | Session ID | Sender | Message
   Sender is "visitor" or "agent".
--------------------------------------------------------- */
function getChatSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty("CHAT_SHEET_ID") || SPREADSHEET_ID;
  let ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }
  if (!ss) {
    // Zero-config: create the chat spreadsheet in your Drive on first use
    ss = SpreadsheetApp.create("REO Travel Academy — Live Chat");
    props.setProperty("CHAT_SHEET_ID", ss.getId());
  }
  let sheet = ss.getSheetByName("Chats");
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName("Chats");
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Session ID", "Sender", "Message", "Name"]);
  }
  return sheet;
}

function appendChatRow_(sessionId, sender, text, name) {
  getChatSheet_().appendRow([new Date(), String(sessionId), sender, String(text).slice(0, 1000), name ? String(name).slice(0, 60) : ""]);
}

// Fallback when active_session is missing: the most recent visitor
// conversation (last 48h), so an owner reply is never silently dropped.
function latestVisitorSession_() {
  try {
    const rows = getChatSheet_().getDataRange().getValues();
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    for (let i = rows.length - 1; i >= 1; i--) {
      const ts = rows[i][0] instanceof Date ? rows[i][0].getTime() : 0;
      if (String(rows[i][2]) === "visitor" && ts >= cutoff && rows[i][1]) {
        return String(rows[i][1]);
      }
    }
  } catch (err) {
    Logger.log("latestVisitorSession_ error: " + err);
  }
  return null;
}

function handleChatMessage(d) {
  if (!d.sessionId || !d.text) return;
  const name = String(d.name || "").slice(0, 60);
  appendChatRow_(d.sessionId, "visitor", d.text, name);
  // WhatsApp relay must never break chat storage/notifications if it fails
  // (e.g. token or recipient issue) — log it and carry on.
  try {
    relayToWhatsApp_(d, name);
  } catch (err) {
    Logger.log("relayToWhatsApp_ failed: " + err);
  }
  notifyNewChatMessage_(d);
}

/* ---------------------------------------------------------
   WHATSAPP RELAY
   Out: visitor's message → your WhatsApp (Cloud API)
   In:  your WhatsApp reply → stored as an "agent" row, which the
        website picks up on its next poll and shows in the chat panel.
--------------------------------------------------------- */
function relayToWhatsApp_(d, name) {
  if (!WHATSAPP_TOKEN || WHATSAPP_TOKEN === "YOUR_META_ACCESS_TOKEN") return;

  // Remember whose conversation is active so your WhatsApp reply routes back here
  PropertiesService.getScriptProperties().setProperty("active_session", String(d.sessionId));

  const text =
    "🌐 *Website chat*" + (name ? " — " + name : "") + "\n" +
    (d.phone ? "WhatsApp: " + d.phone + "\n" : "") +
    "\n\"" + d.text + "\"\n\n" +
    "Reply to THIS chat — your reply appears on the website automatically.";

  const res = sendWhatsAppMessage(OWNER_PHONE, text);

  // Remember the WhatsApp id of this relayed message: if you reply by
  // QUOTING it, the inbound webhook can route your reply to this exact
  // conversation even if another visitor claimed active_session meanwhile.
  try {
    const wamid = res && res.messages && res.messages[0] && res.messages[0].id;
    if (wamid) {
      CacheService.getScriptCache().put("wamap_" + wamid, String(d.sessionId), 6 * 60 * 60);
      Logger.log("Mapped outbound " + wamid + " -> session " + d.sessionId);
    }
  } catch (mapErr) {
    Logger.log("wamid session map failed: " + mapErr);
  }
}

function handleWhatsAppInbound(body) {
  try {
    // TEMP DIAGNOSTIC — remove once the relay is confirmed working.
    // Logs the full raw payload so Executions shows exactly what Meta sent.
    Logger.log("Inbound webhook raw body: " + JSON.stringify(body));

    const value = body.entry[0].changes[0].value;

    // Delivery receipts for messages WE sent (sent / delivered / read /
    // failed) — logged so View > Executions shows exactly what happened
    // to each relayed visitor message.
    if (value.statuses && value.statuses.length) {
      value.statuses.forEach(function (st) {
        let line = "WhatsApp status [" + st.status + "] id=" + st.id;
        if (st.errors && st.errors.length) line += " errors=" + JSON.stringify(st.errors);
        Logger.log(line);
      });
      return;
    }

    if (!value.messages) {
      Logger.log("Inbound webhook: no 'messages' array on this event — value=" + JSON.stringify(value));
      return; // delivery/read receipt, not a message
    }

    const msg = value.messages[0];
    const from = String(msg.from || "").replace(/\D/g, "");
    const ownerDigits = OWNER_PHONE.replace(/\D/g, "");
    Logger.log("Inbound message — from=" + from + "  expected OWNER_PHONE=" + ownerDigits);

    if (from !== ownerDigits) {
      Logger.log("IGNORED — sender does not match OWNER_PHONE. Update OWNER_PHONE in CONFIG if this number is actually correct.");
      return; // only your own replies
    }

    const text = msg.text && msg.text.body;
    if (!text) {
      Logger.log("IGNORED — message from owner has no text body (image/audio/etc). msg=" + JSON.stringify(msg));
      return; // ignore images/audio etc.
    }

    // Which site conversation should this reply land in? Resolution order:
    // 1) the owner QUOTED a relayed message -> its WhatsApp id maps to a session
    // 2) active_session -> whoever messaged from the site most recently
    // 3) fallback -> the latest visitor conversation in the sheet (last 48h)
    const ctxId = msg.context && msg.context.id;
    let sessionId = ctxId ? CacheService.getScriptCache().get("wamap_" + ctxId) : null;
    let via = sessionId ? "quoted WhatsApp message" : "";
    if (!sessionId) {
      sessionId = PropertiesService.getScriptProperties().getProperty("active_session");
      if (sessionId) via = "active_session";
    }
    if (!sessionId) {
      sessionId = latestVisitorSession_();
      if (sessionId) via = "latest visitor in sheet";
    }
    Logger.log("Reply routed to session = " + sessionId + " (via " + (via || "NOTHING") + ")");
    if (!sessionId) {
      Logger.log("IGNORED — no active_session is set, so this reply has no conversation to attach to.");
      return;
    }

    // Stored as an agent message → the website poll picks it up within ~5s
    appendChatRow_(sessionId, "agent", text, "");
    Logger.log("SUCCESS — appended agent row for session " + sessionId + ": \"" + text + "\"");
    CacheService.getScriptCache().put("reply_" + sessionId, text, 6 * 60 * 60);
  } catch (err) {
    Logger.log("handleWhatsAppInbound error: " + err);
  }
}

function sendWhatsAppMessage(to, text) {
  // Fail fast with a clear cause: running this function directly from the
  // editor dropdown passes NO arguments (text = undefined -> Graph 400
  // "missing 'body'"). Real callers always pass both values.
  if (!to || !text) {
    throw new Error(
      "sendWhatsAppMessage requires 'to' and 'text' — got to=" +
        JSON.stringify(to) + ", text=" + JSON.stringify(text) +
        ". Do not run this function directly from the editor dropdown;" +
        " use testWhatsAppRelay() or send a chat message from the website."
    );
  }
  const url = "https://graph.facebook.com/v20.0/" + PHONE_NUMBER_ID + "/messages";
  const payload = {
    messaging_product: "whatsapp",
    to: String(to).replace(/\D/g, ""),
    type: "text",
    text: { body: text },
  };
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + WHATSAPP_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  const res = UrlFetchApp.fetch(url, options);
  const code = res.getResponseCode();
  const body = res.getContentText();
  Logger.log("WhatsApp send [" + code + "]: " + body);
  // Fail LOUDLY so the test function / Executions log shows the real
  // Graph API error (bad token, unverified recipient, etc.) instead of
  // pretending the message went out.
  if (code < 200 || code >= 300) {
    throw new Error("WhatsApp API " + code + " → " + body);
  }
  // Return the parsed Graph API response so callers can read the wamid of
  // the message we just sent (used to route the owner's quoted replies).
  try { return JSON.parse(body); } catch (parseErr) { return null; }
}

/* ---------------------------------------------------------
   CHAT NOTIFICATIONS — email (always) + instant phone push
   (optional ntfy.sh) whenever a visitor sends a message.
--------------------------------------------------------- */
function notifyNewChatMessage_(d) {
  // INSTANT by default: every visitor message sends an email + phone push
  // immediately. If CHAT_NOTIFY_THROTTLE_MIN > 0, repeat alerts from the
  // same visitor session are limited to once per that many minutes.
  const cache = CacheService.getScriptCache();
  const key = "chatnotif_" + d.sessionId;
  if (CHAT_NOTIFY_THROTTLE_MIN > 0) {
    if (cache.get(key)) return;
    cache.put(key, "1", CHAT_NOTIFY_THROTTLE_MIN * 60);
  }

  const deskUrl = deskUrl_();
  const snippet = String(d.text).slice(0, 300);
  const who = String(d.name || "A visitor");

  MailApp.sendEmail({
    to: ACADEMY_EMAIL,
    subject: "💬 " + who + ": " + snippet.slice(0, 60) + (snippet.length > 60 ? "…" : ""),
    htmlBody: chatNotifyEmailHtml_(d, deskUrl),
    name: "REO Travel Academy Chat",
  });

  if (NOTIFY_PUSH_URL) {
    try {
      UrlFetchApp.fetch(NOTIFY_PUSH_URL, {
        method: "post",
        contentType: "text/plain",
        // ntfy "Click" header: tapping the notification opens the Chat Desk
        headers: { Click: deskUrl },
        payload: "💬 " + who + " on website chat\n\n" + snippet + "\n\nYou can also reply from WhatsApp — it shows on the site.",
        muteHttpExceptions: true,
      });
    } catch (err) {
      Logger.log("push notification error: " + err);
    }
  }
}

function deskUrl_() {
  try {
    return ScriptApp.getService().getUrl() + "?page=admin";
  } catch (err) {
    return "(your web app URL + ?page=admin)";
  }
}

function chatNotifyEmailHtml_(d, deskUrl) {
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#ECE3D0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FBF7EC;border-radius:16px;overflow:hidden;">' +
    '<tr><td style="background:#0A4F48;padding:24px 32px;">' +
    '<div style="color:#E2A23C;font-size:11px;letter-spacing:2px;text-transform:uppercase;">&#128172; REO Travel Academy — Live Chat</div>' +
    '<div style="color:#FFFFFF;font-family:Georgia,serif;font-size:21px;margin-top:8px;">' +
    (d.name ? escapeHtml(d.name) + " is asking" : "A visitor needs you") + '</div></td></tr>' +
    '<tr><td style="padding:20px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:#F5EFE3;border-radius:10px;padding:16px 18px;">' +
    '<span style="color:#9A9284;font-size:10px;letter-spacing:1px;text-transform:uppercase;">They said</span><br>' +
    '<span style="color:#1F2D2F;font-size:15px;line-height:1.6;">' + escapeHtml(d.text) + '</span>' +
    "</td></tr></table></td></tr>" +
    '<tr><td style="padding:14px 32px 0;"><span style="color:#9A9284;font-size:11px;">Visitor: ' + escapeHtml(d.name || "not given") +
    ' &nbsp;·&nbsp; Conversation: ' + escapeHtml(d.sessionId) + '</span></td></tr>' +
    '<tr><td align="center" style="padding:20px 32px 8px;">' +
    '<a href="' + deskUrl + '" style="background:#E2A23C;color:#0A4F48;text-decoration:none;font-weight:bold;padding:13px 30px;border-radius:999px;display:inline-block;">Open the Chat Desk &#10148;</a>' +
    "</td></tr>" +
    '<tr><td style="padding:12px 32px 24px;"><span style="color:#9A9284;font-size:11px;">' +
    "This message also arrived in your WhatsApp — reply there and it appears on the website chat automatically, or reply in the Chat Desk." +
    "</span></td></tr>" +
    "</table></td></tr></table>"
  );
}

function checkAdmin_(pw) {
  if (pw !== ADMIN_PASSWORD) throw new Error("Wrong desk password.");
}

function verifyAdminPassword(pw) {
  return pw === ADMIN_PASSWORD;
}

function getConversations(pw) {
  checkAdmin_(pw);
  const rows = getChatSheet_().getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const sid = String(rows[i][1]);
    if (!sid) continue;
    const sender = String(rows[i][2]);
    const text = String(rows[i][3]);
    const ts = rows[i][0] instanceof Date ? rows[i][0].getTime() : 0;
    const name = String(rows[i][4] || "");
    if (!map[sid]) map[sid] = { id: sid, lastText: "", lastTs: 0, unread: 0, total: 0, name: "" };
    map[sid].total++;
    map[sid].lastText = text;
    map[sid].lastTs = ts;
    if (name) map[sid].name = name;
    if (sender === "agent") map[sid].unread = 0;
    else map[sid].unread++;
  }
  return Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return b.lastTs - a.lastTs; });
}

function getThread(pw, sessionId) {
  checkAdmin_(pw);
  const rows = getChatSheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) !== String(sessionId)) continue;
    out.push({
      sender: String(rows[i][2]),
      text: String(rows[i][3]),
      time: rows[i][0] instanceof Date ? rows[i][0].toISOString() : "",
    });
  }
  return out;
}

function sendReply(pw, sessionId, text) {
  checkAdmin_(pw);
  if (!sessionId || !text) return false;
  appendChatRow_(sessionId, "agent", text);
  return true;
}

/* ---------------------------------------------------------
   LIVE CHAT DESK — the owner's admin page
   Open:  <your web app URL>?page=admin
   Login: ADMIN_PASSWORD above
--------------------------------------------------------- */
const ADMIN_HTML = `
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8"/>
  <title>REO Academy — Live Chat Desk</title>
  <style>
    :root { --teal:#0A4F48; --amber:#E2A23C; --paper:#F5EFE3; --card:#FBF7EC; --ink:#1F2D2F; }
    * { box-sizing:border-box; margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; }
    body { background:var(--paper); color:var(--ink); }
    header { background:var(--teal); color:#fff; padding:12px 20px; }
    header .tag { color:var(--amber); font-size:11px; letter-spacing:2px; text-transform:uppercase; }
    header .t { font-family:Georgia,serif; font-size:18px; }
    main { display:grid; grid-template-columns:330px 1fr; height:calc(100vh - 58px); }
    #convos { border-right:1px solid #d8cfc0; overflow-y:auto; background:var(--card); }
    .convo { padding:12px 16px; border-bottom:1px solid #e5dcc9; cursor:pointer; }
    .convo:hover, .convo.active { background:var(--paper); }
    .convo .id { font-size:11px; color:#9A9284; word-break:break-all; }
    .convo .last { font-size:13px; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .badge { background:var(--amber); color:#0A4F48; border-radius:10px; font-size:11px; padding:1px 7px; font-weight:bold; }
    #right { display:flex; flex-direction:column; }
    #msgs { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:8px; }
    .m { max-width:70%; padding:9px 13px; border-radius:12px; font-size:14px; line-height:1.5; }
    .m.visitor { background:#fff; border:1px solid #e5dcc9; align-self:flex-start; }
    .m.agent { background:var(--teal); color:#fff; align-self:flex-end; }
    .m time { display:block; font-size:10px; opacity:.7; margin-top:3px; }
    #replybar { display:flex; gap:8px; padding:12px; border-top:1px solid #d8cfc0; background:var(--card); }
    #replybar input { flex:1; padding:11px 14px; border:1px solid #d8cfc0; border-radius:999px; font-size:14px; outline:none; }
    #replybar button { background:var(--teal); color:#fff; border:none; border-radius:999px; padding:0 22px; cursor:pointer; }
    #lock { display:flex; align-items:center; justify-content:center; height:calc(100vh - 58px); }
    #lock > div { background:var(--card); border:1px solid #d8cfc0; border-radius:14px; padding:28px; width:320px; text-align:center; }
    #lock input { width:100%; padding:10px; margin:12px 0; border:1px solid #d8cfc0; border-radius:8px; font-size:14px; }
    #lock button { width:100%; background:var(--teal); color:#fff; border:none; border-radius:8px; padding:11px; cursor:pointer; }
    #err { color:#a83a3a; font-size:12px; min-height:16px; }
    .empty { color:#9A9284; text-align:center; margin:auto; font-size:14px; }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="tag">&#9992; REO Travel Academy</div>
      <div class="t">Live Chat Desk</div>
    </div>
  </header>
  <div id="lock"><div>
    <div style="font-weight:bold;font-size:16px;">Chat Desk</div>
    <div style="font-size:12px;color:#9A9284;margin-top:4px;">Enter the desk password to see conversations.</div>
    <input id="pw" type="password" placeholder="Desk password" onkeydown="if(event.key==='Enter'){login()}"/>
    <div id="err"></div>
    <button onclick="login()">Unlock</button>
  </div></div>
  <main id="app" style="display:none;">
    <div id="convos"></div>
    <div id="right">
      <div id="msgs"><div class="empty">Select a conversation on the left.</div></div>
      <div id="replybar">
        <input id="reply-input" placeholder="Type a reply…" onkeydown="if(event.key==='Enter'){sendReply()}"/>
        <button onclick="sendReply()">Send &#10148;</button>
      </div>
    </div>
  </main>
  <script>
    var PW = "";
    var ACTIVE = null;

    function login() {
      var pw = document.getElementById("pw").value;
      document.getElementById("err").textContent = "";
      google.script.run
        .withSuccessHandler(function (ok) {
          if (ok) {
            PW = pw;
            document.getElementById("lock").style.display = "none";
            document.getElementById("app").style.display = "grid";
            refresh();
            setInterval(refresh, 5000);
          } else {
            document.getElementById("err").textContent = "Wrong password.";
          }
        })
        .withFailureHandler(function (e) { document.getElementById("err").textContent = e.message; })
        .verifyAdminPassword(pw);
    }

    function refresh() {
      loadConvos();
      if (ACTIVE) loadThread(ACTIVE, false);
    }

    function loadConvos() {
      google.script.run
        .withSuccessHandler(function (list) {
          var el = document.getElementById("convos");
          el.innerHTML = "";
          if (!list.length) {
            el.innerHTML = '<div class="empty" style="padding:30px;">No conversations yet.<br>They appear here when a visitor chats.</div>';
            return;
          }
          list.forEach(function (c) {
            var d = document.createElement("div");
            d.className = "convo" + (c.id === ACTIVE ? " active" : "");
            d.innerHTML =
              '<div class="id">' + escapeH(c.id) + (c.unread ? ' <span class="badge">' + c.unread + '</span>' : '') + '</div>' +
              '<div class="last">' + escapeH(c.lastText) + '</div>';
            d.onclick = function () { ACTIVE = c.id; loadThread(c.id, true); loadConvos(); };
            el.appendChild(d);
          });
        })
        .withFailureHandler(function (e) { alert(e.message); })
        .getConversations(PW);
    }

    function loadThread(id, scroll) {
      google.script.run
        .withSuccessHandler(function (msgs) {
          var el = document.getElementById("msgs");
          var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          el.innerHTML = "";
          if (!msgs.length) { el.innerHTML = '<div class="empty">No messages in this conversation.</div>'; return; }
          msgs.forEach(function (m) {
            var d = document.createElement("div");
            d.className = "m " + m.sender;
            var t = m.time ? new Date(m.time).toLocaleString() : "";
            d.innerHTML = escapeH(m.text) + "<time>" + t + "</time>";
            el.appendChild(d);
          });
          if (scroll || atBottom) el.scrollTop = el.scrollHeight;
        })
        .withFailureHandler(function (e) { alert(e.message); })
        .getThread(PW, id);
    }

    function sendReply() {
      var input = document.getElementById("reply-input");
      var text = input.value.trim();
      if (!text || !ACTIVE) return;
      input.value = "";
      google.script.run
        .withSuccessHandler(function () { loadThread(ACTIVE, true); loadConvos(); })
        .withFailureHandler(function (e) { alert(e.message); })
        .sendReply(PW, ACTIVE, text);
    }

    function escapeH(s) {
      var d = document.createElement("div");
      d.textContent = (s == null ? "" : String(s));
      return d.innerHTML;
    }
  </script>
</body>
</html>
`;

/* ---------------------------------------------------------
   APPLICATION FORM → EMAIL
--------------------------------------------------------- */
function handleApplication(d) {
  const name = [d.first_name, d.middle_name, d.last_name]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" ");

  const subject =
    "New Academy Application - " + (name || "Unnamed") +
    " (" + (d.preferred_intake || "no intake selected") + ")";

  MailApp.sendEmail({
    to: ACADEMY_EMAIL,
    subject: subject,
    body: applicationPlainText(d, name),
    htmlBody: applicationEmailHtml(d, name),
    replyTo: d.email || undefined,
    name: "REO Travel Academy Website",
  });

  logApplicationToSheet(d, name);
}

function applicationEmailHtml(d, name) {
  const row = (label, value, bold) =>
    "<tr>" +
    '<td style="padding:10px 0;border-bottom:1px solid #E5DCC9;color:#7B7466;width:42%;">' + label + "</td>" +
    '<td style="padding:10px 0;border-bottom:1px solid #E5DCC9;' + (bold ? "font-weight:bold;" : "") + '">' +
    (value ? escapeHtml(value) : "-") + "</td></tr>";

  return (
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#ECE3D0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FBF7EC;border-radius:16px;overflow:hidden;">' +

    '<tr><td style="background:#0A4F48;padding:26px 32px;">' +
    '<div style="color:#E2A23C;font-size:11px;letter-spacing:2px;text-transform:uppercase;">&#9992; REO Travel Academy</div>' +
    '<div style="color:#FFFFFF;font-family:Georgia,serif;font-size:22px;margin-top:8px;">New Application Received</div></td></tr>' +

    '<tr><td style="padding:22px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:#F5EFE3;border-radius:10px;padding:14px 18px;">' +
    '<span style="color:#9A9284;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Applicant</span><br>' +
    '<span style="color:#1F2D2F;font-family:Georgia,serif;font-size:19px;">' + name + "</span>" +
    "</td></tr></table></td></tr>" +

    '<tr><td style="padding:14px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:#E2A23C;border-radius:10px;padding:14px 18px;">' +
    '<span style="color:#0A4F48;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;">Preferred course</span><br>' +
    '<span style="color:#0A4F48;font-family:Georgia,serif;font-size:16px;font-weight:bold;">' + escapeHtml(d.course || "-") + "</span><br>" +
    '<span style="color:#0A4F48;font-size:12px;">Preferred intake: ' + escapeHtml(d.preferred_intake || "-") + "</span>" +
    "</td></tr></table></td></tr>" +

    '<tr><td style="padding:18px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#1F2D2F;">' +
    row("First name", d.first_name, true) +
    row("Last name", d.last_name, true) +
    row("Middle name", d.middle_name) +
    row("Phone number", d.phone, true) +
    row("Email address", d.email, true) +
    row("Available for physical classes", d.physical_availability, true) +
    row("Agreed to registration terms", d.agree_terms, true) +
    row("Ready to pay registration fee", d.pay_fee, true) +
    "</table></td></tr>" +

    '<tr><td style="padding:22px 32px 26px;border-top:1px solid #E5DCC9;">' +
    '<span style="font-size:11px;color:#9A9284;">Sent automatically by the REO Travel Academy website application form.<br>Learn. Lead. Excel. - a programme of REO Travels &amp; Tour.</span>' +
    "</td></tr>" +

    "</table></td></tr></table>"
  );
}

function applicationPlainText(d, name) {
  return [
    "NEW ACADEMY APPLICATION",
    "",
    "Applicant: " + name,
    "Phone: " + (d.phone || "-"),
    "Email: " + (d.email || "-"),
    "Preferred course: " + (d.course || "-"),
    "Preferred intake: " + (d.preferred_intake || "-"),
    "Available for physical classes: " + (d.physical_availability || "-"),
    "Agreed to registration terms: " + (d.agree_terms || "-"),
    "Ready to pay registration fee: " + (d.pay_fee || "-"),
    "",
    "Sent automatically by the REO Travel Academy website application form.",
  ].join("\n");
}

/* ---------------------------------------------------------
   OPTIONAL: LOG EVERY APPLICATION TO A GOOGLE SHEET
--------------------------------------------------------- */
function logApplicationToSheet(d, name) {
  if (!SPREADSHEET_ID) return;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Applications") || ss.insertSheet("Applications");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Name", "Phone", "Email", "Course", "Preferred intake", "Physical classes", "Terms agreed", "Fee ready"]);
    }
    sheet.appendRow([
      new Date(), name, d.phone || "", d.email || "", d.course || "",
      d.preferred_intake || "", d.physical_availability || "", d.agree_terms || "", d.pay_fee || "",
    ]);
  } catch (err) {
    Logger.log("logApplicationToSheet error: " + err);
  }
}

/* ---------------------------------------------------------
   TESTS — select the function in the toolbar dropdown,
   click Run, then check View > Executions.
--------------------------------------------------------- */
function testApplicationEmail() {
  handleApplication({
    first_name: "Test", last_name: "Applicant", middle_name: "",
    phone: "2340000000000", email: ACADEMY_EMAIL,
    course: "Diploma in Travel Agency Management",
    physical_availability: "Yes - I can attend physical classes",
    preferred_intake: "Winter (Jan - Mar)",
    agree_terms: "Yes", pay_fee: "Yes",
  });
  Logger.log("Test application emailed to " + ACADEMY_EMAIL);
}

function testChatNotification() {
  // Sends a sample chat notification email (and phone push, if
  // NOTIFY_PUSH_URL is set) so you can confirm notifications work.
  notifyNewChatMessage_({
    sessionId: "test_session_" + Date.now(),
    text: "Hello! I want to know more about the Diploma programme.",
    name: "Ada Obi",
  });
  Logger.log("Test chat notification sent to " + ACADEMY_EMAIL);
}

function testWhatsAppRelay() {
  // Sends a sample visitor message to YOUR WhatsApp so you can test the
  // full loop: you should receive it on WhatsApp, and your reply to that
  // WhatsApp chat will land back on the website chat automatically.
  // If delivery fails, the run FAILS and View > Executions shows the
  // exact Graph API error (e.g. #131030 recipient not verified).
  relayToWhatsApp_(
    { sessionId: "test_session_" + Date.now(), text: "Testing the WhatsApp relay. Please reply to this message." },
    "Ada Obi"
  );
  Logger.log("✅ WhatsApp relay message SENT to " + OWNER_PHONE + " — check your phone.");
}

/* ---------------------------------------------------------
   HELPER
--------------------------------------------------------- */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}