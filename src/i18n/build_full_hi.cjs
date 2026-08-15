const fs = require('fs');

const enPath = 'c:/xampp/htdocs/artists_farm/src/i18n/en.ts';
const hiPath = 'c:/xampp/htdocs/artists_farm/src/i18n/hi.ts';

const enContent = fs.readFileSync(enPath, 'utf8');

// Parse keys and values from en.ts
const regex = /^\s*([a-zA-Z0-9_]+)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,?/gm;
const enEntries = [];
let match;
while ((match = regex.exec(enContent)) !== null) {
  const key = match[1];
  let rawVal = match[2];
  let val;
  try {
    val = JSON.parse(rawVal.startsWith('"') ? rawVal : `"${rawVal.slice(1, -1).replace(/"/g, '\\"')}"`);
  } catch (e) {
    val = rawVal.substring(1, rawVal.length - 1);
  }
  enEntries.push({ key, enVal: val });
}

console.log(`Extracted ${enEntries.length} entries from en.ts`);

// Curated everyday Hindi mappings for terms
const exactMap = {
  "Dashboard": "डैशबोर्ड",
  "Overview Dashboard": "डैशबोर्ड",
  "Register New Guest": "नया गेस्ट जोड़ें",
  "Billing & Checkout": "बिल और चेक-आउट",
  "Guest History Archive": "पुराने गेस्ट",
  "New Food Order": "नया खाना ऑर्डर",
  "Kitchen Orders": "किचन ऑर्डर",
  "Stock Requests": "सामान की मांग",
  "Fulfill Stock Requests": "सामान दें",
  "Kitchen Wastage Logs": "किचन वेस्टेज रिकॉर्ड",
  "Stock & Adjustments": "स्टॉक और सामान",
  "Kitchen Purchases": "किचन की खरीदारी",
  "Staff Meal Logs": "स्टाफ का खाना",
  "Staff & Payees Control": "स्टाफ लिस्ट",
  "Attendance Calendar": "स्टाफ हाजिरी",
  "Staff Directory & Salaries": "स्टाफ सैलरी और एडवांस",
  "Expenses Log": "खर्चे (Expenses)",
  "Cash Drawer": "कैश गल्ला (Drawer)",
  "Edit Food Menu": "फूड मेनू सेट करें",
  "Edit Kitchen Stock": "किचन का सामान",
  "Edit Expense Items": "खर्च की लिस्ट",
  "Misc Charges Settings": "एक्स्ट्रा चार्ज सेटिंग्स",
  "Telegram Alerts Config": "टेलीग्राम अलर्ट्स",
  "iCal Sync Manager": "कैलेंडर सिंक (Airbnb/MMT)",
  "Service Requests": "गेस्ट की मांग (Towel/Water)",
  "Data Export Center": "डेटा डाउनलोड / बैकअप",
  "Dashboard Analytics": "कमाई और रिपोर्ट",
  "Purchase Analytics": "खरीदारी रिपोर्ट",
  "Past Receipts Log": "पुराने बिल",
  "Login Logs": "लॉगिन हिस्ट्री",
  "System Health Status": "सिस्टम स्थिति",
  "Super Admin": "मालिक (Super Admin)",
  "Admin": "एडमिन",
  "Manager": "मैनेजर",
  "Team Member": "स्टाफ",
  "Chef": "कुक / शेफ",
  "Kitchen Staff": "किचन स्टाफ",
  "Supervisor": "सुपरवाइजर",
  "Team Role": "पद / रोल",
  "Paid By": "किसने दिया",
  "Add Guest Booking": "नया गेस्ट जोड़ें",
  "Guest Name *": "गेस्ट का नाम *",
  "Contact Phone Number *": "फोन नंबर *",
  "Assigned Room / Villa *": "कमरा चुनें *",
  "Booking Source": "बुकिंग कहां से आई",
  "No. of Guests": "कितने लोग (Guests)",
  "Check-In Date *": "चेक-इन तारीख *",
  "Check-Out Date *": "चेक-out तारीख *",
  "Check-In Time (Optional)": "चेक-इन टाइम",
  "Check-Out Time (Optional)": "चेक-out टाइम",
  "Save Guest Booking": "बुकिंग सेव करें",
  "Save": "सेव करें",
  "Cancel": "कैंसिल",
  "Delete": "हटाएं (Delete)",
  "Edit": "बदलें (Edit)",
  "Loading...": "लोड हो रहा है...",
  "Search...": "खोजें...",
  "Close": "बंद करें",
  "Confirm": "कन्फर्म करें",
  "Print": "प्रिंट करें",
  "Status": "स्टेटस",
  "Date": "तारीख",
  "Amount": "रुपये (₹)",
  "Notes": "नोट",
  "Cash": "कैश",
  "Pending": "बाकी (Pending)",
  "Paid": "चुका दिया (Paid)",
  "Due": "बाकी (Due)",
  "Room": "कमरा",
  "Total": "कुल",
  "Actions": "ऑप्शंस",
  "Yes": "हाँ",
  "No": "नहीं",
  "Back": "पीछे जाएं",
  "Next": "आगे बढ़ें",
  "Submit": "सबमिट करें",
  "View": "देखें",
  "Download": "डाउनलोड",
  "Active": "चालू (Active)",
  "Inactive": "बंद (Inactive)",
  "Filter": "फिल्टर",
  "Clear": "साफ करें",
  "Reset": "रीसेट",
  "Refresh": "रिफ्रेश",
  "Settings": "सेटिंग्स",
  "Success": "सफल",
  "Error": "समस्या / एरर",
  "Warning": "चेतावनी",
  "Info": "जानकारी"
};

