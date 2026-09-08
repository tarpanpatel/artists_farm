/**
 * GroundCode Client-Side OCR Scanner (Tesseract.js WebAssembly)
 *
 * Runs 100% in the browser via Web Workers:
 * 1. Zero third-party API costs / zero recurring cloud vision charges.
 * 2. Complete data privacy (guest ID photos & financial screenshots never leave device).
 * 3. Lazy-loaded on demand so initial app bundle remains lightweight.
 *
 * Scoped strictly to 3 core operational workflows:
 * - UPI Payment Screenshot Verification (12-digit UTR + amount)
 * - Market Grocery & Cash Expense Slips (Receipt Total + Date + Shop)
 * - Foreign Guest C-Form in 3 Seconds (Passport MRZ TD3 Reader)
 */

export interface OcrProgressCallback {
  (progress: number, statusMessage: string): void;
}

export interface UpiScanResult {
  rawText: string;
  utr: string | null;
  amount: number | null;
  date: string | null;
  status: 'success' | 'failed' | 'unknown';
  appHint: 'GPay' | 'PhonePe' | 'Paytm' | 'BHIM' | 'CRED' | 'Other';
}

export interface ReceiptScanResult {
  rawText: string;
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  vendor: string | null;
}

export interface PassportMrzResult {
  rawText: string;
  passportNumber: string | null;
  nationality: string | null;
  countryCode: string | null;
  fullName: string | null;
  dob: string | null; // YYYY-MM-DD
  expiryDate: string | null; // YYYY-MM-DD
  gender: 'Male' | 'Female' | 'Other' | null;
  isMrzDetected: boolean;
}

// ISO 3166-1 alpha-3 common nationality mapping for Form-C filing
const COUNTRY_CODES: Record<string, string> = {
  USA: 'United States',
  GBR: 'United Kingdom',
  FRA: 'France',
  DEU: 'Germany',
  CAN: 'Canada',
  AUS: 'Australia',
  RUS: 'Russia',
  ISR: 'Israel',
  ESP: 'Spain',
  ITA: 'Italy',
  NLD: 'Netherlands',
  JPN: 'Japan',
  KOR: 'South Korea',
  CHN: 'China',
  IND: 'India',
  BGD: 'Bangladesh',
  NPL: 'Nepal',
  LKA: 'Sri Lanka',
  ARE: 'United Arab Emirates',
  SGP: 'Singapore',
  MYS: 'Malaysia',
  THA: 'Thailand',
  ZAF: 'South Africa',
  BRA: 'Brazil',
  MEX: 'Mexico',
  NZL: 'New Zealand',
  SWE: 'Sweden',
  CHE: 'Switzerland',
  AUT: 'Austria',
  BEL: 'Belgium',
  DNK: 'Denmark',
  NOR: 'Norway',
  FIN: 'Finland',
  IRL: 'Ireland',
  POL: 'Poland',
  PRT: 'Portugal',
};

/**
 * Executes OCR on an image source (File, Blob, or URL) using lazy-loaded Tesseract.js.
 */
export async function performClientOcr(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<string> {
  onProgress?.(5, 'Initializing OCR engine...');

  // Dynamically import tesseract.js so it is completely code-split from main bundle
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('eng', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 85) + 10;
        onProgress?.(pct, `Scanning image (${pct}%)...`);
      } else if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
        onProgress?.(10, 'Loading OCR models...');
      }
    },
  });

  try {
    let source = imageSource;
    // If Blob/File, URL.createObjectURL or pass directly
    if (imageSource instanceof File || imageSource instanceof Blob) {
      source = URL.createObjectURL(imageSource);
    }

    onProgress?.(25, 'Analyzing image content...');
    const result = await worker.recognize(source);
    onProgress?.(100, 'Scan complete.');

    if (typeof source === 'string' && source.startsWith('blob:')) {
      URL.revokeObjectURL(source);
    }

    return result.data?.text || '';
  } finally {
    await worker.terminate();
  }
}

/**
 * 1. UPI Payment Screenshot Parser
 * Extracts 12-digit UTR / Ref No, Amount (₹), and Payment Status.
 */
