const CONFIG = {
    APPS_SCRIPT_WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbx0c9FkG_XyTEulr1jUMergLRlpdrozhkpPrvZTNKWLiopzGhIn70EK7UctJUdyFNpX/exec",
    ACADEMY_EMAIL: "info.academy@reotravelsandtours.org",
    WHATSAPP_NUMBER: "2349134458065",

    EMAILJS_PUBLIC_KEY: "YOUR_EMAILJS_PUBLIC_KEY",
    EMAILJS_SERVICE_ID: "YOUR_EMAILJS_SERVICE_ID",
    EMAILJS_TEMPLATE_ID: "YOUR_EMAILJS_TEMPLATE_ID",
    GEMINI_API_KEY: "AQ.Ab8RN6JCYgNNWEPluK4Ro_4OJOeH6iaTadK5o2ZCU5zSe0E5GA",
    GEMINI_MODEL: "gemini-2.5-flash",
    KORAPAY_PUBLIC_KEY: "pk_live_mJXhuhkx2TEPjaJevrFrhx6hDZZJo2HdR4AcMdjg",
};

function formatNaira(n) {
    return "₦" + Number(n).toLocaleString("en-NG");
}

function registrationFeeSummary() {
    const fees = Object.values(COURSES).map((c) => c.registrationFee);
    if (fees.every((f) => f === fees[0])) return formatNaira(fees[0]);
    return Object.values(COURSES).map((c) => c.title + " " + formatNaira(c.registrationFee)).join("; ");
}

function appsScriptUrl() {
    if (CONFIG.APPS_SCRIPT_WEBHOOK_URL && CONFIG.APPS_SCRIPT_WEBHOOK_URL !== "YOUR_APPS_SCRIPT_WEBHOOK_URL") {
        return CONFIG.APPS_SCRIPT_WEBHOOK_URL;
    }
    return null;
}

