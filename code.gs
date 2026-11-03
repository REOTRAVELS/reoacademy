const ACADEMY_EMAIL = "info.academy@reotravelsandtours.org"; // where application + chat notifications land
const SPREADSHEET_ID = "";                            // optional: a Google Sheet ID to log applications
const ADMIN_PASSWORD = "reo-academy-2027";            // password for the Live Chat Desk page (CHANGE IT — make it different from VERIFY_TOKEN)

/* --- WhatsApp relay (Meta Cloud API) -------------------------------
   Visitor chat → arrives in YOUR WhatsApp → you reply from WhatsApp
   → your reply appears back on the website chat. Fill these in from
   Meta > your app > WhatsApp > API Setup. See README.md for the
   permanent-token steps (System User token never expires). */
// The old token was exposed publicly — revoke it in Meta and paste the NEW one here.
const WHATSAPP_TOKEN  = "PASTE_YOUR_NEW_META_SYSTEM_USER_TOKEN_HERE";
const PHONE_NUMBER_ID = "1333267616541093";            // Meta > WhatsApp > API Setup
const OWNER_PHONE     = "2349134458065";            // your WhatsApp (digits only, with country code)
const VERIFY_TOKEN    = "reo-academy-2027";         // must match the Meta webhook config

// Optional INSTANT phone notifications via ntfy (backup to WhatsApp):
// install the free "ntfy" app, subscribe to a secret topic, put its URL here.
const NOTIFY_PUSH_URL = "https://ntfy.sh/reo-academy-chat-7xk2p9qz";
const CHAT_NOTIFY_THROTTLE_MIN = 0; // 0 = INSTANT — email + phone push for EVERY message.
                                     // Set to e.g. 3 to limit repeat alerts from one visitor.

/* --- Application anti-bot settings ---------------------------------
   An application email is sent ONLY if every check in
   validateApplication_() passes. Must match the website form exactly. */
const VALID_COURSES = [
  "Diploma in Travel Agency Management",
  "Certification in Customer Relations Management",
  "Certification in Human Resources Management",
];
const VALID_INTAKES = [
  "Winter (Jan – Mar)",
  "Spring (Apr – Jun)",
  "Summer (Jul – Sep)",
  "Fall (Oct – Dec)",
];
const MIN_FILL_SECONDS = 5;           // a human can't fill this form faster
const MAX_APPLICATIONS_PER_HOUR = 20; // global flood guard

/* --- Kora (Korapay) payments ---------------------------------------
   The registration fee is collected on the website with Kora's checkout
   (PUBLIC key, lives in js/academy.js). THIS script then verifies each
   payment with Kora using the SECRET key before accepting the application.

   SECRET KEY SETUP — do NOT paste the key in this file:
   Project Settings (gear) → Script properties → Add property
        KORA_SECRET_KEY  =  sk_test_...   (use sk_live_... when you go live)

   REGISTRATION_FEES = amount (₦) the SERVER expects for each course. It must
   match `registrationFee` in js/academy.js. The browser's amount is never trusted. */
const REGISTRATION_FEES = {
  "Diploma in Travel Agency Management": 5000,              // must equal registrationFee in js/academy.js
  "Certification in Customer Relations Management": 5000,   // must equal registrationFee in js/academy.js
  "Certification in Human Resources Management": 5000,      // must equal registrationFee in js/academy.js
};
// Tuition fees collected in Step 2 (must equal tuitionFee in js/academy.js).
const TUITION_FEES = {
  "Diploma in Travel Agency Management": 150000,
  "Certification in Customer Relations Management": 70000,
  "Certification in Human Resources Management": 50000,
};
const KORA_CHARGE_URL = "https://api.korapay.com/merchant/api/v1/charges/";
const KORA_INIT_URL   = "https://api.korapay.com/merchant/api/v1/charges/initialize";
const PAYMENT_HEADERS = [
  "Timestamp", "Payment Reference", "Kora Reference", "Amount Paid (NGN)", "Course",
  "Applicant", "Email", "Phone", "Source", "Application Recorded",
];

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
    "REO Travel Academy backend is running (version: hosted-checkout-v5). Add ?page=admin for the chat desk."
  );
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ success: false, error: "invalid JSON" });
  }

  // (a) Application form from the website → verify Kora payment → email.
  //     An application is only accepted once its registration-fee payment
  //     has been verified with Kora (see handlePaidApplication_ below).
  //     Replies include both `success` (legacy) and `ok` (used by the site).
  if (body.type === "application") {
    return jsonOut(handlePaidApplication_(body));
  }

  // (a1) Website starts a payment: validate the application, save it as
  // "pending", ask Kora for a hosted checkout link, send it back.
  if (body.type === "start_payment") {
    return jsonOut(handleStartPayment_(body));
  }

  if (body.type === "start_tuition") {
    return jsonOut(handleStartTuition_(body));
  }
  // (a1b) Visitor returns from Kora's checkout page: verify the payment with
  // Kora, then turn the saved pending application into a real one.
  if (body.type === "complete") {
    return jsonOut(handleCompletePayment_(body));
  }

  // (a2) Website asks "did Kora receive this payment?" (used when the checkout
  // closes without telling the page). Re-checks with Kora; trusts nothing from the browser.
  if (body.type === "verify") {
    const ref = String(body.payment_reference || "").trim();
    if (!/^[A-Za-z0-9_\-]{8,100}$/.test(ref)) return jsonOut({ ok: false, paid: false });
    const r = fetchKoraCharge_(ref);
    const paid = !!(r.ok && String(r.data.status).toLowerCase() === "success");
    Logger.log("verify " + ref + " -> " + (paid ? "success" : (r.error || r.data.status)));
    return jsonOut({ ok: true, paid: paid });
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

  // (d) Webhook from Kora (the website passes this URL as notification_url).
  //     Safety net: records successful payments even if the visitor closes
  //     the tab before their application is sent.
  if (body.event && body.data && String(body.event).indexOf("charge.") === 0) {
    return jsonOut(handleKoraWebhook_(body));
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
  if (!WHATSAPP_TOKEN || WHATSAPP_TOKEN.indexOf("PASTE_YOUR") === 0 || WHATSAPP_TOKEN === "YOUR_META_ACCESS_TOKEN") return;

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

  sendMail_({
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
   APPLICATION FORM → EMAIL  (strictly real submissions only)
--------------------------------------------------------- */

// Returns null if the submission looks like a genuine human application,
// otherwise a short reason string (logged in View > Executions).
function validateApplication_(d) {
  const clean = function (v) { return String(v == null ? "" : v).trim(); };
  const nameRe = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’.\- ]{1,59}$/;

  // 1) Honeypot — invisible to people, bots fill it
  if (clean(d.hp_field)) return "honeypot filled";

  // 2) Timing — form must have been open >= MIN_FILL_SECONDS and < 24h
  const opened = Number(d.form_opened_at);
  const age = Date.now() - opened;
  if (!opened || age < MIN_FILL_SECONDS * 1000 || age > 24 * 3600 * 1000) return "bad timing";

  // 3) Real-looking identity fields
  if (!nameRe.test(clean(d.first_name)) || !nameRe.test(clean(d.last_name))) return "bad name";
  if (clean(d.middle_name) && !nameRe.test(clean(d.middle_name))) return "bad middle name";

  const digits = clean(d.phone).replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "bad phone";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(d.email))) return "bad email";

  // 4) Values must be exactly what the website form can produce
  if (VALID_COURSES.indexOf(clean(d.course)) === -1) return "bad course";
  if (VALID_INTAKES.indexOf(clean(d.preferred_intake)) === -1) return "bad intake";
  if (["Yes", "No"].indexOf(clean(d.physical_availability)) === -1) return "bad physical availability";

  // 5) Both consent boxes must have been ticked
  if (d.agree_terms !== "Yes" || d.pay_fee !== "Yes") return "terms not accepted";

  return null;
}

function md5Key_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s);
  return Utilities.base64EncodeWebSafe(bytes);
}

