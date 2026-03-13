// ════════════════════════════════════════════════════════════════
// Shadow's Car Wash & Detailing — Google Apps Script Backend
// ════════════════════════════════════════════════════════════════
// HOW TO DEPLOY:
//  1. Go to script.google.com → New project → paste this file as Code.gs
//  2. Create two HTML files: Index.html and Dashboard.html (paste content)
//  3. Deploy → New deployment → Web app
//     - Execute as: Me
//     - Who has access: Anyone (or Anyone with Google account for private)
//  4. Copy the web app URL — that's your live app!
// ════════════════════════════════════════════════════════════════

const SHEET_NAME   = "Bookings";
const LOG_SHEET    = "ActivityLog";
const ADMIN_EMAIL  = Session.getActiveUser().getEmail(); // auto-detects owner

// ── Entry Points ──────────────────────────────────────────────
function doGet(e) {
  const page = e.parameter.page || "index";
  if (page === "dashboard") {
    return HtmlService.createTemplateFromFile("Dashboard")
      .evaluate()
      .setTitle("Shadow's Detailing — Dashboard")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Shadow's Car Wash & Detailing")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Include partial HTML files (for CSS/JS snippets if needed)
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Sheet Helpers ─────────────────────────────────────────────
function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      const hRow = sheet.getRange(1, 1, 1, headers.length);
      hRow.setValues([headers]);
      hRow.setFontWeight("bold");
      hRow.setBackground("#0A0A0A");
      hRow.setFontColor("#C8A84B");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// ── Save Booking ──────────────────────────────────────────────
function saveBooking(data) {
  try {
    const sheet = getOrCreateSheet(SHEET_NAME, [
      "Ref", "Timestamp", "Status", "Customer Name", "Phone",
      "Car Model", "Reg Plate", "Car Type", "Service", "Category",
      "Price (₹)", "Date", "Time", "Notes", "Payment Status"
    ]);

    const ref   = "SHD-" + String(Math.floor(Math.random() * 9000 + 1000));
    const ts    = new Date();

    sheet.appendRow([
      ref,
      Utilities.formatDate(ts, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      "Confirmed",
      data.customerName || "—",
      data.phone        || "—",
      data.carModel     || "—",
      data.regPlate     || "—",
      data.carType      || "—",
      data.service      || "—",
      data.category     || "—",
      data.price        || 0,
      data.date         || "—",
      data.time         || "—",
      data.notes        || "",
      "Pending"
    ]);

    // Auto-resize columns
    sheet.autoResizeColumns(1, 15);

    // Send confirmation email if we have a phone/name
    try { sendConfirmationEmail(data, ref); } catch(e) {}

    // Log activity
    logActivity("NEW_BOOKING", ref + " — " + data.customerName + " — " + data.service);

    return { success: true, ref: ref };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Get All Bookings ──────────────────────────────────────────
function getBookings() {
  try {
    const sheet = getOrCreateSheet(SHEET_NAME, []);
    const data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, rows: [] };

    const headers = data[0];
    const rows    = data.slice(1).map((row, i) => {
      const obj = {};
      headers.forEach((h, j) => { obj[h] = row[j]; });
      obj._rowIndex = i + 2; // 1-based, accounting for header
      return obj;
    });
    return { success: true, rows: rows.reverse() }; // newest first
  } catch (err) {
    return { success: false, error: err.message, rows: [] };
  }
}

// ── Update Payment Status ─────────────────────────────────────
function updatePaymentStatus(ref, status) {
  try {
    const sheet = getOrCreateSheet(SHEET_NAME, []);
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const refCol  = headers.indexOf("Ref");
    const payCol  = headers.indexOf("Payment Status");

    for (let i = 1; i < data.length; i++) {
      if (data[i][refCol] === ref) {
        sheet.getRange(i + 1, payCol + 1).setValue(status);
        logActivity("PAYMENT_UPDATE", ref + " → " + status);
        return { success: true };
      }
    }
    return { success: false, error: "Ref not found" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Update Booking Status (Confirmed / Completed / Cancelled) ─
function updateBookingStatus(ref, status) {
  try {
    const sheet   = getOrCreateSheet(SHEET_NAME, []);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const refCol  = headers.indexOf("Ref");
    const stCol   = headers.indexOf("Status");

    for (let i = 1; i < data.length; i++) {
      if (data[i][refCol] === ref) {
        sheet.getRange(i + 1, stCol + 1).setValue(status);
        logActivity("STATUS_UPDATE", ref + " → " + status);
        return { success: true };
      }
    }
    return { success: false, error: "Ref not found" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Delete Booking ─────────────────────────────────────────────
function deleteBooking(ref) {
  try {
    const sheet   = getOrCreateSheet(SHEET_NAME, []);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const refCol  = headers.indexOf("Ref");

    for (let i = 1; i < data.length; i++) {
      if (data[i][refCol] === ref) {
        sheet.deleteRow(i + 1);
        logActivity("DELETE", ref);
        return { success: true };
      }
    }
    return { success: false, error: "Ref not found" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Dashboard Stats ────────────────────────────────────────────
function getDashboardStats() {
  try {
    const result = getBookings();
    if (!result.success) return { success: false };
    const rows = result.rows;

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    let totalRevenue = 0, pendingCount = 0, todayCount = 0, completedCount = 0;
    const byService  = {}, byCarType = {};

    rows.forEach(r => {
      const price = parseFloat(r["Price (₹)"]) || 0;
      if (r["Payment Status"] !== "Pending") totalRevenue += price;
      if (r["Payment Status"] === "Pending")  pendingCount++;
      if (r["Date"] === today)                todayCount++;
      if (r["Status"] === "Completed")        completedCount++;

      const svc = r["Service"] || "Other";
      byService[svc] = (byService[svc] || 0) + 1;

      const ct = r["Car Type"] || "Other";
      byCarType[ct] = (byCarType[ct] || 0) + 1;
    });

    return {
      success:       true,
      total:         rows.length,
      totalRevenue:  totalRevenue,
      pendingCount:  pendingCount,
      todayCount:    todayCount,
      completedCount:completedCount,
      byService:     byService,
      byCarType:     byCarType,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Send Confirmation Email ────────────────────────────────────
function sendConfirmationEmail(data, ref) {
  const subject = `[Shadow's Detailing] New Booking ${ref} — ${data.customerName}`;
  const body = `
New booking received!\n
Reference : ${ref}
Customer  : ${data.customerName}
Phone     : ${data.phone}
Car       : ${data.carModel} (${data.carType}) — ${data.regPlate}
Service   : ${data.service}
Date/Time : ${data.date} at ${data.time}
Price     : ₹${Number(data.price).toLocaleString('en-IN')}
Notes     : ${data.notes || '—'}
  `;
  MailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

// ── Activity Log ───────────────────────────────────────────────
function logActivity(action, detail) {
  const sheet = getOrCreateSheet(LOG_SHEET, ["Timestamp", "Action", "Detail"]);
  sheet.appendRow([
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    action,
    detail
  ]);
}
