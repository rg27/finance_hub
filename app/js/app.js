/* =========================================================================

    FINANCE HUB — Zoho CRM widget (Quotes module)

    ========================================================================= */



let currentQuoteId;
let currentReviewAction = null;
let currentLineItems = [];
let lastPaymentLinkUrl = null;


const FUNCTION_MAP = {
    create_zb_invoice: "fh_create_zb_invoice",
    create_zb_estimate: "fh_create_zb_estimate",
    create_payment_link: "fh_create_payment_link1",
    cancel_payment_link: "fh_cancel_payment_link",
    add_activity_mix: "fh_add_activity_mix",
    add_general_trading_activity: "fh_add_general_trading_activity"
};

const ACTION_STATUS_TEXT = {

    create_zb_invoice: "Creating invoice...",
    create_zb_estimate: "Creating estimate...",
    create_payment_link: "Generating payment link...",
    cancel_payment_link: "Voiding active payment link...",
    add_activity_mix: "Attaching Activity Mix record...",
    add_general_trading_activity: "Attaching General Trading Activity record..."
};


const ZB_INVOICE_BASE_URL = "https://books.zoho.com/app/682374092#/invoices";

function openZohoBooksInvoice(invoiceId) {
    if (!invoiceId) return;
    const url = `${ZB_INVOICE_BASE_URL}/${invoiceId}?filter_by=Status.All&per_page=200&sort_column=invoice_number&sort_order=D`;
    const newTab = window.open(url, "_blank");
    if (!newTab) {
        console.warn("[Finance Hub] ⚠ Popup blocked — could not auto-open the invoice tab.");
        showToast("Invoice created, but your browser blocked the new tab. Check pop-up settings.", "error");
    }
}



// Base URL for a newly created Zoho Books Estimate ("Quote" in Books terms)

const ZB_ESTIMATE_BASE_URL = "https://books.zoho.com/app/682374092#/quotes";



ZOHO.embeddedApp.on("PageLoad", async function (entity) {

    console.log("[Finance Hub] 🔍 PageLoad Event Triggered. Raw entity object:", JSON.stringify(entity, null, 2));



    ZOHO.CRM.UI.Resize({ height: "750", width: "1300" });



    currentQuoteId = entity && entity.EntityId ? entity.EntityId[0] : null;

    console.log("[Finance Hub] 🔑 Captured currentQuoteId (EntityId[0]):", currentQuoteId);



    await initPortal();

});



ZOHO.embeddedApp.init();



async function initPortal() {
    setActionButtonsEnabled(false);
    setLastUpdateLabel("Loading quote...");
    try {
        await fetchQuoteData();
        setLastUpdateLabel(`Last synced ${new Date().toLocaleTimeString()}`);
    } catch (err) {
        console.error("[Finance Hub] ✗ Initialization error:", err);
        setLastUpdateLabel("Could not load quote data");
    }
}



function setLastUpdateLabel(text) {

    const el = document.getElementById("last-update-time");

    if (el) el.textContent = text;

}