/* ---------------------------------------------------------
   PAID APPLICATIONS — Kora verification
   Flow: anti-bot checks → ask Kora if the payment is real, successful and
   the right amount → record it in the "Payments" tab → send the emails.
   The same payment reference can only ever create ONE application, so a
   retry (bad network, double click) is harmless.
--------------------------------------------------------- */
function handlePaidApplication_(d) {
  const fail = function (msg) { return { success: false, ok: false, error: msg }; };

  const ref = String(d.payment_reference || "").trim();
  if (!/^[A-Za-z0-9_\-]{8,100}$/.test(ref)) {
    Logger.log("REJECTED application (missing/invalid payment reference)");
    return fail("Missing or invalid payment reference");
  }

  const reason = validateApplication_(d);
  if (reason) {
    Logger.log("REJECTED application (" + reason + "): " + JSON.stringify(d).slice(0, 300));
    return fail("Application details rejected: " + reason);
  }

  const rawName = [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(" ");
  let paid;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ledger = getPaymentsSheet_();
    const row = findPaymentRow_(ledger, ref);

    // Already turned into an application → success, but no second email.
    if (row && String(ledger.getRange(row, 10).getValue()) === "Yes") {
      Logger.log("Paid application already recorded for " + ref + " — ignoring repeat");
      return { success: true, ok: true, duplicate: true };
    }

    const v = verifyKoraPayment_(ref, String(d.course).trim());
    if (!v.ok) {
      Logger.log("PAYMENT NOT VERIFIED for " + ref + ": " + v.error);
      return fail(v.error);
    }
    paid = v;

    const values = [
      new Date(), ref, v.koraRef, v.paid, String(d.course).trim(), rawName,
      String(d.email).trim(), "'" + String(d.phone).trim(), "application", "Yes",
    ];
    if (row) ledger.getRange(row, 1, 1, values.length).setValues([values]);
    else ledger.appendRow(values);
  } finally {
    lock.releaseLock();
  }

  // Emails + optional sheet log. The application is already safely recorded
  // in the Payments tab above, so a failure here never loses it.
  d.payment_reference = ref;                  // trusted: just verified
  d.amount_paid = paid.paid;                  // from Kora, not from the browser
  const name = [d.first_name, d.middle_name, d.last_name].filter(Boolean).map(escapeHtml).join(" ");
  try {
    sendMail_({
      to: ACADEMY_EMAIL,
      subject: "New PAID Academy Application - " + name + " (" + d.preferred_intake + ")",
      body: applicationPlainText(d, name),
      htmlBody: applicationEmailHtml(d, name),
      replyTo: d.email || undefined,
      name: "REO Travel Academy Website",
    });
  } catch (err) {
    Logger.log("Owner email failed (application is saved in Payments tab): " + err);
  }
  try {
    sendApplicantConfirmation_(d, name);
  } catch (err) {
    Logger.log("Applicant confirmation failed: " + err);
  }
  logApplicationToSheet(d, name);

  return { success: true, ok: true };
}

/* ---------------------------------------------------------
   HOSTED KORA CHECKOUT (redirect flow — replaces the popup)
   start_payment : validate + save "Pending" row + Kora initialize -> checkout_url
   complete      : visitor came back -> verify with Kora -> record + emails
   webhook       : Kora's charge.success also completes the pending row,
                   so a paid application is never lost if the tab is closed.
--------------------------------------------------------- */
function getPendingSheet_() {
  const ss = getChatSheet_().getParent();
  let sheet = ss.getSheetByName("Pending");
  if (!sheet) sheet = ss.insertSheet("Pending");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Payment Reference", "Application JSON"]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function savePending_(ref, d) {
  getPendingSheet_().appendRow([new Date(), ref, JSON.stringify(d)]);
}

