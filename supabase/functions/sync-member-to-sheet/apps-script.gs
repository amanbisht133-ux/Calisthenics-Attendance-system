// Paste this into your Google Sheet's Extensions -> Apps Script editor,
// replacing any existing code in Code.gs. Then Deploy -> New deployment ->
// type "Web app", execute as "Me", who has access "Anyone with the link".
// Copy the resulting Web App URL into Admin -> Members -> Spreadsheet Sync.
//
// SECRET_TOKEN below must match the token you set in Admin -> Members ->
// Spreadsheet Sync (any random string you choose) -- this stops random
// people who find the URL from writing rows into your sheet.

var SECRET_TOKEN = "REPLACE_WITH_A_RANDOM_TOKEN";

// The tab to append to -- this assumes the first tab (gid=0) is the one
// with the SNo/Name/Phone/... columns, matching the sheet you shared.
function getTargetSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.token !== SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: "Invalid token." });
    }

    var required = ["sno", "name", "phone", "start_date", "end_date", "status", "membership_months"];
    for (var i = 0; i < required.length; i++) {
      if (!payload[required[i]]) {
        return jsonResponse({ ok: false, error: "Missing field: " + required[i] });
      }
    }

    var sheet = getTargetSheet();

    // Columns A-H: SNo, Name, Phone Number, Email ID, Membership start date,
    // Membership end date, Status, Membership month. Email (D) is left blank
    // -- the app doesn't collect it. Everything from column I onward (fees,
    // collection status, training type, revenue splits, monthly breakdown)
    // is left blank for manual entry.
    var row = [
      payload.sno,
      payload.name,
      payload.phone,
      "",
      parseDate(payload.start_date),
      parseDate(payload.end_date),
      payload.status,
      payload.membership_months,
    ];

    sheet.appendRow(row);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function parseDate(isoDate) {
  // isoDate is "YYYY-MM-DD" -- construct at noon local time to avoid any
  // timezone rollover shifting it to the previous/next day in the sheet.
  var parts = isoDate.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
