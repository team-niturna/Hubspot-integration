export const CONTACT_FIELDS = [
  { key: "fullName", label: "Full Name (auto split)", property: null, help: "Optional. Use when the CSV has one full-name column." },
  { key: "firstname", label: "First Name", property: "firstname", help: "HubSpot: firstname" },
  { key: "lastname", label: "Last Name", property: "lastname", help: "HubSpot: lastname" },
  { key: "email", label: "Email *", property: "email", help: "Required for contact update and associations." },
  { key: "phone", label: "Phone", property: "phone", help: "HubSpot: phone" },
  { key: "company", label: "Company Text", property: "company", help: "Text field on the contact object." },
  { key: "jobtitle", label: "Job Title", property: "jobtitle", help: "HubSpot: jobtitle" },
  { key: "website", label: "Website", property: "website", help: "HubSpot: website" },
  { key: "city", label: "City", property: "city", help: "HubSpot: city" },
  { key: "state", label: "State / Region", property: "state", help: "HubSpot: state" },
  { key: "country", label: "Country", property: "country", help: "HubSpot: country" },
  { key: "lifecyclestage", label: "Lifecycle Stage", property: "lifecyclestage", help: "Use HubSpot internal values." },
  { key: "hs_lead_status", label: "Lead Status", property: "hs_lead_status", help: "Use HubSpot internal values, e.g. NEW, OPEN." },
];

export const COMPANY_FIELDS = [
  { key: "name", label: "Company Name", property: "name", help: "Recommended. HubSpot: name" },
  { key: "domain", label: "Company Domain", property: "domain", help: "Best dedup key. Example: example.com" },
  { key: "phone", label: "Company Phone", property: "phone", help: "HubSpot: phone" },
  { key: "city", label: "Company City", property: "city", help: "HubSpot: city" },
  { key: "state", label: "Company State", property: "state", help: "HubSpot: state" },
  { key: "country", label: "Company Country", property: "country", help: "HubSpot: country" },
  { key: "industry", label: "Industry", property: "industry", help: "HubSpot: industry" },
  { key: "description", label: "Company Description", property: "description", help: "HubSpot: description" },
];

export const DEAL_FIELDS = [
  { key: "dealUniqueId", label: "Deal Unique ID", property: null, help: "Optional. Uses the setting below, default external_deal_id." },
  { key: "dealname", label: "Deal Name", property: "dealname", help: "Recommended. HubSpot: dealname" },
  { key: "amount", label: "Deal Amount", property: "amount", help: "Numbers only; currency symbols are cleaned." },
  { key: "pipeline", label: "Pipeline", property: "pipeline", help: "Use HubSpot internal pipeline value." },
  { key: "dealstage", label: "Deal Stage", property: "dealstage", help: "Use HubSpot internal stage value." },
  { key: "closedate", label: "Close Date", property: "closedate", help: "YYYY-MM-DD or MM/DD/YYYY accepted." },
  { key: "dealtype", label: "Deal Type", property: "dealtype", help: "Use HubSpot internal values if configured." },
  { key: "description", label: "Deal Description", property: "description", help: "HubSpot: description" },
];

const FIELD_SETS = {
  contact: CONTACT_FIELDS,
  company: COMPANY_FIELDS,
  deal: DEAL_FIELDS,
};

export function parseCsv(csvText) {
  if (typeof csvText !== "string") {
    throw new Error("CSV content must be text.");
  }

  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i += 1;
      row.push(value.trim());
      value = "";

      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);

  if (rows.length === 0) return { headers: [], records: [] };

  const headers = rows[0].map((header, index) => {
    const cleaned = String(header || "").replace(/^\uFEFF/, "").trim();
    return cleaned || `Column ${index + 1}`;
  });

  const records = rows.slice(1).map((cells, rowIndex) => {
    const record = { __rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });

  return { headers, records };
}

export function getPreview(records, limit = 5) {
  return records.slice(0, limit);
}