function loadPending_(ref) {
  const sheet = getPendingSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const vals = sheet.getRange(2, 2, last - 1, 2).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === String(ref)) {
      try { return JSON.parse(String(vals[i][1])); } catch (err) { return null; }
    }
  }
  return null;
}

// Turns a saved pending application into a real one (verifies with Kora first).
function finalizePending_(ref) {
  const d = loadPending_(ref);
  if (!d) return null;
  d.payment_reference = ref;
  d.form_opened_at = String(Date.now() - 60000); // already validated when it was saved
  if (d.payment_stage === "tuition") {
    if (!d.registration_reference) {
      // try to recover from pending under reg ref? 
    }
    return handleTuitionPaid_(d);
  }
  return handleRegistrationPaid_(d);
}

function handleStartPayment_(d) {
  const fail = function (msg) { return { success: false, ok: false, error: msg }; };

  const reason = validateApplication_(d);
  if (reason) {
    Logger.log("REJECTED start_payment (" + reason + "): " + JSON.stringify(d).slice(0, 300));
    return fail("Application details rejected: " + reason);
  }
  const course = String(d.course).trim();
  const amount = REGISTRATION_FEES[course];
  if (!amount) return fail("Unknown course");

  const returnUrl = String(d.return_url || "").trim();
  if (!/^https?:\/\/[^\s?#]+$/.test(returnUrl)) return fail("Open the website through its web address (not a local file) to pay");

  // Flood guard on Kora checkout creation
  const cache = CacheService.getScriptCache();
  const hourKey = "startpay_" + Math.floor(Date.now() / 3600000);
  const count = Number(cache.get(hourKey) || 0);
  if (count >= 60) return fail("Too many payment attempts right now — please try again shortly");
  cache.put(hourKey, String(count + 1), 3600);

  const secret = PropertiesService.getScriptProperties().getProperty("KORA_SECRET_KEY");
  if (!secret) return fail("Payment key is not configured on the server (add KORA_SECRET_KEY in Script properties)");

  const ref = "REO-" + Utilities.getUuid().replace(/-/g, "").slice(0, 20).toUpperCase();
  const name = [d.first_name, d.last_name].filter(Boolean).join(" ").trim();

  const payload = {
    amount: amount,
    currency: "NGN",
    reference: ref,
    redirect_url: returnUrl, // Kora adds ?reference=... itself when it sends the visitor back
    narration: "Registration fee - " + course,
    customer: { name: name, email: String(d.email).trim() },
  };
  // notification_url intentionally not sent: set the webhook URL once in the Kora dashboard instead.

  let res;
  try {
    res = UrlFetchApp.fetch(KORA_INIT_URL, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + secret.trim() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log("Kora initialize unreachable: " + err);
    return fail("Could not reach Kora to start the payment");
  }
  const code = res.getResponseCode();
  let out = null;
  try { out = JSON.parse(res.getContentText()); } catch (err) { /* below */ }
  Logger.log("Kora initialize [" + code + "]: " + res.getContentText().slice(0, 400));
  if (!out || !out.status || !out.data || !out.data.checkout_url) {
    const why = out && out.message ? out.message : ("HTTP " + code);
    return fail("Kora could not start the payment: " + why);
  }

  // Save the application so it can be completed after payment (even if the tab closes).
  const saved = Object.assign({}, d);
  delete saved.return_url;
  delete saved.type;
  saved.payment_reference = ref;
  savePending_(ref, saved);

  return { success: true, ok: true, checkout_url: out.data.checkout_url, reference: ref };
}

function handleCompletePayment_(body) {
  const ref = String(body.payment_reference || "").trim();
  if (!/^[A-Za-z0-9_\-]{8,100}$/.test(ref)) return { success: false, ok: false, error: "Invalid payment reference" };

  const r = finalizePending_(ref);
  if (!r) {
    // Not pending any more — maybe the webhook already completed it.
    const ledger = getPaymentsSheet_();
    const row = findPaymentRow_(ledger, ref);
    if (row && String(ledger.getRange(row, 10).getValue()) === "Yes") return { success: true, ok: true, stage: "complete", duplicate: true };
    if (row) {
      const course = String(ledger.getRange(row, 5).getValue()).trim();
      const regRef = ref;
      return { success: true, ok: true, stage: "registration_paid", registration_reference: regRef, tuition_amount: (TUITION_FEES[course] || 0) };
    }
    return { success: false, ok: false, error: "We couldn't find this payment attempt" };
  }
  if (!r.ok && /^Payment (not found|status is)/.test(String(r.error))) r.notPaid = true;
  if (r && r.notPaid && !r.stage) r.stage = (r.registration_reference ? "tuition" : undefined);
  return r;
}

// Calls Kora's "verify charge" endpoint with the SECRET key.
// Returns { ok:true, data } or { ok:false, error, code }.
function fetchKoraCharge_(reference) {
  const secret = PropertiesService.getScriptProperties().getProperty("KORA_SECRET_KEY");
  if (!secret) {
    return { ok: false, error: "Payment key is not configured on the server (add KORA_SECRET_KEY in Script properties)" };
  }
  let res;
  try {
    res = UrlFetchApp.fetch(KORA_CHARGE_URL + encodeURIComponent(reference), {
      method: "get",
      headers: { Authorization: "Bearer " + secret },
      muteHttpExceptions: true,
    });
  } catch (err) {
    return { ok: false, error: "Could not reach Kora to verify the payment" };
  }
  const code = res.getResponseCode();
  let body = null;
  try { body = JSON.parse(res.getContentText()); } catch (err) { /* handled below */ }
  if (code === 401 || code === 403) return { ok: false, code: code, error: "Kora rejected the secret key (check KORA_SECRET_KEY is correct and matches test/live mode)" };
  if (code !== 200 || !body || !body.status || !body.data) {
    return { ok: false, code: code, error: "Payment not found at Kora" };
  }
  return { ok: true, data: body.data };
}

// Checks: payment exists, status is success, currency is NGN, and the amount
// paid covers the registration fee for this course (the server's own price list).
function verifyKoraPayment_(reference, courseTitle) {
  const expected = REGISTRATION_FEES[courseTitle];
  if (!expected) return { ok: false, error: "Unknown course" };

  const r = fetchKoraCharge_(reference);
  if (!r.ok) return r;

  const p = r.data;
  if (String(p.status).toLowerCase() !== "success") {
    return { ok: false, error: "Payment status is '" + p.status + "', not success" };
  }
  if (p.currency && String(p.currency).toUpperCase() !== "NGN") {
    return { ok: false, error: "Payment currency is not NGN" };
  }
  const paid = Number(p.amount_paid != null ? p.amount_paid : p.amount);
  if (!(paid >= expected)) {
    return { ok: false, error: "Amount paid (" + naira_(paid) + ") is less than the registration fee (" + naira_(expected) + ")" };
  }
  return { ok: true, paid: paid, koraRef: p.reference || reference };
}

// Kora calls this (notification_url) when a payment succeeds. Apps Script can't
// read request headers, so Kora's signature can't be checked here — instead we
// IGNORE the payload's claims and re-ask Kora ourselves with the secret key.
function handleKoraWebhook_(body) {
  try {
    if (body.event !== "charge.success") return { success: true };
    const ref = String(body.data.payment_reference || body.data.reference || "");
    if (!ref) return { success: true };

    const r = fetchKoraCharge_(ref);
    if (!r.ok || String(r.data.status).toLowerCase() !== "success") {
      Logger.log("Kora webhook for " + ref + " could not be verified: " + (r.error || r.data.status));
      return { success: true };
    }

    // If this payment belongs to a saved pending application, complete it now.
    const fin = finalizePending_(ref);
    if (fin) {
      Logger.log("Kora webhook: pending application for " + ref + " -> " + JSON.stringify(fin));
      return { success: true };
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ledger = getPaymentsSheet_();
      if (!findPaymentRow_(ledger, ref)) {
        const paid = Number(r.data.amount_paid != null ? r.data.amount_paid : r.data.amount);
        ledger.appendRow([new Date(), ref, r.data.reference || "", paid, "", "", "", "", "webhook", "No"]);
        Logger.log("Kora webhook: payment " + ref + " logged (no application attached yet)");
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log("handleKoraWebhook_ error: " + err);
  }
  return { success: true };
}

// "Payments" tab lives in the same spreadsheet as the chat log (auto-created).
function getPaymentsSheet_() {
  const ss = getChatSheet_().getParent();
  let sheet = ss.getSheetByName("Payments");
  if (!sheet) sheet = ss.insertSheet("Payments");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(PAYMENT_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Row number (1-based) of a payment reference in column B, or 0.
function findPaymentRow_(sheet, ref) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const vals = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(ref)) return i + 2;
  }
  return 0;
}

function naira_(n) {
  return "₦" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Returns true only when an email was actually sent for a genuine application.
// (Legacy unpaid path — the website no longer uses it; kept for testApplicationEmail.)
function handleApplication(d, isTest) {
  if (!isTest) {
    const reason = validateApplication_(d);
    if (reason) {
      Logger.log("REJECTED application (" + reason + "): " + JSON.stringify(d).slice(0, 300));
      return false;
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!isTest) {
      const cache = CacheService.getScriptCache();

      // Same person + same course within 6h = duplicate → no second email
      const dupKey = "app_" + md5Key_(
        String(d.email).toLowerCase().trim() + "|" +
        String(d.phone).replace(/\D/g, "") + "|" + d.course
      );
      if (cache.get(dupKey)) {
        Logger.log("DUPLICATE application ignored");
        return false;
      }

      // Global flood guard
      const hourKey = "apphour_" + Math.floor(Date.now() / 3600000);
      const count = Number(cache.get(hourKey) || 0);
      if (count >= MAX_APPLICATIONS_PER_HOUR) {
        Logger.log("RATE LIMIT reached — application ignored");
        return false;
      }
      cache.put(dupKey, "1", 6 * 60 * 60);
      cache.put(hourKey, String(count + 1), 3600);
    }

    const name = [d.first_name, d.middle_name, d.last_name]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" ");

    const subject =
      (isTest ? "[TEST] " : "") +
      "New Academy Application - " + name +
      " (" + d.preferred_intake + ")";

    sendMail_({
      to: ACADEMY_EMAIL,
      subject: subject,
      body: applicationPlainText(d, name),
      htmlBody: applicationEmailHtml(d, name),
      replyTo: d.email || undefined,
      name: "REO Travel Academy Website",
    });

    // Confirmation to the applicant (a failure here never blocks the owner email/log)
    try {
      sendApplicantConfirmation_(d, name);
    } catch (err) {
      Logger.log("Applicant confirmation failed: " + err);
    }

    logApplicationToSheet(d, name);
    return true;
  } finally {
    lock.releaseLock();
  }
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
    '<div style="color:#FFFFFF;font-family:Georgia,serif;font-size:22px;margin-top:8px;">New Application Received' +
    (d.payment_reference ? " &mdash; PAID" : "") + '</div></td></tr>' +

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
    (d.both_paid
      ? row("Registration fee paid (verified with Kora)", naira_(d.amount_paid_registration || REGISTRATION_FEES[d.course]), true) +
        row("Registration payment reference", d.registration_payment_reference || "", true) +
        row("Tuition fee paid (verified with Kora)", naira_(d.amount_paid_tuition || d.amount_paid), true) +
        row("Tuition payment reference", d.tuition_payment_reference || "", true)
      : (d.payment_reference
        ? row("Registration fee paid (verified with Kora)", naira_(d.amount_paid), true) +
          row("Payment reference", d.payment_reference, true)
        : "")) +
    "</table></td></tr>" +

    '<tr><td style="padding:22px 32px 26px;border-top:1px solid #E5DCC9;">' +
    '<span style="font-size:11px;color:#9A9284;">Sent automatically by the REO Travel Academy website application form.<br>Learn. Lead. Excel. - a programme of REO Travels &amp; Tour.</span>' +
    "</td></tr>" +

    "</table></td></tr></table>"
  );
}

function sendApplicantConfirmation_(d, name) {
  const first = escapeHtml(d.first_name);
  const course = escapeHtml(d.course);
  const intake = escapeHtml(d.preferred_intake);
  const paid = !!d.payment_reference;
  const bothPaid = !!d.both_paid;
  const closing = bothPaid
    ? "Your registration is now complete. Our team will reach out shortly to confirm your spot and share onboarding details."
    : (paid
      ? "Our team will reach out shortly to confirm your spot and share onboarding details."
      : "Our team will reach out to confirm your spot and share payment and onboarding details.");
  const feeLines = [];
  if (bothPaid) {
    feeLines.push("Registration fee received: " + naira_(d.amount_paid_registration || REGISTRATION_FEES[d.course]) + " (reference: " + (d.registration_payment_reference || "") + ")");
    feeLines.push("Tuition fee received: " + naira_(d.amount_paid_tuition || d.amount_paid) + " (reference: " + (d.tuition_payment_reference || "") + ")");
  } else if (paid) {
    feeLines.push("Registration fee received: " + naira_(d.amount_paid) + " (reference: " + d.payment_reference + ")");
  }

  const plain = [
    "Hi " + d.first_name + ",",
    "",
    "Thank you for applying to REO Travel Academy. We've received your application:",
    "",
    "Programme: " + d.course,
    "Preferred intake: " + d.preferred_intake,
  ].concat(feeLines.length ? feeLines : []).concat([
    "",
    closing,
    "If you have questions in the meantime, WhatsApp us on +234 913 445 8065 or reply to this email.",
    "",
    "REO Travel Academy",
    "Learn. Lead. Excel.",
  ]).join("\n");

  const html =
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#ECE3D0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FBF7EC;border-radius:16px;overflow:hidden;">' +
    '<tr><td style="background:#0A4F48;padding:26px 32px;">' +
    '<div style="color:#E2A23C;font-size:11px;letter-spacing:2px;text-transform:uppercase;">&#9992; REO Travel Academy</div>' +
    '<div style="color:#FFFFFF;font-family:Georgia,serif;font-size:22px;margin-top:8px;">We\'ve received your application</div></td></tr>' +
    '<tr><td style="padding:24px 32px 0;color:#1F2D2F;font-size:15px;line-height:1.6;">Hi ' + first + ',<br><br>' +
    'Thank you for applying to REO Travel Academy. Here is what you submitted:</td></tr>' +
    '<tr><td style="padding:14px 32px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:#E2A23C;border-radius:10px;padding:14px 18px;">' +
    '<span style="color:#0A4F48;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;">Programme</span><br>' +
    '<span style="color:#0A4F48;font-family:Georgia,serif;font-size:16px;font-weight:bold;">' + course + '</span><br>' +
    '<span style="color:#0A4F48;font-size:12px;">Preferred intake: ' + intake + '</span>' +
    '</td></tr></table></td></tr>' +
    (d.both_paid
      ? '<tr><td style="padding:14px 32px 0;color:#1F2D2F;font-size:14px;line-height:1.6;">' +
        '<strong>Registration fee received:</strong> ' + escapeHtml(naira_(d.amount_paid_registration || REGISTRATION_FEES[d.course])) +
        '<br><span style="color:#7B7466;font-size:12px;">Payment reference: ' + escapeHtml(d.registration_payment_reference || "") + '</span><br><br>' +
        '<strong>Tuition fee received:</strong> ' + escapeHtml(naira_(d.amount_paid_tuition || d.amount_paid)) +
        '<br><span style="color:#7B7466;font-size:12px;">Payment reference: ' + escapeHtml(d.tuition_payment_reference || "") + '</span></td></tr>'
      : (paid
        ? '<tr><td style="padding:14px 32px 0;color:#1F2D2F;font-size:14px;line-height:1.6;">' +
          '<strong>Registration fee received:</strong> ' + escapeHtml(naira_(d.amount_paid)) +
          '<br><span style="color:#7B7466;font-size:12px;">Payment reference: ' + escapeHtml(d.payment_reference) + '</span></td></tr>'
        : '')) +
    '<tr><td style="padding:18px 32px 0;color:#1F2D2F;font-size:15px;line-height:1.6;">' +
    closing + '</td></tr>' +
    '<tr><td align="center" style="padding:20px 32px 8px;">' +
    '<a href="https://wa.me/2349134458065" style="background:#0A4F48;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:13px 30px;border-radius:999px;display:inline-block;">Chat with us on WhatsApp</a>' +
    '</td></tr>' +
    '<tr><td style="padding:18px 32px 26px;">' +
    '<span style="font-size:11px;color:#9A9284;">REO Travel Academy &middot; Learn. Lead. Excel. &middot; a programme of REO Travels &amp; Tour.</span>' +
    '</td></tr>' +
    '</table></td></tr></table>';

  sendMail_({
    to: String(d.email).trim(),
    subject: bothPaid
      ? "Your registration is complete — REO Travel Academy"
      : "We've received your application — REO Travel Academy",
    body: plain,
    htmlBody: html,
    replyTo: ACADEMY_EMAIL,
    name: "REO Travel Academy",
  });
}

function applicationPlainText(d, name) {
  return [
    "NEW ACADEMY APPLICATION" + (d.payment_reference ? " (PAID)" : ""),
    "",
    "Applicant: " + name,
    "Phone: " + (d.phone || "-"),
    "Email: " + (d.email || "-"),
    "Preferred course: " + (d.course || "-"),
    "Preferred intake: " + (d.preferred_intake || "-"),
    "Available for physical classes: " + (d.physical_availability || "-"),
    "Agreed to registration terms: " + (d.agree_terms || "-"),
    "Ready to pay registration fee: " + (d.pay_fee || "-"),
  ].concat(d.both_paid ? [
    "Registration fee paid (verified with Kora): " + naira_(d.amount_paid_registration || REGISTRATION_FEES[d.course]),
    "Registration payment reference: " + (d.registration_payment_reference || ""),
    "Tuition fee paid (verified with Kora): " + naira_(d.amount_paid_tuition || d.amount_paid),
    "Tuition payment reference: " + (d.tuition_payment_reference || ""),
  ] : (d.payment_reference ? [
    "Registration fee paid (verified with Kora): " + naira_(d.amount_paid),
    "Payment reference: " + d.payment_reference,
  ] : [])).concat([
    "",
    "Sent automatically by the REO Travel Academy website application form.",
  ]).join("\n");
}

/* ---------------------------------------------------------
   OPTIONAL: LOG EVERY APPLICATION TO A GOOGLE SHEET
   (Paid applications are always recorded in the "Payments" tab as well.)
--------------------------------------------------------- */
function logApplicationToSheet(d, name) {
  if (!SPREADSHEET_ID) return;
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Applications") || ss.insertSheet("Applications");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Name", "Phone", "Email", "Course", "Preferred intake", "Physical classes", "Terms agreed", "Fee ready", "Payment reference", "Amount paid (NGN)"]);
    }
    sheet.appendRow([
      new Date(), name, d.phone || "", d.email || "", d.course || "",
      d.preferred_intake || "", d.physical_availability || "", d.agree_terms || "", d.pay_fee || "",
      d.payment_reference || "", d.amount_paid || "",
    ]);
  } catch (err) {
    Logger.log("logApplicationToSheet error: " + err);
  }
}