function safeJsonParse(raw) {

    if (raw === undefined || raw === null) throw new Error("Empty output from Deluge function.");



    let str = String(raw).trim();



    try {

        return JSON.parse(str);

    } catch (_) {

        // Fall through

    }



    if (str.startsWith("{") && str.endsWith("}") && str.includes("},{")) {

        try {

            return JSON.parse("[" + str + "]");

        } catch (_) {

            // Fall through

        }

    }



    const startIdx = str.search(/[\[{]/);

    if (startIdx === -1) throw new Error("No JSON array/object found in output.");



    const openChar = str[startIdx];

    const closeChar = openChar === "[" ? "]" : "}";

    let depth = 0;

    let inString = false;

    let escapeNext = false;



    for (let i = startIdx; i < str.length; i++) {

        const ch = str[i];



        if (inString) {

            if (escapeNext) { escapeNext = false; }

            else if (ch === "\\") { escapeNext = true; }

            else if (ch === '"') { inString = false; }

            continue;

        }



        if (ch === '"') { inString = true; continue; }

        if (ch === openChar) depth++;

        if (ch === closeChar) {

            depth--;

            if (depth === 0) {

                const candidate = str.slice(startIdx, i + 1);

                return JSON.parse(candidate);

            }

        }

    }



    throw new Error("Could not find a matching closing bracket for JSON output.");

}



async function fetchQuoteData() {

    const funcName = "fh_get_quote_record";

    const payload = { "quote_id": currentQuoteId };

    const args = { "arguments": JSON.stringify(payload) };



    try {

        const response = await ZOHO.CRM.FUNCTIONS.execute(funcName, args);



        if (response && response.details && response.details.output !== undefined) {

            const rawOutput = response.details.output;

            const quoteData = safeJsonParse(rawOutput);

            populateHeaderFromQuoteRecord(quoteData);

        } else {

            throw new Error("Invalid response structural payload returned from Deluge execution.");

        }

    } catch (error) {

        console.error(`[Finance Hub] ✗ Execute failed for ${funcName}:`, error);

        throw error;

    }

}



function populateHeaderFromQuoteRecord(record) {

    if (!record) return;
    setActionButtonsEnabled(true);

    setText("q-subject", record.subject);

    setText("q-ref-no", record.quote_ref_no || currentQuoteId);

    setText("q-owner", record.quote_owner);

    let displayTotal = "—";

    if (record.dashboard_total !== undefined && record.dashboard_total !== null && record.dashboard_total !== "") {

        const num = parseFloat(record.dashboard_total);

        displayTotal = isNaN(num) ? record.dashboard_total : "AED " + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    }

    setText("q-dashboard-total", displayTotal);



    const prospectEl = document.getElementById("q-prospect");

    if (prospectEl) {

        if (record.prospect_name && record.prospect_id) {

            prospectEl.innerHTML = `<a href="https://crm.zoho.com/crm/org682300086/tab/Potentials/${record.prospect_id}" target="_blank" class="text-blue-600 hover:underline dark:text-blue-400">${record.prospect_name}</a>`;

        } else {

            prospectEl.innerText = record.prospect_name || "—";

        }

    }



    const accountEl = document.getElementById("comp-name");

    if (accountEl) {

        if (record.account_name && record.account_id) {

            accountEl.innerHTML = `<a href="https://crm.zoho.com/crm/org682300086/tab/Accounts/${record.account_id}" target="_blank" class="text-blue-600 hover:underline dark:text-blue-400">${record.account_name}</a>`;

        } else {

            accountEl.innerText = record.account_name || "—";

        }

    }



    const zbLink = document.getElementById("link-zohobooks");

    if (zbLink && record.zoho_books_url) {

        zbLink.href = record.zoho_books_url;

    }

    updateActionButtonState("create_zb_estimate", record.already_created_zb_estimate === true || record.already_created_zb_estimate === "true");
    updateActionButtonState("create_zb_invoice", record.already_created_zb_invoice === true || record.already_created_zb_invoice === "true");

}

function setText(id, value) {

    const el = document.getElementById(id);

    if (el) el.innerText = (value === undefined || value === null || value === "") ? "—" : value;

}

function updateActionButtonState(actionKey, isCreated) {
    const btn = document.querySelector(`.fh-action-btn[data-action="${actionKey}"]`);
    if (!btn) return;

    const existingBadge = btn.querySelector(".fh-created-badge");
    if (existingBadge) existingBadge.remove();

    if (isCreated) {
        btn.classList.add("fh-action-btn--done");
        btn.setAttribute("data-created", "true");

        const badge = document.createElement("span");
        badge.className = "fh-created-badge";
        badge.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>Created`;
        btn.appendChild(badge);
    } else {
        btn.classList.remove("fh-action-btn--done");
        btn.removeAttribute("data-created");
    }
}



document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".fh-action-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const actionKey = btn.getAttribute("data-action");
            const label = btn.getAttribute("data-label") || actionKey;

            if (btn.getAttribute("data-created") === "true") {
                const itemLabel = actionKey === "create_zb_estimate" ? "Estimate" : actionKey === "create_zb_invoice" ? "Invoice" : "record";
                showToast(`A Zoho Books ${itemLabel} has already been created for this quote.`, "error");
                return;
            }

            if (actionKey === "create_zb_estimate" || actionKey === "create_zb_invoice") {
                openEstimateView(actionKey, label);
                return;
            }

            runFinanceAction(actionKey, label, btn);
        });
    });

    const backBtn = document.getElementById("back-to-dashboard-btn");
    if (backBtn) {
        backBtn.addEventListener("click", backToDashboard);
    }
});



async function runFinanceAction(actionKey, label, btnEl, extraPayload = {}) {
    const funcName = FUNCTION_MAP[actionKey];
    if (!funcName) return false;

    openOverlay(label, ACTION_STATUS_TEXT[actionKey] || "Processing...");
    if (btnEl) btnEl.classList.add("is-loading");

    const payload = { "quote_id": currentQuoteId, "action": actionKey, ...extraPayload };
    const args = { "arguments": JSON.stringify(payload) };

    console.log(`[Finance Hub] ▶ Calling ${funcName}`);
    console.log(`[Finance Hub] ▶ Payload (pre-stringify):`, payload);
    console.log(`[Finance Hub] ▶ Args sent to ZOHO.CRM.FUNCTIONS.execute:`, args);

    try {
        const response = await ZOHO.CRM.FUNCTIONS.execute(funcName, args);

        console.log(`[Finance Hub] ◀ Raw response object from ${funcName}:`, response);
        console.log(`[Finance Hub] ◀ Raw response.details:`, response && response.details);
        console.log(`[Finance Hub] ◀ Raw output string:`, response && response.details ? response.details.output : null);

        const output = response && response.details ? response.details.output : null;
        let parsed = null;
        try {
            parsed = output !== null && output !== undefined ? safeJsonParse(output) : null;
            console.log(`[Finance Hub] ◀ Parsed output:`, parsed);
        } catch (parseErr) {
            console.error(`[Finance Hub] ✗ Failed to parse output from ${funcName}:`, parseErr);
            console.error(`[Finance Hub] ✗ Output that failed to parse was:`, output);
        }

        const isSuccess = parsed && parsed.status === "successful";
        let resultMessage = (parsed && parsed.description)
            ? parsed.description
            : (isSuccess ? `${label} completed successfully.` : `${label} failed.`);

        console.log(`[Finance Hub] ◀ isSuccess:`, isSuccess, `| resultMessage:`, resultMessage);

        // ▼▼▼ REPLACE FROM HERE ▼▼▼
        if (isSuccess) {
        let resultRecordId = null;
        let openRecordFn = null;
        let paymentLinkData = null;

        if (actionKey === "create_zb_estimate" && parsed.estimate_id) {
            resultRecordId = parsed.estimate_id;
            openRecordFn = openZohoBooksEstimate;
        } else if (actionKey === "create_zb_invoice" && parsed.invoice_id) {
            resultRecordId = parsed.invoice_id;
            openRecordFn = openZohoBooksInvoice;
        } else if (actionKey === "create_payment_link" && parsed.payment_link_url) {
            paymentLinkData = {
                url: parsed.payment_link_url,
                amount: formatPaymentAmount(parsed.payment_amount),
                expiry: formatPaymentExpiry(parsed.expiry)
            };
        }

        showOverlayResult(true, resultMessage, resultRecordId, openRecordFn, paymentLinkData);
        showToast(resultMessage, "success");
        fetchQuoteData().catch(() => {});

        if (openRecordFn && resultRecordId) {
            openRecordFn(resultRecordId);
        }
        } else {
            closeOverlay();
            showToast(resultMessage, "error");
        }
            // ▲▲▲ TO HERE ▲▲▲
         return isSuccess;
        } catch (error) {
            console.error(`[Finance Hub] ✗ Execute failed for ${funcName}:`, error);
            const failMsg = `${label} failed. Check console for details.`;
            closeOverlay();
            showToast(failMsg, "error");
            return false;
        } finally {
            if (btnEl) btnEl.classList.remove("is-loading");
        }
    }



async function confirmCreateEstimate() {
    const hasInactiveProduct = currentLineItems.some(item => item.is_valid === false);

    if (hasInactiveProduct) {
        showToast("Cannot proceed: One or more products in the list are inactive.", "error");
        return;
    }

    const descInputs = document.querySelectorAll('.product-desc-input');
    let hasExceededDesc = false;
    descInputs.forEach(input => {
        if (input.value.length > 6000) {
            hasExceededDesc = true;
        }
    });

    if (hasExceededDesc) {
        showToast("Cannot proceed: One or more product descriptions exceed the maximum limit of 6,000 characters.", "error");
        return;
    }

    const btn = document.getElementById("confirm-create-estimate-btn");
    const quotedItemsPayload = getLineItemsWithLicenseFlags();

    const actionKey = currentReviewAction || "create_zb_estimate";
    const label = actionKey === "create_zb_invoice" ? "Create ZB Invoice" : "Create ZB Estimates";

    const success = await runFinanceAction(actionKey, label, btn, {
        quoted_items: quotedItemsPayload
    });

    if (success) {
        backToDashboard();
    }
}


function openZohoBooksEstimate(estimateId) {

    if (!estimateId) return;

    const url = `${ZB_ESTIMATE_BASE_URL}/${estimateId}?filter_by=Status.All&per_page=200&sort_column=estimate_number&sort_order=D`;

    const newTab = window.open(url, "_blank");

    if (!newTab) {

        console.warn("[Finance Hub] ⚠ Popup blocked — could not auto-open the estimate tab.");

        showToast("Estimate created, but your browser blocked the new tab. Check pop-up settings.", "error");

    }

}

let lastCreatedRecordId = null;

function openOverlay(title, statusText) {
    const overlay = document.getElementById("loader-overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayStatus = document.getElementById("overlay-status");
    const spinnerWrap = document.getElementById("spinner-wrap");
    const resultIconWrap = document.getElementById("result-icon-wrap");
    const resultBlock = document.getElementById("overlay-result");
    const idChipWrap = document.getElementById("overlay-id-chip-wrap");
    const openBooksBtn = document.getElementById("overlay-open-books-btn");
    const paymentWrap = document.getElementById("overlay-payment-wrap");

    if (overlayTitle) overlayTitle.textContent = title;
    if (overlayStatus) { overlayStatus.textContent = statusText; overlayStatus.classList.remove("hidden"); }
    if (spinnerWrap) spinnerWrap.classList.remove("hidden");
    if (resultIconWrap) { resultIconWrap.classList.add("hidden"); resultIconWrap.classList.remove("flex"); }
    if (resultBlock) resultBlock.classList.add("hidden");
    if (idChipWrap) { idChipWrap.classList.add("hidden"); idChipWrap.classList.remove("flex"); }
    if (openBooksBtn) { openBooksBtn.classList.add("hidden"); openBooksBtn.onclick = null; }
    if (paymentWrap) { paymentWrap.classList.add("hidden"); paymentWrap.classList.remove("flex"); }
    lastCreatedRecordId = null;
    lastOpenRecordFn = null;
    lastPaymentLinkUrl = null;
    if (overlay) { overlay.classList.remove("hidden"); overlay.classList.add("flex"); }
}


function showOverlayResult(success, message, recordId = null, openFn = null, paymentLink = null) {
    const overlayTitle = document.getElementById("overlay-title");
    const overlayStatus = document.getElementById("overlay-status");
    const spinnerWrap = document.getElementById("spinner-wrap");
    const resultIconWrap = document.getElementById("result-icon-wrap");
    const resultIcon = document.getElementById("result-icon");
    const resultIconSvg = document.getElementById("result-icon-svg");
    const resultBlock = document.getElementById("overlay-result");
    const resultText = document.getElementById("overlay-result-text");
    const idChipWrap = document.getElementById("overlay-id-chip-wrap");
    const idValue = document.getElementById("overlay-id-value");
    const openBooksBtn = document.getElementById("overlay-open-books-btn");
    const doneBtn = document.getElementById("overlay-done-btn");
    const paymentWrap = document.getElementById("overlay-payment-wrap");
    const paymentAmount = document.getElementById("overlay-payment-amount");
    const paymentExpiry = document.getElementById("overlay-payment-expiry");
    const paymentLinkText = document.getElementById("overlay-payment-link-text");

    if (spinnerWrap) spinnerWrap.classList.add("hidden");
    if (overlayStatus) overlayStatus.classList.add("hidden");
    if (overlayTitle) overlayTitle.textContent = success ? "Success" : "Action Failed";

    if (resultIcon && resultIconSvg) {
        resultIcon.className = "fh-result-icon " + (success ? "success" : "error");
        resultIconSvg.innerHTML = success
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>';
    }
    if (resultIconWrap) { resultIconWrap.classList.remove("hidden"); resultIconWrap.classList.add("flex"); }

    if (resultText) {
        resultText.textContent = message;
        resultText.className = success
            ? "text-[10px] font-semibold leading-snug text-emerald-600 dark:text-emerald-400"
            : "text-[10px] font-semibold leading-snug text-red-600 dark:text-red-400";
    }

    lastCreatedRecordId = recordId || null;
    lastOpenRecordFn = openFn || null;
    lastPaymentLinkUrl = (paymentLink && paymentLink.url) ? paymentLink.url : null;

    const hasPaymentLink = success && paymentLink && paymentLink.url;

    if (paymentWrap) {
        if (hasPaymentLink) {
            if (paymentAmount) paymentAmount.textContent = paymentLink.amount || "—";
            if (paymentExpiry) paymentExpiry.textContent = paymentLink.expiry || "—";
            if (paymentLinkText) paymentLinkText.textContent = paymentLink.url;
            paymentWrap.classList.remove("hidden");
            paymentWrap.classList.add("flex");
        } else {
            paymentWrap.classList.add("hidden");
            paymentWrap.classList.remove("flex");
        }
    }

    if (idChipWrap && idValue) {
        if (success && recordId && !hasPaymentLink) {
            idValue.textContent = recordId;
            idChipWrap.classList.remove("hidden");
            idChipWrap.classList.add("flex");
        } else {
            idChipWrap.classList.add("hidden");
            idChipWrap.classList.remove("flex");
        }
    }

    if (openBooksBtn) {
        if (hasPaymentLink) {
            openBooksBtn.textContent = "Open Payment Link";
            openBooksBtn.classList.remove("hidden");
            openBooksBtn.onclick = () => window.open(paymentLink.url, "_blank");
        } else if (success && recordId && openFn) {
            openBooksBtn.textContent = "Open in Zoho Books";
            openBooksBtn.classList.remove("hidden");
            openBooksBtn.onclick = () => openFn(recordId);
        } else {
            openBooksBtn.classList.add("hidden");
            openBooksBtn.onclick = null;
        }
    }

    if (doneBtn) {
        const isRichSuccess = success && (recordId || hasPaymentLink);
        doneBtn.className = isRichSuccess
            ? "font-black px-5 py-2.5 rounded-lg text-[9px] uppercase tracking-wide active:scale-95 transition-all bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            : "fh-done-btn font-black px-5 py-2.5 rounded-lg text-[9px] uppercase tracking-wide active:scale-95 transition-all";
    }

    if (resultBlock) resultBlock.classList.remove("hidden");
}

let lastOpenRecordFn = null;

function copyRecordId() {
    if (!lastCreatedRecordId) return;
    const copyIcon = document.getElementById("overlay-copy-icon");

    navigator.clipboard.writeText(String(lastCreatedRecordId)).then(() => {
        if (copyIcon) {
            const original = copyIcon.innerHTML;
            copyIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>';
            copyIcon.classList.add("text-emerald-500");
            setTimeout(() => {
                copyIcon.innerHTML = original;
                copyIcon.classList.remove("text-emerald-500");
            }, 1200);
        }
    }).catch((err) => console.error("[Finance Hub] ✗ Copy failed:", err));
}



function closeOverlay() {

    const overlay = document.getElementById("loader-overlay");

    if (overlay) { overlay.classList.add("hidden"); overlay.classList.remove("flex"); }

}



async function openEstimateView(actionKey = "create_zb_estimate", label = "Create ZB Estimates") {
    currentReviewAction = actionKey;

    const mainPortal = document.getElementById("main-portal");
    const estimateView = document.getElementById("estimate-view");
    if (mainPortal) mainPortal.classList.add("hidden");
    if (estimateView) estimateView.classList.remove("hidden");

    const reviewSubtitle = document.getElementById("review-subtitle");
    if (reviewSubtitle) reviewSubtitle.textContent = `Review Quoted Items — ${label}`;

    const confirmBtn = document.getElementById("confirm-create-estimate-btn");
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = `Confirm & ${label}`;
    }

    await fetchQuoteLineItems();
}


function backToDashboard() {

    const mainPortal = document.getElementById("main-portal");

    const estimateView = document.getElementById("estimate-view");

    if (estimateView) estimateView.classList.add("hidden");

    if (mainPortal) mainPortal.classList.remove("hidden");

}



function closeAndReload() {

    if (typeof ZOHO !== "undefined") {

        ZOHO.CRM.UI.Popup.closeReload()

            .then((data) => {

                console.log("Widget closed and view reloaded successfully:", data);

            })

            .catch((err) => {

                console.error("Error executing closeReload:", err);

            });

    }

}



async function fetchQuoteLineItems() {
    const funcName = "fh_get_quote_line_items";
    const payload = { "quote_id": currentQuoteId };
    const args = { "arguments": JSON.stringify(payload) };
    const confirmBtn = document.getElementById("confirm-create-estimate-btn");

    try {
        const response = await ZOHO.CRM.FUNCTIONS.execute(funcName, args);

        if (response && response.details && response.details.output !== undefined) {
            const rawOutput = response.details.output;
            let items = safeJsonParse(rawOutput);

            if (items && !Array.isArray(items) && typeof items === "object") {
                items = [items];
            }

            currentLineItems = Array.isArray(items) ? items : [];
            renderLineItemsTable(currentLineItems);

            if (confirmBtn) confirmBtn.disabled = false;
        } else {
            throw new Error("Invalid response structural payload returned from Deluge execution.");
        }
    } catch (error) {
        console.error(`[Finance Hub] ✗ Execute failed for ${funcName}:`, error);
        const tbody = document.getElementById("line-items-tbody");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-[10px] font-bold text-red-500 uppercase tracking-wide">Could not load quoted items.</td></tr>`;
        }
        // confirmBtn stays disabled since it failed to load
    }
}



function formatAED(value) {

    const num = parseFloat(value);

    if (isNaN(num)) return "—";

    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

}



function escapeHtml(str) {

    const div = document.createElement("div");

    div.textContent = str === undefined || str === null ? "" : String(str);

    return div.innerHTML;

}



function renderLineItemsTable(items) {

    const tbody = document.getElementById("line-items-tbody");

    if (!tbody) return;



    if (!items.length) {

        tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">No quoted items found.</td></tr>`;

        return;

    }



    tbody.innerHTML = items.map((item, idx) => {

        const listPrice = parseFloat(item.list_price) || 0;

        const quantity = parseFloat(item.quantity) || 0;



        const total = (item.total !== undefined && item.total !== null && item.total !== "")

            ? parseFloat(item.total)

            : listPrice * quantity;



        const discount = (item.discount !== undefined && item.discount !== null && item.discount !== "")

            ? parseFloat(item.discount)

            : 0;



        const netTotal = (item.net_total !== undefined && item.net_total !== null && item.net_total !== "")

            ? parseFloat(item.net_total)

            : total - discount;



        const itemId = (item.id !== undefined && item.id !== null && item.id !== "") ? item.id : String(idx);

        const isChecked = item.not_count_as_license === true || item.not_count_as_license === "true";

        const isValid = item.is_valid !== false;



        const isLicenseCategory = item.product_category === "Licenses";

        const checkboxDisabledAttr = isLicenseCategory ? "" : "disabled";

        const checkboxCursorClass = isLicenseCategory ? "cursor-pointer" : "cursor-not-allowed opacity-40";



        const productNameHtml = (item.product_name && item.product_id)

            ? `<a href="https://crm.zoho.com/crm/org682300086/tab/Products/${escapeHtml(item.product_id)}" target="_blank" class="text-blue-600 hover:underline dark:text-blue-400">${escapeHtml(item.product_name)}</a>`

            : escapeHtml(item.product_name || "—");



        const inactiveBadge = !isValid

            ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 ml-2 align-middle">Inactive Product</span>`

            : "";



        const rowBgClass = isValid

            ? "border-b border-slate-100 dark:border-slate-700/60"

            : "border-b border-slate-100 dark:border-slate-700/60 bg-red-50/40 dark:bg-red-950/20";



        const productDesc = item.product_desc || "";

        const additionalDesc = item.additional_desc || "";

        const hasAdditional = additionalDesc.trim() !== "";

        const initialLen = productDesc.length;

        const isInitialExceeded = initialLen > 6000;



        const additionalDescCheckboxHtml = hasAdditional ? `

            <div class="mt-1.5 flex items-center gap-1.5">

                <input

                    type="checkbox"

                    class="additional-desc-checkbox w-3 h-3 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"

                    data-item-id="${escapeHtml(itemId)}"

                    id="add-desc-chk-${escapeHtml(itemId)}"

                    onchange="toggleAdditionalDesc('${escapeHtml(itemId)}', this)"

                />

                <label for="add-desc-chk-${escapeHtml(itemId)}" class="text-[9px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-wide cursor-pointer">

                    Include: ${escapeHtml(additionalDesc)}

                </label>

            </div>

        ` : "";



        const descriptionBox = `

            <div class="relative mt-1">

                <textarea

                    class="product-desc-input w-full text-[10px] font-medium leading-snug rounded-lg px-2 py-1.5 resize-y focus:outline-none focus:ring-1 transition-colors ${

                        isInitialExceeded

                            ? 'bg-red-50/50 dark:bg-red-950/30 border border-red-500 text-red-900 dark:text-red-200 focus:ring-red-500 focus:border-red-500'

                            : 'bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500'

                    }"

                    rows="2"

                    data-item-id="${escapeHtml(itemId)}"

                    data-base-desc="${escapeHtml(productDesc)}"

                    data-additional-desc="${escapeHtml(additionalDesc)}"

                    oninput="validateDescriptionLength(this)"

                    placeholder="Add or edit description..."

                >${escapeHtml(productDesc)}</textarea>

                <div class="flex items-center justify-between mt-1">

                    <span class="desc-error-text text-[8px] font-black text-red-500 uppercase tracking-wider ${isInitialExceeded ? '' : 'hidden'}">Exceeds 6,000 character limit!</span>

                    <span class="desc-char-count text-[8px] font-bold ml-auto ${isInitialExceeded ? 'text-red-500 font-black' : 'text-slate-400'}">${initialLen} / 6000</span>

                </div>

            </div>

            ${additionalDescCheckboxHtml}

        `;



        return `

            <tr class="${rowBgClass}">

                <td class="px-4 py-3 align-top text-xs font-bold text-slate-500 dark:text-slate-400 text-center">${idx + 1}</td>

                <td class="px-4 py-3 align-top min-w-[220px]">

                    <div class="text-xs font-extrabold text-slate-900 dark:text-white leading-snug flex items-center flex-wrap gap-1">

                        ${productNameHtml}

                        ${inactiveBadge}

                    </div>

                    ${descriptionBox}

                </td>

                <td class="px-4 py-3 align-top text-xs font-bold text-slate-700 dark:text-slate-300 text-right">${formatAED(listPrice)}</td>

                <td class="px-4 py-3 align-top text-xs font-bold text-slate-700 dark:text-slate-300 text-right">${quantity}</td>

                <td class="px-4 py-3 align-top text-xs font-bold text-slate-700 dark:text-slate-300 text-right">${formatAED(total)}</td>

                <td class="px-4 py-3 align-top text-xs font-bold text-amber-600 dark:text-amber-400 text-right">${discount ? "-" + formatAED(discount) : formatAED(0)}</td>

                <td class="px-4 py-3 align-top text-xs font-black text-emerald-600 dark:text-emerald-400 text-right">${formatAED(netTotal)}</td>

                <td class="px-4 py-3 align-top text-center">

                    <input type="checkbox" class="not-license-checkbox w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 ${checkboxCursorClass}" data-item-id="${escapeHtml(itemId)}" ${isChecked ? "checked" : ""} ${checkboxDisabledAttr} />

                </td>

            </tr>

        `;

    }).join("");

}



function validateDescriptionLength(textarea) {

    const val = textarea.value;

    const container = textarea.parentElement;

    const charCountSpan = container.querySelector('.desc-char-count');

    const errorSpan = container.querySelector('.desc-error-text');



    const len = val.length;

    if (charCountSpan) {

        charCountSpan.textContent = `${len} / 6000`;

        if (len > 6000) {

            charCountSpan.classList.add('text-red-500', 'font-black');

            charCountSpan.classList.remove('text-slate-400');

        } else {

            charCountSpan.classList.remove('text-red-500', 'font-black');

            charCountSpan.classList.add('text-slate-400');

        }

    }



    if (len > 6000) {

        textarea.classList.add('border-red-500', 'bg-red-50/50', 'dark:bg-red-950/30', 'text-red-900', 'dark:text-red-200', 'focus:ring-red-500', 'focus:border-red-500');

        textarea.classList.remove('border-slate-200', 'dark:border-slate-700', 'text-slate-500', 'dark:text-slate-400', 'focus:ring-indigo-500', 'focus:border-indigo-500');

        if (errorSpan) errorSpan.classList.remove('hidden');

    } else {

        textarea.classList.remove('border-red-500', 'bg-red-50/50', 'dark:bg-red-950/30', 'text-red-900', 'dark:text-red-200', 'focus:ring-red-500', 'focus:border-red-500');

        textarea.classList.add('border-slate-200', 'dark:border-slate-700', 'text-slate-500', 'dark:text-slate-400', 'focus:ring-indigo-500', 'focus:border-indigo-500');

        if (errorSpan) errorSpan.classList.add('hidden');

    }

}



function toggleAdditionalDesc(itemId, checkbox) {

    const textarea = document.querySelector(`textarea.product-desc-input[data-item-id="${itemId}"]`);

    if (!textarea) return;



    const baseDesc = textarea.getAttribute("data-base-desc") || "";

    const additionalDesc = textarea.getAttribute("data-additional-desc") || "";



    if (checkbox.checked) {

        textarea.value = baseDesc + (baseDesc && additionalDesc ? " | " : "") + additionalDesc;

    } else {

        textarea.value = baseDesc;

    }



    validateDescriptionLength(textarea);

}



function getLineItemsWithLicenseFlags() {

    return currentLineItems.map((item, idx) => {
        const itemId = (item.id !== undefined && item.id !== null && item.id !== "") ? item.id : String(idx);
        const checkbox = document.querySelector(`.not-license-checkbox[data-item-id="${CSS.escape(String(itemId))}"]`);

        const descInput = document.querySelector(`.product-desc-input[data-item-id="${CSS.escape(String(itemId))}"]`);
        return {

            ...item,

            product_desc: descInput ? descInput.value : item.product_desc,

            not_count_as_license: checkbox ? checkbox.checked : false
        };
    });
}

function setActionButtonsEnabled(enabled) {
    document.querySelectorAll(".fh-action-btn").forEach((btn) => {
        btn.disabled = !enabled;
    });
}


function showToast(message, type = "error") {

    const existingToast = document.getElementById("fh-toast-notification");

    if (existingToast) existingToast.remove();



    const isSuccess = type === "success";



    const borderClass = isSuccess ? "border-emerald-500/20" : "border-red-500/20";

    const iconBgClass = isSuccess

        ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400"

        : "bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400";

    const labelClass = isSuccess

        ? "text-emerald-600 dark:text-emerald-400"

        : "text-red-600 dark:text-red-400";

    const labelText = isSuccess ? "Success" : "Action Blocked";

    const progressBarClass = isSuccess ? "bg-emerald-500" : "bg-red-500";



    const iconPath = isSuccess

        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'

        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>';



    const toast = document.createElement("div");

    toast.id = "fh-toast-notification";

    toast.className = `fixed top-6 right-6 z-[9999] flex flex-col overflow-hidden rounded-2xl shadow-2xl border ${borderClass} bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl text-slate-900 dark:text-white transition-all duration-300 transform translate-y-[-20px] opacity-0 min-w-[320px] max-w-[400px]`;



    toast.innerHTML = `

        <div class="flex items-center gap-3.5 p-4">

            <div class="w-8 h-8 rounded-xl ${iconBgClass} flex items-center justify-center flex-shrink-0 shadow-inner">

                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconPath}</svg>

            </div>

            <div class="flex-1 pr-2">

                <p class="text-[9px] font-black uppercase tracking-widest ${labelClass} mb-0.5">${labelText}</p>

                <p class="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-snug">${escapeHtml(message)}</p>

            </div>

        </div>

        <div class="h-1 bg-slate-100 dark:bg-slate-800 w-full overflow-hidden">

            <div id="toast-progress" class="h-full ${progressBarClass} w-full origin-left"></div>

        </div>

    `;



    document.body.appendChild(toast);



    setTimeout(() => {

        toast.classList.remove("translate-y-[-20px]", "opacity-0");

        const progressBar = document.getElementById("toast-progress");

        if (progressBar) {

            progressBar.style.transition = "none";

            progressBar.style.width = "100%";

            void progressBar.offsetWidth; // Trigger reflow

            progressBar.style.transition = "width 3s linear";

            progressBar.style.width = "0%";

        }

    }, 10);



    setTimeout(() => {

        toast.classList.add("translate-y-[-20px]", "opacity-0");

        setTimeout(() => toast.remove(), 300);

    }, 3000);

}



function formatPaymentAmount(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return "—";
    return "AED " + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPaymentExpiry(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function copyPaymentLink() {
    if (!lastPaymentLinkUrl) return;
    const copyIcon = document.getElementById("overlay-link-copy-icon");

    navigator.clipboard.writeText(lastPaymentLinkUrl).then(() => {
        if (copyIcon) {
            const original = copyIcon.innerHTML;
            copyIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>';
            copyIcon.classList.add("text-emerald-500");
            setTimeout(() => {
                copyIcon.innerHTML = original;
                copyIcon.classList.remove("text-emerald-500");
            }, 1200);
        }
    }).catch((err) => console.error("[Finance Hub] ✗ Copy failed:", err));
}