export function normalizeHeader(header) {
  return String(header || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findHeader(headers, candidates) {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const exact = normalizedHeaders.find(({ normalized }) => candidates.includes(normalized));
  if (exact) return exact.original;

  const partial = normalizedHeaders.find(({ normalized }) =>
    candidates.some((candidate) => normalized.includes(candidate) || (normalized.length >= 6 && candidate.includes(normalized)))
  );

  return partial?.original || "";
}

export function guessMapping(headers) {
  const contact = {};
  const company = {};
  const deal = {};

  const contactCandidates = {
    fullName: ["full name", "name", "customer name", "client name", "contact name", "person name"],
    firstname: ["first name", "firstname", "given name", "forename", "fname"],
    lastname: ["last name", "lastname", "surname", "family name", "lname"],
    email: ["email", "email address", "e mail", "mail", "contact email", "customer email", "client email"],
    phone: ["phone", "phone number", "mobile", "mobile number", "cell", "cell phone", "telephone", "contact number"],
    company: ["company", "company name", "organization", "organisation", "business", "account", "client company"],
    jobtitle: ["job title", "designation", "position", "role"],
    website: ["website", "web site", "url"],
    city: ["city", "town"],
    state: ["state", "province", "region"],
    country: ["country", "nation"],
    lifecyclestage: ["lifecycle stage", "life cycle stage", "customer lifecycle stage"],
    hs_lead_status: ["lead status", "status", "hs lead status"],
  };

  const companyCandidates = {
    name: ["company name", "company", "organization", "organisation", "business", "account name", "client company"],
    domain: ["domain", "company domain", "website", "company website", "web site", "url"],
    phone: ["company phone", "business phone", "office phone"],
    city: ["company city", "city"],
    state: ["company state", "company province", "state", "province", "region"],
    country: ["company country", "country"],
    industry: ["industry", "sector", "business type"],
    description: ["company description", "about company", "company notes"],
  };

  const dealCandidates = {
    dealUniqueId: ["deal id", "external deal id", "external id", "opportunity id", "crm deal id"],
    dealname: ["deal name", "deal title", "opportunity", "opportunity name", "project name", "service name"],
    amount: ["amount", "deal amount", "deal value", "value", "price", "budget", "revenue"],
    pipeline: ["pipeline", "deal pipeline"],
    dealstage: ["deal stage", "stage", "pipeline stage"],
    closedate: ["close date", "closing date", "expected close date", "closedate"],
    dealtype: ["deal type", "type"],
    description: ["deal description", "deal notes", "notes", "description"],
  };

  Object.entries(contactCandidates).forEach(([field, candidates]) => {
    const matched = findHeader(headers, candidates);
    if (matched) contact[field] = matched;
  });

  Object.entries(companyCandidates).forEach(([field, candidates]) => {
    const matched = findHeader(headers, candidates);
    if (matched) company[field] = matched;
  });

  Object.entries(dealCandidates).forEach(([field, candidates]) => {
    const matched = findHeader(headers, candidates);
    if (matched) deal[field] = matched;
  });

  return { contact, company, deal };
}

export function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstname: "", lastname: "" };
  if (parts.length === 1) return { firstname: parts[0], lastname: "" };
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];
}

export function cleanAmount(value) {
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  return cleaned || "";
}

export function normalizeCloseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d+$/.test(raw)) return raw;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T00:00:00.000Z`;
  }

  const mdY = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdY) {
    const [, month, day, year] = mdY;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return raw;
}

export function buildObjectProperties(row, objectType, objectMapping = {}, customMappings = [], settings = {}) {
  const properties = {};
  const fields = FIELD_SETS[objectType] || [];

  if (objectType === "contact" && objectMapping.fullName) {
    const { firstname, lastname } = splitFullName(row[objectMapping.fullName]);
    if (firstname) properties.firstname = firstname;
    if (lastname) properties.lastname = lastname;
  }

  fields.forEach((field) => {
    if (field.key === "fullName" || field.key === "dealUniqueId") return;
    const csvColumn = objectMapping[field.key];
    if (!csvColumn || !field.property) return;
    let value = String(row[csvColumn] ?? "").trim();
    if (!value) return;

    if (field.property === "email") value = normalizeEmail(value);
    if (objectType === "company" && field.property === "domain") value = normalizeDomain(value);
    if (objectType === "deal" && field.property === "amount") value = cleanAmount(value);
    if (objectType === "deal" && field.property === "closedate") value = normalizeCloseDate(value);

    if (value) properties[field.property] = value;
  });

  if (objectType === "deal" && objectMapping.dealUniqueId) {
    const propertyName = String(settings.dealUniqueProperty || "external_deal_id").trim();
    const value = String(row[objectMapping.dealUniqueId] ?? "").trim();
    if (propertyName && value) properties[propertyName] = value;
  }

  customMappings
    .filter((item) => item?.objectType === objectType)
    .forEach((item) => {
      const propertyName = String(item?.propertyName || "").trim();
      const csvColumn = item?.csvColumn;
      if (!propertyName || !csvColumn) return;
      const value = String(row[csvColumn] ?? "").trim();
      if (value) properties[propertyName] = value;
    });

  return properties;
}

export function prepareCrmRows(records, mapping, customMappings = [], selection = {}, settings = {}) {
  const rows = [];
  const skipped = [];

  records.forEach((row) => {
    const contact = buildObjectProperties(row, "contact", mapping.contact || {}, customMappings, settings);
    const company = buildObjectProperties(row, "company", mapping.company || {}, customMappings, settings);
    const deal = buildObjectProperties(row, "deal", mapping.deal || {}, customMappings, settings);

    const email = normalizeEmail(contact.email);

    if (selection.contact !== false && (!email || !isValidEmail(email))) {
      skipped.push({
        rowNumber: row.__rowNumber,
        reason: "Missing or invalid contact email",
        rawEmail: contact.email || "",
      });
      return;
    }

    if (email) contact.email = email;

    rows.push({
      rowNumber: row.__rowNumber,
      contact,
      company,
      deal,
      email,
    });
  });

  return { rows, skipped };
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