/* ---------------------------------------------------------
   TESTS — select the function in the toolbar dropdown,
   click Run, then check View > Executions.
--------------------------------------------------------- */
function testKoraKey() {
  // Confirms the secret key in Script properties is set and accepted by Kora.
  // GOOD: "Payment not found at Kora"  (Kora accepted the key; this fake ref doesn't exist)
  // BAD:  "Kora rejected the secret key..."  or  "Payment key is not configured..."
  const r = fetchKoraCharge_("REO-KEY-CHECK-" + Date.now());
  Logger.log(JSON.stringify(r));
  if (r.ok === false && /not found/i.test(r.error)) {
    Logger.log("✅ Kora accepted your secret key.");
  } else {
    Logger.log("❌ Problem: " + r.error);
  }
}

function testKoraCheckout() {
  // Creates 4 test checkout pages at Kora, from simplest to most like the real one.
  // Run it, then open each link printed in the log and note which ones work.
  const secret = (PropertiesService.getScriptProperties().getProperty("KORA_SECRET_KEY") || "").trim();
  if (!secret) { Logger.log("❌ KORA_SECRET_KEY is not set"); return; }
  const base = { currency: "NGN", customer: { name: "Test User", email: ACADEMY_EMAIL } };
  const variants = {
    "A (minimal, ₦1,000)":            { amount: 1000 },
    "B (+ redirect_url)":             { amount: 1000, redirect_url: "https://example.com" },
    "C (₦150,000, no redirect)":      { amount: 150000 },
    "D (+ redirect + narration)":     { amount: 1000, redirect_url: "https://example.com", narration: "Registration fee - Diploma in Travel Agency Management" },
  };
  Object.keys(variants).forEach(function (label, i) {
    const payload = Object.assign({}, base, variants[label], { reference: "REO-TEST-" + Date.now() + "-" + i });
    const res = UrlFetchApp.fetch(KORA_INIT_URL, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    let out = null;
    try { out = JSON.parse(res.getContentText()); } catch (err) { }
    Logger.log(label + " -> HTTP " + res.getResponseCode() + " | " +
      (out && out.data && out.data.checkout_url ? out.data.checkout_url : res.getContentText().slice(0, 300)));
  });
}

function testApplicationEmail() {
  // isTest = true bypasses the anti-bot checks and labels the email [TEST]
  handleApplication({
    first_name: "Test", last_name: "Applicant", middle_name: "",
    phone: "2340000000000", email: ACADEMY_EMAIL,
    course: "Diploma in Travel Agency Management",
    physical_availability: "Yes",
    preferred_intake: "Winter (Jan – Mar)",
    agree_terms: "Yes", pay_fee: "Yes",
  }, true);
  Logger.log("[TEST] application emailed to " + ACADEMY_EMAIL);
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
   SENDER ADDRESS — send as info.academy@... instead of the Gmail
   account that owns this script.
   Requires info.academy@... to be added in THAT Gmail account under
   Settings > Accounts and Import > "Send mail as" (and verified).
   If the alias isn't set up yet, mail falls back to the default
   sender so nothing is ever lost.
--------------------------------------------------------- */
const SEND_FROM = ACADEMY_EMAIL;

function sendMail_(opts) {
  // Try the info.academy@ sender first. We don't pre-check getAliases():
  // addresses added in Gmail as "Not an alias" still work for sending but
  // may not be listed there. If Gmail rejects the From address, fall back.
  if (SEND_FROM) {
    try {
      const gmailOpts = {
        from: SEND_FROM,
        name: opts.name || "REO Travel Academy",
        htmlBody: opts.htmlBody,
      };
      // Only add a Reply-To when it differs from the sender (e.g. the owner
      // notification replies to the applicant). Otherwise Gmail's own default
      // already replies to the From address, so no extra header is needed.
      if (opts.replyTo && String(opts.replyTo).toLowerCase() !== SEND_FROM.toLowerCase()) {
        gmailOpts.replyTo = opts.replyTo;
      }
      GmailApp.sendEmail(
        opts.to,
        opts.subject,
        opts.body || "Please open this email in an HTML-capable mail app.",
        gmailOpts
      );
      return;
    } catch (err) {
      Logger.log("Send as " + SEND_FROM + " failed, falling back to default sender: " + err);
    }
  }
  MailApp.sendEmail(opts);
}

// Run this once from the editor: it authorizes Gmail access, lists the
// aliases, and sends a test email that should show FROM info.academy@...
function testSenderAlias() {
  Logger.log("Aliases on this account: " + JSON.stringify(GmailApp.getAliases()));
  sendMail_({
    to: ACADEMY_EMAIL,
    subject: "[TEST] Sender address check",
    body: "If this email shows it is FROM " + SEND_FROM + ", the alias is working.",
    name: "REO Travel Academy",
  });
  Logger.log("Test sent — check the From line in " + ACADEMY_EMAIL);
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
// Handles Step 1 completion: registration fee verified, record as partial, no emails.
function handleRegistrationPaid_(d) {
  const fail = function (msg) { return { success: false, ok: false, error: msg }; };
  const ref = String(d.payment_reference || "").trim();
  if (!/^[A-Za-z0-9_\-]{8,100}$/.test(ref)) return fail("Missing or invalid payment reference");
  const course = String(d.course || "").trim();
  const regExpected = REGISTRATION_FEES[course];
  if (!regExpected) return fail("Unknown course");
  const tuitionAmount = (TUITION_FEES[course] || 0);

  const pending = loadPending_(ref);
  if (pending && pending.tuition_paid) {
    return { success: true, ok: true, stage: "complete", duplicate: true };
  }
  if (pending && pending.registration_paid) {
    return { success: true, ok: true, stage: "registration_paid", registration_reference: ref, tuition_amount: tuitionAmount };
  }

  const v = verifyKoraPayment_(ref, course);
  if (!v.ok) return fail(v.error);

  const rawName = [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(" ");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ledger = getPaymentsSheet_();
    const row = findPaymentRow_(ledger, ref);
    if (row && String(ledger.getRange(row, 10).getValue()) === "Yes") {
      return { success: true, ok: true, stage: "complete", duplicate: true };
    }
    const values = [
      new Date(), ref, v.koraRef, v.paid, course, rawName,
      String(d.email).trim(), "'" + String(d.phone).trim(), "application", "No",
    ];
    if (row) ledger.getRange(row, 1, 1, values.length).setValues([values]);
    else ledger.appendRow(values);
  } finally {
    lock.releaseLock();
  }

  if (pending) {
    pending.registration_paid = true;
    pending.registration_amount_paid = v.paid;
    pending.registration_kora_ref = v.koraRef;
    savePending_(ref, pending);
  }

  return { success: true, ok: true, stage: "registration_paid", registration_reference: ref, tuition_amount: tuitionAmount };
}
// Handles Step 2 completion: tuition fee verified, record as complete, send emails.
function handleTuitionPaid_(d) {
  const fail = function (msg) { return { success: false, ok: false, error: msg, stage: "tuition", notPaid: true }; };
  const tuitionRef = String(d.payment_reference || "").trim();
  if (!/^[A-Za-z0-9_\-]{8,100}$/.test(tuitionRef)) return fail("Missing or invalid payment reference");
  const regRef = String(d.registration_reference || "").trim();
  const course = String(d.course || "").trim();
  const tuitionExpected = TUITION_FEES[course];
  if (!tuitionExpected) return { success: false, ok: false, error: "Unknown course" };
  const regExpected = REGISTRATION_FEES[course] || 0;

  const pending = loadPending_(tuitionRef);
  if (pending && pending.completed) {
    return { success: true, ok: true, stage: "complete", duplicate: true };
  }

  const ledger = getPaymentsSheet_();
  const regRow = regRef ? findPaymentRow_(ledger, regRef) : 0;
  if (!regRef || !regRow) {
    return { success: false, ok: false, error: "Registration fee not paid yet. Please pay the registration fee first.", stage: "registration" };
  }

  const v = verifyKoraTuitionPayment_(tuitionRef, course);
  if (!v.ok) return { success: false, ok: false, error: v.error, stage: "tuition", notPaid: true, registration_reference: regRef };

  const rawName = [d.first_name, d.middle_name, d.last_name].filter(Boolean).join(" ");
  const name = [d.first_name, d.middle_name, d.last_name].filter(Boolean).map(escapeHtml).join(" ");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = findPaymentRow_(ledger, tuitionRef);
    if (row && String(ledger.getRange(row, 10).getValue()) === "Yes") {
      return { success: true, ok: true, stage: "complete", duplicate: true };
    }
    const values = [
      new Date(), tuitionRef, v.koraRef, v.paid, course, rawName,
      String(d.email).trim(), "'" + String(d.phone).trim(), "application", "Yes",
    ];
    if (row) ledger.getRange(row, 1, 1, values.length).setValues([values]);
    else ledger.appendRow(values);
  } finally {
    lock.releaseLock();
  }

  let regPaidAmount = regExpected;
  if (regRow) {
    const val = ledger.getRange(regRow, 4).getValue();
    if (val) regPaidAmount = Number(val);
  }

  const data = pending || d;
  data.both_paid = true;
  data.completed = true;
  data.tuition_paid = true;
  data.tuition_amount_paid = v.paid;
  data.tuition_kora_ref = v.koraRef;
  data.registration_payment_reference = regRef;
  data.tuition_payment_reference = tuitionRef;
  data.amount_paid = v.paid;
  data.amount_paid_registration = regPaidAmount;
  data.amount_paid_tuition = v.paid;
  data.payment_reference = tuitionRef;

  savePending_(tuitionRef, data);

  const regPending = loadPending_(regRef);
  if (regPending) {
    regPending.tuition_paid = true;
    regPending.completed = true;
    regPending.both_paid = true;
    regPending.tuition_payment_reference = tuitionRef;
    regPending.registration_payment_reference = regRef;
    savePending_(regRef, regPending);
  }

  try {
    sendMail_({
      to: ACADEMY_EMAIL,
      subject: "New PAID Academy Application - " + name + " (registration + tuition paid) (" + d.preferred_intake + ")",
      body: applicationPlainText(data, name),
      htmlBody: applicationEmailHtml(data, name),
      replyTo: d.email || undefined,
      name: "REO Travel Academy Website",
    });
  } catch (err) {
    Logger.log("Owner email failed (application is saved in Payments tab): " + err);
  }
  try {
    sendApplicantConfirmation_(data, name);
  } catch (err) {
    Logger.log("Applicant confirmation failed: " + err);
  }
  logApplicationToSheet(data, name);

  return { success: true, ok: true, stage: "complete" };
}

// Start Step 2: create Kora checkout for the tuition fee.
function handleStartTuition_(d) {
  const fail = function (msg) { return { success: false, ok: false, error: msg }; };
  const regRef = String(d.registration_reference || "").trim();
  if (!/^[A-Za-z0-9_\-]{8,100}$/.test(regRef)) return fail("Invalid registration reference");

  const pending = loadPending_(regRef);
  if (!pending) return fail("We couldn't find your registration. Please contact us on WhatsApp.");

  if (pending.completed || pending.tuition_paid) {
    return { success: true, ok: true, already_complete: true };
  }

  const course = String(pending.course || "").trim();
  const tuitionAmount = TUITION_FEES[course];
  if (!tuitionAmount) return fail("Unknown course");

  const ledger = getPaymentsSheet_();
  const regRow = findPaymentRow_(ledger, regRef);
  if (!regRow) return fail("Registration fee not paid yet. Please pay the registration fee first.");

  const returnUrl = String(d.return_url || "").trim();
  if (!/^https?:\/\/[^\\s?#]+$/.test(returnUrl)) return fail("Open the website through its web address (not a local file) to pay");

  const cache = CacheService.getScriptCache();
  const hourKey = "starttuition_" + Math.floor(Date.now() / 3600000);
  const count = Number(cache.get(hourKey) || 0);
  if (count >= 60) return fail("Too many payment attempts right now — please try again shortly");
  cache.put(hourKey, String(count + 1), 3600);

  const secret = PropertiesService.getScriptProperties().getProperty("KORA_SECRET_KEY");
  if (!secret) return fail("Payment key is not configured on the server (add KORA_SECRET_KEY in Script properties)");

  const tuitionRef = "REO-" + Utilities.getUuid().replace(/-/g, "").slice(0, 20).toUpperCase();
  const name = [pending.first_name, pending.last_name].filter(Boolean).join(" ").trim();

  const payload = {
    amount: tuitionAmount,
    currency: "NGN",
    reference: tuitionRef,
    redirect_url: returnUrl,
    narration: "Tuition fee - " + course,
    customer: { name: name, email: String(pending.email).trim() },
  };

  let res;
  try {
    res = UrlFetchApp.fetch(KORA_INIT_URL, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + secret.trim() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log("Kora initialize unreachable: " + err);
    return fail("Could not reach Kora to start the payment");
  }
  const code = res.getResponseCode();
  let out = null;
  try { out = JSON.parse(res.getContentText()); } catch (err) { /* below */ }
  Logger.log("Kora initialize [tuition][" + code + "]: " + res.getContentText().slice(0, 400));
  if (!out || !out.status || !out.data || !out.data.checkout_url) {
    const why = out && out.message ? out.message : ("HTTP " + code);
    return fail("Kora could not start the tuition payment: " + why);
  }

  const saved = Object.assign({}, pending);
  delete saved.return_url;
  delete saved.type;
  saved.payment_reference = tuitionRef;
  saved.registration_reference = regRef;
  saved.payment_stage = "tuition";
  saved.tuition_reference = tuitionRef;
  saved.form_opened_at = pending.form_opened_at || String(Date.now() - 60000);
  savePending_(tuitionRef, saved);

  pending.tuition_reference = tuitionRef;
  savePending_(regRef, pending);

  return { success: true, ok: true, checkout_url: out.data.checkout_url, reference: tuitionRef };
}

function verifyKoraTuitionPayment_(reference, courseTitle) {
  const expected = TUITION_FEES[courseTitle];
  if (!expected) return { ok: false, error: "Unknown course" };
  const r = fetchKoraCharge_(reference);
  if (!r.ok) return r;
  const p = r.data;
  if (String(p.status).toLowerCase() !== "success") {
    return { ok: false, error: "Payment status is '" + p.status + "', not success" };
  }
  if (p.currency && String(p.currency).toUpperCase() !== "NGN") {
    return { ok: false, error: "Payment currency is not NGN" };
  }
  const paid = Number(p.amount_paid != null ? p.amount_paid : p.amount);
  if (!(paid >= expected)) {
    return { ok: false, error: "Amount paid (" + naira_(paid) + ") is less than the tuition fee (" + naira_(expected) + ")" };
  }
  return { ok: true, paid: paid, koraRef: p.reference || reference };
}

