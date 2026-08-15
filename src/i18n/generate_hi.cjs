import fs from 'fs';
import path from 'path';

const enPath = 'c:/xampp/htdocs/artists_farm/src/i18n/en.ts';
const hiPath = 'c:/xampp/htdocs/artists_farm/src/i18n/hi.ts';

const enContent = fs.readFileSync(enPath, 'utf8');

// Parse keys and values from en.ts
const regex = /^\s*([a-zA-Z0-9_]+)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,?/gm;
const enEntries = [];
let match;
while ((match = regex.exec(enContent)) !== null) {
  const key = match[1];
  let val = match[2];
  // remove surrounding quotes
  val = val.substring(1, val.length - 1);
  enEntries.push({ key, enVal: val });
}

console.log(`Found ${enEntries.length} keys in en.ts`);

// Common vocabulary dictionary for natural everyday Hindi
const dict = {
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
  "Due": "बाकी",
  "Room": "कमरा",
  "Total": "कुल"
};

// Helper to translate strings naturally
function translateString(key, en) {
  if (dict[en]) return dict[en];
  
  // Specific patterns
  if (en === 'Actions') return 'ऑप्शंस';
  if (en === 'Save') return 'सेव करें';
  if (en === 'Cancel') return 'कैंसिल';
  if (en === 'Yes') return 'हाँ';
  if (en === 'No') return 'नहीं';
  if (en === 'Edit') return 'बदलें (Edit)';
  if (en === 'Delete') return 'हटाएं (Delete)';
  if (en === 'Add') return 'जोड़ें';
  if (en === 'Back') return 'पीछे जाएं';
  if (en === 'Next') return 'आगे बढ़ें';
  if (en === 'Submit') return 'सबमिट करें';
  if (en === 'View') return 'देखें';
  if (en === 'Download') return 'डाउनलोड';
  if (en === 'Export') return 'एक्सपोर्ट करें';
  if (en === 'Import') return 'इम्पॉर्ट करें';
  if (en === 'Active') return 'चालू (Active)';
  if (en === 'Inactive') return 'बंद (Inactive)';
  if (en === 'Search') return 'सर्च करें';
  if (en === 'Filter') return 'फिल्टर';
  if (en === 'Clear') return 'साफ करें';
  if (en === 'Reset') return 'रीसेट';
  if (en === 'Refresh') return 'रिफ्रेश';
  if (en === 'Settings') return 'सेटिंग्स';
  if (en === 'Success') return 'सफल';
  if (en === 'Error') return 'त्रुटि / समस्या';
  if (en === 'Warning') return 'चेतावनी';
  if (en === 'Info') return 'जानकारी';

  return en; // Keep natural Hinglish or fallback
}

// Generate the hi.ts content
let out = `export const strings: Record<string, string> = {\n`;
for (const entry of enEntries) {
  const hiVal = translateString(entry.key, entry.enVal);
  // escape double quotes
  const escaped = hiVal.replace(/"/g, '\\"');
  out += `  ${entry.key}: "${escaped}",\n`;
}
out += `};\n`;

fs.writeFileSync(hiPath, out, 'utf8');
console.log('hi.ts generated successfully with ' + enEntries.length + ' entries.');