export async function scanUpiScreenshot(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<UpiScanResult> {
  const text = await performClientOcr(imageSource, onProgress);
  const cleanText = text.replace(/\r\n/g, '\n');

  // Detect App Hint
  let appHint: UpiScanResult['appHint'] = 'Other';
  const lower = cleanText.toLowerCase();
  if (lower.includes('google pay') || lower.includes('gpay')) appHint = 'GPay';
  else if (lower.includes('phonepe') || lower.includes('ybl') || lower.includes('ibl')) appHint = 'PhonePe';
  else if (lower.includes('paytm') || lower.includes('paytm payments')) appHint = 'Paytm';
  else if (lower.includes('bhim')) appHint = 'BHIM';
  else if (lower.includes('cred')) appHint = 'CRED';

  // Detect Status
  let status: UpiScanResult['status'] = 'unknown';
  if (/paid\s*successfully|payment\s*successful|completed|successful|transferred\s*successfully/i.test(cleanText)) {
    status = 'success';
  } else if (/failed|declined|unsuccessful/i.test(cleanText)) {
    status = 'failed';
  }

  // 12-digit UPI UTR / Ref No.
  // UPI UTRs are universally 12 numeric digits in India (e.g. 425189201948)
  let utr: string | null = null;
  // Look for explicit labels first: "UPI Ref No: 4251...", "UTR: 4251...", "Txn ID: 4251..."
  const labeledUtrMatch = cleanText.match(
    /(?:UTR|Ref(?:\s*No\.?|\s*Number)?|UPI\s*(?:Ref|Transaction\s*ID)|Txn\s*ID|Transaction\s*ID|Google\s*Transaction\s*ID)[:\s#]*([0-9]{12})\b/i
  );
  if (labeledUtrMatch && labeledUtrMatch[1]) {
    utr = labeledUtrMatch[1];
  } else {
    // Fallback: search for any standalone 12-digit sequence
    const standalone12Match = cleanText.match(/\b([0-9]{12})\b/);
    if (standalone12Match) {
      utr = standalone12Match[1];
    }
  }

  // Amount Extraction
  // Patterns like "₹1,500", "₹ 1500.00", "Rs. 1,500", "INR 1500", or large numbers near "Paid"
  let amount: number | null = null;
  const amountPatterns = [
    /[₹₹]\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /INR\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Paid|Sent|Amount|Total)[:\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  // Date extraction
  let date: string | null = null;
  const dateMatch = cleanText.match(/\b([0-3]?[0-9]\s+[A-Za-z]{3,9}\s+20[2-9][0-9])\b/) ||
    cleanText.match(/\b([0-3]?[0-9][./-][0-1]?[0-9][./-]20[2-9][0-9])\b/);
  if (dateMatch) {
    date = dateMatch[1];
  }

  return {
    rawText: cleanText,
    utr,
    amount,
    date,
    status,
    appHint,
  };
}

/**
 * 2. Market Grocery & Cash Expense Slips Parser
 * Extracts Total Cash Amount (₹), Date (YYYY-MM-DD), and Vendor / Store Name.
 */
export async function scanPettyCashReceipt(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<ReceiptScanResult> {
  const text = await performClientOcr(imageSource, onProgress);
  const cleanText = text.replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

  // Vendor Name: First non-empty prominent line that is not a date or tax header
  let vendor: string | null = null;
  for (const line of lines.slice(0, 5)) {
    if (
      line.length >= 3 &&
      !/tax|invoice|bill|receipt|date|gst|cash|memo|phone|tel/i.test(line) &&
      !/^[0-9\s:./-]+$/.test(line)
    ) {
      vendor = line.slice(0, 40);
      break;
    }
  }

  // Amount extraction
  let amount: number | null = null;
  const totalKeywords = [
    /(?:Grand\s*Total|Net\s*Total|Total\s*Amount|Total|Net\s*Payable|Amount|Final)[:\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Cash|Paid)[:\s]*₹?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /[₹₹]\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  for (const regex of totalKeywords) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  // Date extraction and format to YYYY-MM-DD
  let date: string | null = null;
  const dateMatch = cleanText.match(/\b([0-3]?[0-9])[./-]([0-1]?[0-9])[./-](20[2-9][0-9]|[2-9][0-9])\b/);
  if (dateMatch) {
    const d = dateMatch[1].padStart(2, '0');
    const m = dateMatch[2].padStart(2, '0');
    let y = dateMatch[3];
    if (y.length === 2) y = `20${y}`;
    date = `${y}-${m}-${d}`;
  }

  return {
    rawText: cleanText,
    amount,
    date,
    vendor,
  };
}

/**
 * 3. Foreign Guest Passport MRZ Reader (ICAO 9303 TD3)
 * Extracts Passport Number, Nationality Country Code, Full Name, DOB, Expiry Date, Sex.
 */
export async function scanPassportMrz(
  imageSource: File | Blob | string,
  onProgress?: OcrProgressCallback
): Promise<PassportMrzResult> {
  const text = await performClientOcr(imageSource, onProgress);
  const cleanText = text.replace(/\r\n/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.replace(/\s+/g, '').toUpperCase());

  let line1: string | null = null;
  let line2: string | null = null;

  // Search for the 2 MRZ lines (each standard TD3 line is 44 characters)
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    // Line 1 starts with 'P<' or 'P' and contains many '<' characters
    if ((cur.startsWith('P<') || cur.startsWith('P')) && cur.includes('<<') && cur.length >= 35) {
      line1 = cur;
      if (i + 1 < lines.length && lines[i + 1].length >= 35) {
        line2 = lines[i + 1];
      }
      break;
    }
  }

  let passportNumber: string | null = null;
  let nationality: string | null = null;
  let countryCode: string | null = null;
  let fullName: string | null = null;
  let dob: string | null = null;
  let expiryDate: string | null = null;
  let gender: PassportMrzResult['gender'] = null;
  let isMrzDetected = false;

  if (line1 && line2) {
    isMrzDetected = true;

    // Line 1 format: P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
    // Chars 2-5: Issuing Country Code
    const issuingCountry = line1.substring(2, 5).replace(/</g, '');
    countryCode = issuingCountry;

    // Name parsing from Line 1
    const namePart = line1.substring(5);
    const [lastNameRaw, firstNamesRaw] = namePart.split('<<');
    if (lastNameRaw) {
      const lastName = lastNameRaw.replace(/</g, ' ').trim();
      const firstNames = (firstNamesRaw || '').replace(/</g, ' ').trim();
      fullName = firstNames ? `${firstNames} ${lastName}`.trim() : lastName;
    }

    // Line 2 format: L898902C36UTO7408122F1204159ZE184226B<<<<<10
    // Chars 0-9: Passport Document Number
    passportNumber = line2.substring(0, 9).replace(/</g, '').trim();

    // Chars 10-13: Nationality Code
    const natCode = line2.substring(10, 13).replace(/</g, '').trim();
    if (natCode) {
      countryCode = natCode;
      nationality = COUNTRY_CODES[natCode] || natCode;
    }

    // Chars 13-19: Date of Birth YYMMDD
    const dobRaw = line2.substring(13, 19);
    if (/^[0-9]{6}$/.test(dobRaw)) {
      const yy = parseInt(dobRaw.substring(0, 2), 10);
      const mm = dobRaw.substring(2, 4);
      const dd = dobRaw.substring(4, 6);
      // If YY > current 2-digit year + 5, assume 1900s; else 2000s
      const currentYY = new Date().getFullYear() % 100;
      const fullYear = yy > currentYY ? `19${yy.toString().padStart(2, '0')}` : `20${yy.toString().padStart(2, '0')}`;
      dob = `${fullYear}-${mm}-${dd}`;
    }

    // Char 20: Sex (M/F/<)
    const sexChar = line2.charAt(20);
    if (sexChar === 'M') gender = 'Male';
    else if (sexChar === 'F') gender = 'Female';
    else if (sexChar === 'X' || sexChar === '<') gender = 'Other';

    // Chars 21-27: Expiry Date YYMMDD
    const expRaw = line2.substring(21, 27);
    if (/^[0-9]{6}$/.test(expRaw)) {
      const yy = expRaw.substring(0, 2);
      const mm = expRaw.substring(2, 4);
      const dd = expRaw.substring(4, 6);
      expiryDate = `20${yy}-${mm}-${dd}`;
    }
  } else {
    // Fallback if MRZ characters were partially skewed or phone took top-half crop
    const passMatch = cleanText.match(/(?:Passport\s*(?:No\.?|Number)?|Doc\s*No\.?)[:\s]*([A-Z0-9]{7,9})\b/i) ||
      cleanText.match(/\b([A-Z][0-9]{7,8})\b/);
    if (passMatch) passportNumber = passMatch[1];

    const natMatch = cleanText.match(/Nationality[:\s]*([A-Za-z\s]+)/i);
    if (natMatch) nationality = natMatch[1].trim();

    const nameMatch = cleanText.match(/(?:Given\s*Name|Name|Full\s*Name)[:\s]*([A-Za-z\s]+)/i);
    if (nameMatch) fullName = nameMatch[1].trim();
  }

  if (countryCode && !nationality) {
    nationality = COUNTRY_CODES[countryCode] || countryCode;
  }

  return {
    rawText: cleanText,
    passportNumber,
    nationality,
    countryCode,
    fullName,
    dob,
    expiryDate,
    gender,
    isMrzDetected,
  };
}