// Word replacements dictionary for casual conversational tone
const phraseReplacements = [
  [/Overview Dashboard/gi, "डैशबोर्ड"],
  [/Guest Name/gi, "गेस्ट का नाम"],
  [/Phone Number/gi, "फोन नंबर"],
  [/Check-in/gi, "चेक-इन"],
  [/Check-out/gi, "चेक-आउट"],
  [/Checkin/gi, "चेक-इन"],
  [/Checkout/gi, "चेक-आउट"],
  [/Room Tariff/gi, "कमरे का किराया"],
  [/Total Bill/gi, "कुल बिल"],
  [/Pending Balance/gi, "बाकी बैलेंस"],
  [/Advance Amount/gi, "एडवांस मिला (₹)"],
  [/Cash Drawer/gi, "कैश गल्ला"],
  [/Cash Collected/gi, "आज आया कैश"],
  [/Opening Balance/gi, "सुबह का कैश"],
  [/Closing Balance/gi, "शाम का कैश"],
  [/Staff Member/gi, "स्टाफ"],
  [/Salary/gi, "सैलरी"],
  [/Salary Advance/gi, "स्टाफ एडवांस"],
  [/Petty Cash/gi, "छोटा खर्च (दूध/सब्जी)"],
  [/Save Changes/gi, "बदलाव सेव करें"],
  [/Save/gi, "सेव करें"],
  [/Cancel/gi, "कैंसिल"],
  [/Delete/gi, "हटाएं (Delete)"],
  [/Edit/gi, "बदलें (Edit)"],
  [/Print Receipt/gi, "बिल प्रिंट करें"],
  [/Share via WhatsApp/gi, "WhatsApp पर भेजें"],
  [/Download PDF/gi, "PDF डाउनलोड करें"],
  [/Kitchen Order/gi, "किचन ऑर्डर"],
  [/Live Order/gi, "चालू ऑर्डर"],
  [/Service Request/gi, "गेस्ट की मांग"],
  [/Quick Actions/gi, "शॉर्टकट बटन"],
  [/Select Property/gi, "प्रॉपर्टी चुनें"],
  [/No data available/gi, "कोई डेटा नहीं है"],
  [/Search.../gi, "खोजें..."],
  [/Loading.../gi, "लोड हो रहा है..."],
  [/All time/gi, "शुरू से अब तक"],
  [/Today/gi, "आज"],
  [/Tomorrow/gi, "कल"],
  [/Yesterday/gi, "कल (बीता हुआ)"],
  [/Paid/gi, "चुका दिया (Paid)"],
  [/Due/gi, "बाकी (Due)"],
  [/Pending/gi, "बाकी (Pending)"]
];

function translateToEverydayHindi(key, enVal) {
  if (exactMap[enVal]) return exactMap[enVal];

  let res = enVal;
  for (const [pattern, repl] of phraseReplacements) {
    if (pattern.test(res)) {
      res = res.replace(pattern, repl);
    }
  }

  return res;
}

let out = `export const strings: Record<string, string> = {\n`;
for (const entry of enEntries) {
  const hiVal = translateToEverydayHindi(entry.key, entry.enVal);
  out += `  ${entry.key}: ${JSON.stringify(hiVal)},\n`;
}
out += `};\n`;

fs.writeFileSync(hiPath, out, 'utf8');
console.log(`Successfully written all ${enEntries.length} translated keys to hi.ts`);