function initChrome() {
    setTimeout(() => {
        document.getElementById("preloader")?.classList.add("hidden");
    }, 1100);

    const yearEl = document.getElementById("footer-year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const navbar = document.getElementById("navbar");
    window.addEventListener(
        "scroll",
        () => navbar?.classList.toggle("scrolled", window.scrollY > 40),
        { passive: true }
    );

    const hamburger = document.getElementById("hamburger");
    const mobileMenu = document.getElementById("mobile-menu");
    const closeBtn = document.getElementById("mobile-menu-close");
    const openMenu = () => {
        hamburger.classList.add("open");
        mobileMenu.classList.add("open");
        document.body.style.overflow = "hidden";
    };
    const closeMenu = () => {
        hamburger.classList.remove("open");
        mobileMenu.classList.remove("open");
        document.body.style.overflow = "";
    };
    hamburger?.addEventListener("click", () => {
        mobileMenu.classList.contains("open") ? closeMenu() : openMenu();
    });
    closeBtn?.addEventListener("click", closeMenu);
    mobileMenu?.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
}

const COURSES = {
    diploma: {
        flagship: true,
        kicker: "Flagship Programme",
        image: "Images/dip.png",
        imageAlt: "A map and travel plans laid out for a trip",
        title: "Diploma in Travel Agency Management",
        duration: "10 Weeks",
        mode: "Online & Physical",
        tuition: "₦150,000",
        registrationFee: 5000,
        tuitionFee: 150000,
        blurb: "An 8-course programme covering every foundation of running and growing a travel agency — from registration to reservations.",
        modalIntro: "Eight courses, one diploma — designed to take you from the basics of the travel industry to running client-ready operations.",
        modules: [
            "ITM 101 — Introduction to Travel Management",
            "EBM 102 — Entrepreneurship & Business Management",
            "HRM 103 — Human Resource Management",
            "TGI 112 — Travel Geographical Information",
            "CRM 111 — Customer Relation Management",
            "BAR 113 — Basic Airline Reservation",
            "DMS 104 — Digital Marketing Skills",
            "ITS 105 — Information on Travel Services",
        ],
    },
    crm: {
        flagship: false,
        kicker: "Certification Programme",
        image: "Images/Customer.jpg",
        imageAlt: "A customer service interaction at a counter",
        title: "Certification in Customer Relations Management",
        duration: "4 Weeks",
        mode: "Online & Physical",
        tuition: "₦70,000",
        registrationFee: 5000,
        tuitionFee: 70000,
        blurb: "A focused programme covering the customer-facing and travel-service skills every agent needs.",
        modalIntro: "Four courses, one certification — designed to build the customer-facing and travel-service skills that matter most on the job.",
        modules: [
            "TGI 112 — Travel Geographical Information",
            "CRM 111 — Customer Relation Management",
            "BAR 113 — Basic Airline Reservation",
            "ITS 105 — Information on Travel Services",
        ],
    },
    hrm: {
        flagship: false,
        kicker: "Certification Programme",
        image: "Images/hr.png",
        imageAlt: "A team meeting in a modern office",
        title: "Certification in Human Resources Management",
        duration: "3 Weeks",
        mode: "Online & Physical",
        tuition: "₦50,000",
        registrationFee: 5000,
        tuitionFee: 50000,
        blurb: "A focused programme covering the human resources and business skills every professional needs.",
        modalIntro: "Three courses, one certification — designed to build the human resources and business skills that matter most on the job.",
        modules: [
            "HRM 103 — Human Resources Management",
            "EBM 102 — Entrepreneurship and Business Management",
            "TGI 112 — Travel Geography Information",
        ],
    },
};

const WHO_FOR = {
    crm: [
        "Individuals looking to focus solely on customer service expertise for the travel industry",
        "Current customer relationships officers looking to expand into the travel industry",
        "Current customer relationships personnel looking to enhance their skills in travel customer relationships",
    ],
    hrm: [
        "Individuals looking to focus solely on people management expertise for the travel industry",
        "Current HR personnel looking to expand into the travel industry",
        "Current human resource personnel looking to enhance their skills in travel human resources management",
    ],
};

function renderCourseCards() {
    const grid = document.getElementById("courses-grid");
    if (!grid) return;
    grid.innerHTML = Object.entries(COURSES)
        .map(([key, c]) => `
      <div class="course-card${c.flagship ? " flagship" : ""}">
        <div class="course-media">
          <img src="${c.image}" alt="${c.imageAlt}" loading="lazy" />
        </div>
        <div class="course-head">
          ${c.flagship ? '<span class="course-flag">Flagship</span>' : ""}
          <span class="course-kicker">${c.kicker}</span>
          <h3 class="course-title">${c.title}</h3>
        </div>
        <div class="course-perf"></div>
        <div class="course-body">
          <div class="course-meta">
            <span>⏱ <strong>${c.duration}</strong></span>
            <span>📍 <strong>${c.mode}</strong></span>
          </div>
          <div class="course-price">${c.tuition} <span>tuition</span></div>
          <p class="course-blurb">${c.blurb}</p>
          <button class="btn btn-primary" onclick="openCourseModal('${key}')">View Details</button>
        </div>
      </div>
    `)
        .join("");
}

function openCourseModal(key) {
    const c = COURSES[key];
    if (!c) return;
    const overlay = document.getElementById("course-modal-overlay");
    const body = document.getElementById("course-modal-body");

    const whoForList = key === "diploma" ? [] : (WHO_FOR[key] || []);
    const whoForHtml = whoForList.length ? `
    <div class="modal-section-label">Who is this for?</div>
    <ul class="modal-course-list">
      ${whoForList.map((w) => `<li>${w}</li>`).join("")}
    </ul>
  ` : "";

    const enquireHref = `mailto:${CONFIG.ACADEMY_EMAIL}?subject=${encodeURIComponent(
        "Enquiry: " + c.title
    )}&body=${encodeURIComponent(
        `Hi REO Travel Academy,\n\nI'd like to know more about the ${c.title}.\n\nName:\nPhone:\nQuestion:\n`
    )}`;

    body.innerHTML = `
    <button class="modal-close" onclick="closeCourseModal()" aria-label="Close">&times;</button>
    <span class="modal-kicker">${c.kicker}</span>
    <h3 class="modal-title">${c.title}</h3>
    <p class="course-blurb" style="margin-bottom:20px;">${c.modalIntro}</p>

    <div class="modal-facts">
      <div class="modal-fact"><span>Duration</span><strong>${c.duration}</strong></div>
      <div class="modal-fact"><span>Mode</span><strong>${c.mode}</strong></div>
      <div class="modal-fact"><span>Tuition</span><strong>${c.tuition}</strong></div>
    </div>

    ${whoForHtml}

    <div class="modal-section-label">What you'll cover</div>
    <ul class="modal-course-list">
      ${c.modules.map((m) => `<li><strong>${m.split(" — ")[0]}</strong> — ${m.split(" — ")[1]}</li>`).join("")}
    </ul>

    <div class="modal-price-block">
      <div><span>Total tuition</span><br /><strong>${c.tuition}</strong></div>
      <span>Intakes open all year</span>
    </div>

    <div class="modal-reg-fee">
      <span>Registration fee</span>
      <strong>${formatNaira(c.registrationFee)}</strong>
      <em>Step 1 — paid securely online (card or bank transfer). Step 2 — pay the ${c.tuition} tuition fee. Your registration is only complete once both are paid.</em>
    </div>

    <div class="modal-actions">
      <a href="${enquireHref}" class="btn btn-ghost">✉️ Enquire</a>
      <button type="button" class="btn btn-primary" onclick="toggleRegisterForm()">📝 Register</button>
    </div>

    <form class="register-form" id="register-form" onsubmit="return submitRegistration(event, '${key}')">
      <!-- Anti-bot: set to Date.now() when the form is opened; server rejects instant submits -->
      <input type="hidden" name="form_opened_at" value="" />

      <div class="form-row">
        <input type="text" name="first_name" placeholder="First Name *" required />
        <input type="text" name="last_name" placeholder="Last Name *" required />
      </div>
      <input type="text" name="middle_name" placeholder="Middle Name (optional)" />
      <div class="form-row">
        <input type="tel" name="phone" placeholder="Phone Number *" required />
        <input type="email" name="email" placeholder="Email Address *" required />
      </div>

      <label class="form-label">Preferred course</label>
      <input type="text" value="${c.title}" disabled />
      <input type="hidden" name="course" value="${c.title}" />

      <label class="form-label">Would you be available for physical classes?</label>
      <select name="physical_availability" required>
        <option value="" disabled selected>Choose…</option>
        <option value="Yes">Yes — I can attend physical classes</option>
        <option value="No">No — online only</option>
      </select>

      <label class="form-label">Preferred intake</label>
      <select name="preferred_intake" required>
        <option value="" disabled selected>Choose an intake…</option>
        <option value="Winter (Jan – Mar)">Winter Intake (Jan – Mar)</option>
        <option value="Spring (Apr – Jun)">Spring Intake (Apr – Jun)</option>
        <option value="Summer (Jul – Sep)">Summer Intake (Jul – Sep)</option>
        <option value="Fall (Oct – Dec)">Fall Intake (Oct – Dec)</option>
      </select>

      <div class="register-terms">
        <strong>Registration terms</strong>
        <ul>
          <li>Registration is complete only after BOTH the registration fee (${formatNaira(c.registrationFee)}) and the tuition fee (${c.tuition}) have been paid.</li>
          <li>The registration fee is non-refundable.</li>
          <li>The registration fee can be used for only any of the next available intake as at the time of payment.</li>
          <li>Fee payment is only valid for the person with the details filled in this form.</li>
          <li>Registration may require the applicant to provide further information before enrolment for the preferred course.</li>
        </ul>
      </div>

      <label class="register-check">
        <input type="checkbox" name="agree_terms" value="Yes" required />
        <span>I agree to the registration terms above</span>
      </label>
      <label class="register-check">
        <input type="checkbox" name="pay_fee" value="Yes" required />
        <span>I am ready to pay the registration fee</span>
      </label>

      <button type="submit" class="btn btn-primary" style="width:100%;">${registerSubmitLabel(c)}</button>
      <div class="register-status" id="register-status"></div>
    </form>
  `;

    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeCourseModal() {
    document.getElementById("course-modal-overlay").classList.remove("open");
    document.body.style.overflow = "";
}

function toggleRegisterForm() {
    const form = document.getElementById("register-form");
    const opening = !form.classList.contains("open");
    form.classList.toggle("open");
    if (opening) {
        if (form.elements["form_opened_at"]) form.elements["form_opened_at"].value = String(Date.now());
        setTimeout(() => form.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
}


function registerSubmitLabel(c) {
    return "Pay " + formatNaira(c.registrationFee) + " Registration Fee →";
}

function setRegisterStatus(msg, type) {
    const el = document.getElementById("register-status");
    if (!el) return null;
    el.textContent = msg;
    el.className = "register-status show " + type;
    return el;
}

function makePaymentReference(courseKey) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return "REO-" + courseKey.toUpperCase() + "-" + Date.now() + "-" + rand;
}

async function callBackend(payload) {
    const url = appsScriptUrl();
    const opts = {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
    };
    let lastErr;
    for (let i = 0; i < 2; i++) {
        try {
            const res = await fetch(url, opts);
            return await res.json();
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 1200));
        }
    }
    throw lastErr;
}

function submitRegistration(e, courseKey) {
    e.preventDefault();
    const form = e.target;
    const c = COURSES[courseKey];
    try {
        const prog = JSON.parse(localStorage.getItem("reo-registration-progress") || "null");
        if (prog && prog.regRef && prog.course === c.title) {
            handlePaymentReturn(prog.regRef);
            return false;
        }
    } catch (e) { }
    const btn = form.querySelector("button[type=submit]");

    const data = Object.fromEntries(new FormData(form).entries());
    data.course = c.title;

    const phoneDigits = String(data.phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        setRegisterStatus("⚠️ Please enter a valid phone number (10–15 digits).", "err");
        return false;
    }
    if (!data.physical_availability || !data.preferred_intake) {
        setRegisterStatus("⚠️ Please choose your class availability and preferred intake.", "err");
        return false;
    }
    if (!data.form_opened_at) data.form_opened_at = String(Date.now() - 60000);

    if (!appsScriptUrl()) {
        console.warn("Apps Script webhook isn't configured — add its URL in CONFIG at the top of academy.js");
        setRegisterStatus("⚠️ Registration isn't fully connected yet — please reach us on WhatsApp or email for now.", "err");
        return false;
    }
    if (!/^https?:$/.test(location.protocol)) {
        setRegisterStatus("⚠️ Please open the website through its web address (not a local file) to pay.", "err");
        return false;
    }

    const resetButton = () => {
        btn.disabled = false;
        btn.textContent = registerSubmitLabel(c);
    };

    btn.disabled = true;
    btn.textContent = "Preparing secure payment…";
    document.getElementById("register-status")?.classList.remove("show");

    const payload = Object.assign({ type: "start_payment" }, data, {
        return_url: location.origin + location.pathname,
    });

    callBackend(payload)
        .then((out) => {
            console.log("[pay] start_payment:", out);
            if (out && out.ok && typeof out.checkout_url === "string" && /^https:\/\//.test(out.checkout_url)) {
                btn.textContent = "Redirecting to secure payment…";
                window.location.href = out.checkout_url;
            } else {
                const why = out && out.error ? out.error : "We couldn't start the payment.";
                setRegisterStatus("⚠️ " + why + " Please try again, or reach us on WhatsApp.", "err");
                resetButton();
            }
        })
        .catch((err) => {
            console.warn("[pay] start_payment failed:", err);
            setRegisterStatus("⚠️ Couldn't reach the server to start your payment. Check your connection and try again.", "err");
            resetButton();
        });
    return false;
}

async function handlePaymentReturn(refOverride) {
    const qs = new URLSearchParams(location.search);
    let ref = refOverride || qs.get("reo_pay") || qs.get("reference") || "";
    if (!/^REO-[A-Za-z0-9_-]{8,100}$/.test(ref)) return;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(10,79,72,.94);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Arial,Helvetica,sans-serif;";
    const box = document.createElement("div");
    box.style.cssText = "background:#FBF7EC;color:#1F2D2F;max-width:440px;width:100%;border-radius:16px;padding:28px;text-align:center;line-height:1.6;";
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cleanUrl = () => { try { history.replaceState(null, "", location.pathname + location.hash); } catch (err) { } };
    const render = (title, msg, actions) => {
        box.textContent = "";
        const h = document.createElement("div");
        h.style.cssText = "font-family:Georgia,serif;font-size:21px;margin-bottom:10px;";
        h.textContent = title;
        const p = document.createElement("div");
        p.style.cssText = "font-size:14px;";
        p.textContent = msg;
        box.appendChild(h);
        box.appendChild(p);
        (actions || []).forEach((a) => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = a.label;
            b.style.cssText = "margin:16px 6px 0;padding:11px 22px;border:none;border-radius:999px;cursor:pointer;font-weight:bold;background:" + (a.primary ? "#0A4F48;color:#fff" : "#E2A23C;color:#0A4F48");
            b.addEventListener("click", a.onClick);
            box.appendChild(b);
        });
    };
    const close = () => { cleanUrl(); overlay.remove(); };
    const returnUrl = () => location.origin + location.pathname;

    const showComplete = () => {
        try { localStorage.removeItem("reo-pending-reg-ref"); localStorage.removeItem("reo-registration-progress"); } catch (e) { }
        cleanUrl();
        render("Registration complete ✅", "Your registration fee and tuition fee have both been received. We'll reach out shortly to confirm your spot and share onboarding details.", [{ label: "Done", primary: true, onClick: close }]);
    };

    // Step 2: start the tuition payment for an already-paid registration fee.
    const goTuition = async (regRef) => {
        render("Preparing tuition payment…", "Please wait — don't close this page.");
        try {
            const out = await callBackend({ type: "start_tuition", registration_reference: regRef, return_url: returnUrl() });
            console.log("[pay] start_tuition:", out);
            if (out && out.ok && out.already_complete) {
                showComplete();
            } else if (out && out.ok && typeof out.checkout_url === "string" && /^https:\/\//.test(out.checkout_url)) {
                render("Redirecting to secure payment…", "Taking you to the tuition payment page.");
                window.location.href = out.checkout_url;
            } else {
                const why = out && out.error ? out.error : "We couldn't start the tuition payment.";
                render("Couldn't start tuition payment", why, [
                    { label: "Try again", onClick: () => goTuition(regRef) },
                    { label: "Close", primary: true, onClick: close },
                ]);
            }
        } catch (err) {
            console.warn("[pay] start_tuition failed:", err);
            render("Connection problem", "We couldn't reach the server. Please check your connection and try again.", [
                { label: "Try again", onClick: () => goTuition(regRef) },
                { label: "Close", primary: true, onClick: close },
            ]);
        }
    };

    // Registration fee paid -> popup with the "Pay tuition fee" button.
    const showRegistrationPaid = (out) => {
        const regRef = out.registration_reference || ref;
        const tuition = formatNaira(out.tuition_amount || 0);
        try {
            localStorage.setItem("reo-pending-reg-ref", regRef);
            localStorage.setItem("reo-registration-progress", JSON.stringify({ regRef: regRef, course: out.course || null, tuitionAmount: out.tuition_amount || 0 }));
        } catch (e) { }
        render(
            "Registration fee paid successfully ✅",
            "We've received your registration fee. Your registration is NOT complete yet — please pay the tuition fee of " + tuition + " to finish. You can pay now or later.",
            [
                { label: "Pay tuition fee — " + tuition, primary: true, onClick: () => goTuition(regRef) },
                { label: "Pay later", onClick: close },
            ]
        );
    };

    const check = async () => {
        render("Confirming your payment…", "Please wait — don't close this page.");
        try {
            const out = await callBackend({ type: "complete", payment_reference: ref });
            console.log("[pay] complete:", out);
            if (out && out.ok && out.stage === "complete") {
                showComplete();
            } else if (out && out.ok && out.stage === "registration_paid") {
                cleanUrl();
                showRegistrationPaid(out);
            } else if (out && out.notPaid && out.stage === "tuition") {
                render("Tuition payment not completed", "We didn't receive your tuition payment, so your registration is not complete yet. If you just paid by bank transfer, wait a minute and check again.", [
                    { label: "Check again", onClick: check },
                    { label: "Pay tuition fee", primary: true, onClick: () => goTuition(out.registration_reference) },
                ]);
            } else if (out && out.notPaid) {
                render("Payment not completed", "We didn't receive a payment, so your registration hasn't started. If you just paid by bank transfer, wait a minute and check again. Otherwise close this and try again.", [
                    { label: "Check again", onClick: check },
                    { label: "Close", primary: true, onClick: close },
                ]);
            } else {
                render("We couldn't confirm it yet", "If money left your account, please WhatsApp or email us with this reference and we'll sort it out right away: " + ref, [
                    { label: "Check again", onClick: check },
                    { label: "Close", primary: true, onClick: close },
                ]);
            }
        } catch (err) {
            console.warn("[pay] complete failed:", err);
            render("Connection problem", "We couldn't reach the server. Your reference is " + ref + ". Please check your connection and try again.", [
                { label: "Check again", onClick: check },
                { label: "Close", primary: true, onClick: close },
            ]);
        }
    };
    check();
}
const __resumePending = () => {
    try {
        const pendingRef = localStorage.getItem("reo-pending-reg-ref");
        if (pendingRef && !location.search.includes("reo_pay") && !location.search.includes("reference")) {
            handlePaymentReturn(pendingRef);
        }
    } catch (e) { }
};
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { handlePaymentReturn(); __resumePending(); });
} else {
    handlePaymentReturn();
    __resumePending();
}

const CHAT_RESET_AFTER_MS = 6 * 60 * 60 * 1000; 

function touchChatActivity() {
    try { localStorage.setItem("reo-chat-last-active", String(Date.now())); } catch (err) { }
}

let chatName = "";
try {
    const lastActive = Number(localStorage.getItem("reo-chat-last-active") || 0);
    const staleChat = lastActive && (Date.now() - lastActive > CHAT_RESET_AFTER_MS);
    if (staleChat) {
        localStorage.removeItem("reo-chat-name");
        localStorage.removeItem("reo-chat-last-active");
    } else {
        chatName = localStorage.getItem("reo-chat-name") || "";
    }
} catch (err) { }

if (!chatName) document.getElementById("chat-panel")?.classList.add("gated");

function toggleChat() {
    const panel = document.getElementById("chat-panel");
    const isOpen = panel.classList.toggle("open");
    document.getElementById("chat-dot").classList.remove("show");

    if (isOpen && !panel.dataset.greeted && chatName) {
        panel.dataset.greeted = "true";
        setTimeout(() => {
            appendChatMsg("bot", "👋 Welcome back, " + chatName + "! How can we help you today?");
        }, 400);
    }

    if (isOpen && panel.classList.contains("gated")) {
        setTimeout(() => document.getElementById("chat-gate-input")?.focus(), 350);
    }
}

function submitChatName(e) {
    e.preventDefault();
    const panel = document.getElementById("chat-panel");
    const input = document.getElementById("chat-gate-input");
    const note = document.getElementById("chat-gate-note");
    const raw = (input?.value || "").trim().replace(/\s+/g, " ");
    if (raw.length < 2 || !/[A-Za-z\u00C0-\u024F]/.test(raw)) {
        note?.classList.add("show");
        input?.focus();
        return false;
    }
    chatName = raw.slice(0, 60);
    try { localStorage.setItem("reo-chat-name", chatName); } catch (err) { }
    touchChatActivity();
    note?.classList.remove("show");
    input.value = "";
    panel.classList.remove("gated");
    panel.dataset.greeted = "true";
    appendChatMsg("user", chatName);
    setTimeout(() => {
        appendChatMsg("bot", "Hello, " + chatName + "! 👋");
    }, 400);
    setTimeout(() => {
        appendChatMsg("bot", "What would you like to know? Courses, fees, intakes — ask away.");
    }, 1100);
    document.getElementById("chat-input")?.focus();
    return false;
}


const HANDOFF_TRIGGERS = [
    "talk to a person", "talk to someone", "speak to someone", "speak to a person",
    "real person", "talk to a human", "speak to a human", "human being",
    "representative", "talk to your team", "speak to your team", "talk with your team",
];

function answerFromKB(text) {
    const q = text.toLowerCase();

    if (q.includes("diploma") && (q.includes("cert") || q.includes(" vs ") || q.includes("difference") || q.includes("versus"))) {
        return "The Diploma is our full 8-course, 10-week programme covering the whole travel business. The Certifications are focused 3–4 week programmes on one area — Customer Relations or HR. Not sure which fits? Tell us your goal and we'll point you the right way.";
    }

    const courseHits = [
        { key: "diploma", words: ["diploma", "travel agency management"] },
        { key: "crm", words: ["customer relations", "customer relation", "crm"] },
        { key: "hrm", words: ["human resources", "human resource", "hrm"] },
    ];
    for (const hit of courseHits) {
        if (hit.words.some((w) => q.includes(w))) {
            const c = COURSES[hit.key];
            const whoFor = (WHO_FOR[hit.key] || []).join("; ");
            return c.title + " — " + c.duration + ", " + c.mode + ". Tuition: " + c.tuition + ".\n" + c.blurb + "\nModules: " + c.modules.join(" • ") + (whoFor ? "\nWho is this for: " + whoFor + "." : "");
        }
    }

    if (/\b(fees?|tuition|how much|cost|price)\b/.test(q)) {
        return "Our programmes:\n• Diploma in Travel Agency Management — ₦150,000 (10 weeks)\n• Customer Relations Certification — ₦70,000 (4 weeks)\n• Human Resources Certification — ₦50,000 (3 weeks)\nAll run Online & Physical. Want registration details?";
    }

    if (/\b(what|which|list|all)\b.{0,20}\bcourses\b|\b(programmes?|programs?)\b.{0,15}(offer|available|do you)/.test(q)) {
        return "We offer three programmes:\n• Diploma in Travel Agency Management — 10 weeks, ₦150,000\n• Certification in Customer Relations Management — 4 weeks, ₦70,000\n• Certification in Human Resources Management — 3 weeks, ₦50,000\nAll Online & Physical — open any course card for the full module list.";
    }
    const OVERVIEW = "Here's the quick overview — we offer three programmes: Diploma in Travel Agency Management (10 weeks, ₦150,000), Certification in Customer Relations Management (4 weeks, ₦70,000), and Certification in Human Resources Management (3 weeks, ₦50,000). All run Online & Physical — open any course card and tap View Details for modules, intakes and registration.";
    if (/\bcourses?\b/.test(q) && !/pay|instalment|installment|bank|contact|phone|email|whatsapp|where|address|location|campus|who|eligib|requirement/.test(q)) {
        return OVERVIEW;
    }

    const KB = [
        { k: ["payment plan", "payment", "installments", "instalments", "pay in parts", "pay twice", "how do i pay", "bank transfer"], a: "The registration fee (" + registrationFeeSummary() + ") is paid securely online first (card or bank transfer). Right after, you pay the tuition fee to complete your registration. For a payment plan or anything else about fees, WhatsApp us and we'll sort out what works for you." },
        { k: ["prior experience", "no experience", "beginner", "new to travel", "never done"], a: "No prior travel experience needed! Our programmes are built for both newcomers and current consultants — the Diploma starts from the fundamentals." },
        { k: ["not in lagos", "outside lagos", "attend online", "join online", "from anywhere", "another state", "abroad", "virtual"], a: "Yes — every programme runs Online & Physical, so you can join live sessions from anywhere, or attend in person if you're local." },
        { k: ["after i register", "after registration", "what happens next", "onboarding", "confirmation"], a: "Once both your registration fee and tuition fee are paid online you'll get a confirmation with onboarding details for the next cohort — and you can message us on WhatsApp with any questions first." },
        { k: ["own travel business", "start an agency", "start my own", "entrepreneur", "business owner"], a: "Yes! The Diploma covers entrepreneurship and business management alongside the operational skills — it's built for people planning to start their own agency." },
        { k: ["intake", "when can i start", "start date", "when does it begin", "january", "april", "july", "october", "cohort"], a: "Intakes run all year: Winter (Jan–Mar), Spring (Apr–Jun), Summer (Jul–Sep) and Fall (Oct–Dec) — you can join the next available cohort." },
        { k: ["where are you", "address", "location of", "campus", "physical class", "which state"], a: "We're based in Lagos, Nigeria — and every programme also runs online. Our classroom sits right inside REO Travels & Tour, a working travel agency." },
        { k: ["contact", "phone number", "email address", "reach you", "whatsapp number"], a: "WhatsApp us at +234 913 445 8065 or email info.academy@reotravelsandtours.org — we usually reply within 10 minutes." },
        { k: ["who is this for", "who is this course for", "who can attend", "who can apply", "who can join", "is this for me", "can anyone join", "eligible", "eligibility", "requirements", "aspiring"], a: "It depends on the programme:\n• Customer Relations Certification — " + WHO_FOR.crm.join("; ") + ".\n• Human Resources Certification — " + WHO_FOR.hrm.join("; ") + "." },
        { k: ["how does it work", "how do i start", "how to join", "steps to"], a: "Four easy steps: pick your programme → register on the course page or WhatsApp us → join online or in person → start learning." },
        { k: ["who are you", "about the academy", "what is reo", "about reo"], a: "REO Travel Academy is the training arm of REO Travels & Tour — our classroom is a working travel agency, so you learn exactly what we practise every day." },
        { k: ["modules", "what will i learn", "course content", "syllabus", "curriculum"], a: "Each programme's full module list is on its course card — open 'View details' on the Courses section to see everything covered." },
        { k: ["tell me more about the course", "more information", "more info", "course information", "course details", "about this course", "about your courses", "about the courses", "about the program", "about the diploma", "aboout", "abotu", "abut"], a: OVERVIEW },
    ];
    let best = null;
    let bestScore = 0;
    for (const entry of KB) {
        const score = entry.k.reduce((n, kw) => (q.includes(kw) ? n + kw.length : n), 0);
        if (score > bestScore) { best = entry; bestScore = score; }
    }
    return best ? best.a : null;
}

const chatHistory = [];

function appendChatMsg(role, text) {
    const body = document.getElementById("chat-body");
    const div = document.createElement("div");
    div.className = "chat-msg " + role;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    if (role === "user" || role === "bot") chatHistory.push({ role, text: String(text) });
}

function showTyping(show) {
    const body = document.getElementById("chat-body");
    let el = document.getElementById("chat-typing-indicator");
    if (show && !el) {
        el = document.createElement("div");
        el.id = "chat-typing-indicator";
        el.className = "chat-typing";
        el.innerHTML = "<span></span><span></span><span></span>";
        body.appendChild(el);
        body.scrollTop = body.scrollHeight;
    } else if (!show && el) {
        el.remove();
    }
}

function buildAIFacts() {
    const courses = Object.entries(COURSES).map(
        ([key, c]) => {
            const whoFor = (WHO_FOR[key] || []).join("; ");
            return c.title + ": " + c.duration + ", " + c.mode + ", tuition " + c.tuition + ". " + c.blurb + " Modules: " + c.modules.join(", ") + "." + (whoFor ? " Who is this for: " + whoFor + "." : "");
        }
    );
    return [
        "PROGRAMMES:\n- " + courses.join("\n- "),
        "ABOUT: REO Travel Academy is the training arm of REO Travels & Tour in Lagos, Nigeria. The classroom sits inside a working travel agency, so students learn exactly what the team practises day to day.",
        "WHO IT'S FOR (CUSTOMER RELATIONS CERTIFICATION): " + WHO_FOR.crm.join("; ") + ".",
        "WHO IT'S FOR (HUMAN RESOURCES CERTIFICATION): " + WHO_FOR.hrm.join("; ") + ".",
        "MODE: every programme runs Online & Physical.",
        "INTAKES: all year round — Winter (Jan–Mar), Spring (Apr–Jun), Summer (Jul–Sep), Fall (Oct–Dec).",
        "HOW TO ENROL: pick a programme, register on its course page or via WhatsApp, join online or in person, then start learning. Registration is only complete after the registration fee AND the tuition fee are both paid online (registration fee first, then tuition); applicants then get a confirmation with onboarding details for the next cohort.",
        "REGISTRATION TERMS: the registration fee is non-refundable; it can only be applied to the next available intake at the time of payment; fee payment is only valid for the person named on the form; registration may require further information before enrolment.",
        "PAYMENT: the registration fee (" + registrationFeeSummary() + ") is paid securely online by card or bank transfer (via Kora) first, then the course tuition fee is paid to complete registration. Any other fees or payment plans are arranged directly with the team over WhatsApp — there's no fixed public instalment plan.",
        "EXPERIENCE NEEDED: none — programmes suit complete beginners as well as current travel consultants; the Diploma starts from the fundamentals.",
        "STARTING A BUSINESS: the Diploma covers entrepreneurship and business management alongside operational skills, so it also suits people planning to start their own travel agency.",
        "CONTACT: WhatsApp +234 913 445 8065; email info.academy@reotravelsandtours.org; the team usually replies within about 10 minutes.",
    ].join("\n");
}


async function askGemini(question) {
    const prompt =
        "You are the warm, conversational admissions assistant for REO Travel Academy — talk like a helpful staff member, not a script or a list of facts.\n" +
        "Answer ONLY using the facts below, explained naturally in your own words. Friendly, helpful, max 90 words, plain text, no markdown symbols.\n" +
        "Never invent fees, dates, certificates, accreditation or policies not listed.\n" +
        "If the question is NOT answered by these facts, OR needs a human (payment negotiation, complaints, personal circumstances, bookings, sharing personal details), reply with exactly one word:\nHANDOFF\n\n" +
        "FACTS:\n" + buildAIFacts() + "\n\nQUESTION: " + question;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(CONFIG.GEMINI_MODEL) + ":generateContent?key=" +
            encodeURIComponent(CONFIG.GEMINI_API_KEY),
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
                }),
            }
        );
        const data = await res.json();
        if (!res.ok || data.error) {
            console.warn("[chat] Gemini error:", data.error || res.status);
            return { handoff: true };
        }
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const reply = parts.map((p) => p.text || "").join("").trim();
        if (!reply || /^handoff\b/i.test(reply)) return { handoff: true };
        return { text: reply.replace(/^["']|["']$/g, "") };
    } finally {
        clearTimeout(timer);
    }
}

function openWhatsAppHandoff(question) {
   
    const skipRe = /^(welcome back|hello,|what would you like to know|let'?s get you to a real person|before we begin)/i;
    const lines = [];
    let budget = 1500;
    const turns = chatHistory.slice(-12);
    for (const m of turns) {
        const clean = m.text.trim().replace(/\s+/g, " ");
        if (skipRe.test(clean)) continue;
        if (m.role === "user" && chatName && clean.toLowerCase() === chatName.toLowerCase()) continue;
        const line = (m.role === "user" ? "Visitor: " : "Academy: ") + clean;
        budget -= line.length * 3 + 4;
        if (budget < 0) break;
        lines.push(line.slice(0, 400));
    }
    const msg =
        "Hi REO Travel Academy!" +
        (chatName ? " My name is " + chatName + "." : "") +
        (lines.length
            ? ' Here is our chat so far:\n"' + lines.join("\n") + '"'
            : ' I asked on the website: "' + question + '"');
    window.open("https://wa.me/" + CONFIG.WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
}

function appendHandoff(question) {
    const body = document.getElementById("chat-body");
    const div = document.createElement("div");
    div.className = "chat-msg bot";
    const p = document.createElement("div");
    p.textContent = "Let's get you to a real person on our team ✈️ — tap below and WhatsApp opens with your question and our chat so far, ready to send:";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-wa-btn";
    btn.textContent = "✈ Continue on WhatsApp";
    btn.addEventListener("click", () => openWhatsAppHandoff(question));
    div.appendChild(p);
    div.appendChild(btn);
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

async function respondToQuestion(text) {
    showTyping(true);
    try {

        const q = text.toLowerCase();
        if (HANDOFF_TRIGGERS.some((t) => q.includes(t))) {
            showTyping(false);
            appendHandoff(text);
            return;
        }

        if (CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
            const ai = await askGemini(text);
            if (ai && ai.text) {
                showTyping(false);
                appendChatMsg("bot", ai.text);
                return;
            }
        }

        const local = answerFromKB(text);
        showTyping(false);
        if (local) {
            appendChatMsg("bot", local);
        } else {
            appendHandoff(text);
        }
    } catch (err) {
        console.warn("[chat] assistant failed:", err);
        showTyping(false);
        appendHandoff(text);
    }
}

function sendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return false;

    if (!chatName) {
        document.getElementById("chat-panel")?.classList.add("gated");
        document.getElementById("chat-gate-input")?.focus();
        return false;
    }

    touchChatActivity();
    appendChatMsg("user", text);
    input.value = "";

    respondToQuestion(text);
    return false;
}


document.addEventListener("DOMContentLoaded", () => {
    initChrome();
    renderCourseCards();

    if (window.emailjs && CONFIG.EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
        emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
    }

    document.getElementById("course-modal-overlay")?.addEventListener("click", (e) => {
        if (e.target.id === "course-modal-overlay") closeCourseModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeCourseModal();
    });

    document.getElementById("chat-form")?.addEventListener("submit", sendChatMessage);
    document.getElementById("chat-gate-form")?.addEventListener("submit", submitChatName);
});
