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

		var required = [
			"sno",
			"name",
			"phone",
			"start_date",
			"end_date",
			"status",
			"membership_months",
		];
		for (var i = 0; i < required.length; i++) {
			if (!payload[required[i]]) {
				return jsonResponse({
					ok: false,
					error: "Missing field: " + required[i],
				});
			}
		}

		var sheet = getTargetSheet();

		// A request can execute successfully here but still show as "failed" to
		// the caller (e.g. Google returning a stale response right after a new
		// deployment) -- the app may retry the same sno. Guard against writing
		// a duplicate row for a retry that actually succeeded the first time.
		if (rowAlreadyExists(sheet, payload.sno)) {
			return jsonResponse({ ok: true, deduped: true });
		}

		// Columns A-Q: SNo, Name, Phone Number, Email ID, Membership start date,
		// Membership end date, Status, Membership month, Total Fees, Collection
		// Status, Training Type, Morning/Evening, Batch, Cali %, Cali Revenue,
		// PT Trainer Rev, Invoice Shared. Adjust the column order below if your
		// sheet's layout differs.
		var invoiceShared =
			payload.invoice_shared === true || payload.invoice_shared === "Yes";
		var row = [
			payload.sno,
			payload.name,
			payload.phone,
			payload.email || "",
			parseDate(payload.start_date),
			parseDate(payload.end_date),
			payload.status,
			payload.membership_months,
			payload.total_fee || "",
			payload.collection_status || "",
			payload.training_type || "",
			payload.morning_evening || "",
			payload.batch || "",
			payload.cali_percent === "" ? "" : Number(payload.cali_percent),
			payload.cali_revenue === "" ? "" : Number(payload.cali_revenue),
			payload.pt_trainer_rev,
			invoiceShared,
		];

		sheet.appendRow(row);

		// appendRow inherits whatever format the column already has, which can
		// misrender specific types (a Date cell showing a time, a plain number in
		// a Percent-formatted column reading as 100x too large). Pin down the
		// format for the columns that need it explicitly, on the row just added.
		var rowIndex = sheet.getLastRow();
		sheet.getRange(rowIndex, 5, 1, 2).setNumberFormat("MM/dd/yyyy"); // start date, end date
		var caliCell = sheet.getRange(rowIndex, 14); // Cali %
		caliCell.setNumberFormat('0"%"');
		var invoiceCell = sheet.getRange(rowIndex, 17); // Invoice Shared
		invoiceCell.insertCheckboxes();
		invoiceCell.setValue(invoiceShared);

		return jsonResponse({ ok: true });
	} catch (err) {
		return jsonResponse({ ok: false, error: String(err) });
	}
}

// Column A (SNo) is unique per signup/renewal -- if a row with this exact
// SNo is already on the sheet, this request already succeeded once before.
function rowAlreadyExists(sheet, sno) {
	var lastRow = sheet.getLastRow();
	if (lastRow < 2) return false;
	var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
	var target = String(sno).trim();
	for (var i = 0; i < values.length; i++) {
		if (String(values[i][0]).trim() === target) return true;
	}
	return false;
}

function parseDate(isoDate) {
	// isoDate is "YYYY-MM-DD" -- construct at noon local time to avoid any
	// timezone rollover shifting it to the previous/next day in the sheet.
	var parts = isoDate.split("-");
	return new Date(
		Number(parts[0]),
		Number(parts[1]) - 1,
		Number(parts[2]),
		12,
		0,
		0,
	);
}

function jsonResponse(obj) {
	return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
		ContentService.MimeType.JSON,
	);
}
