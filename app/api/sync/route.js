import { parseCsv, prepareCrmRows, normalizeDomain } from "@/lib/csv";

export const runtime = "nodejs";
export const maxDuration = 60;

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

function getHubSpotHeaders(hubspotToken, hasBody = true) {
  const token = String(hubspotToken || "").trim();

  if (!token) {
    throw new Error("HubSpot Private App token is required.");
  }

  const headers = { Authorization: `Bearer ${token}` };
  if (hasBody) headers["Content-Type"] = "application/json";
  return headers;
}

async function hubspotRequest(method, path, body = null, hubspotToken) {
  const hasBody = body !== null && body !== undefined;
  const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    method,
    headers: getHubSpotHeaders(hubspotToken, hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || `HubSpot request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function searchObjectByProperty(objectType, propertyName, value, properties = [], hubspotToken) {
  if (!propertyName || !value) return null;

  const data = await hubspotRequest("POST", `/crm/v3/objects/${objectType}/search`, {
    filterGroups: [
      {
        filters: [
          {
            propertyName,
            operator: "EQ",
            value: String(value),
          },
        ],
      },
    ],
    properties,
    limit: 1,
  }, hubspotToken);

  return data?.results?.[0] || null;
}

async function createObject(objectType, properties, hubspotToken) {
  return hubspotRequest("POST", `/crm/v3/objects/${objectType}`, { properties }, hubspotToken);
}

async function updateObject(objectType, id, properties, hubspotToken) {
  return hubspotRequest("PATCH", `/crm/v3/objects/${objectType}/${id}`, { properties }, hubspotToken);
}

function addSummaryError(summary, rowNumber, action, error) {
  summary.errors.push({
    rowNumber,
    action,
    status: error.status || 500,
    message: error.message,
    details: error.details || null,
  });
}

function hasAnyValue(properties) {
  return Object.values(properties || {}).some((value) => String(value ?? "").trim() !== "");
}

async function ensureContact(row, cache, summary, hubspotToken) {
  const email = row.email;
  if (!email) return null;

  if (cache.contacts.has(email)) return cache.contacts.get(email);

  try {
    const existing = await searchObjectByProperty("contacts", "email", email, ["email"], hubspotToken);

    if (existing?.id) {
      const updated = await updateObject("contacts", existing.id, row.contact, hubspotToken);
      const result = { id: updated?.id || existing.id, action: "updated" };
      cache.contacts.set(email, result);
      summary.contacts.updated += 1;
      return result;
    }

    const created = await createObject("contacts", row.contact, hubspotToken);
    const result = { id: created.id, action: "created" };
    cache.contacts.set(email, result);
    summary.contacts.created += 1;
    return result;
  } catch (error) {
    addSummaryError(summary.contacts, row.rowNumber, "contact create/update", error);
    return null;
  }
}

function companyCacheKey(company) {
  const domain = normalizeDomain(company.domain);
  if (domain) return `domain:${domain}`;
  const name = String(company.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return "";
}

async function ensureCompany(row, cache, summary, hubspotToken) {
  if (!hasAnyValue(row.company)) return null;

  const key = companyCacheKey(row.company);
  if (!key) {
    summary.companies.skipped += 1;
    summary.companies.skippedRows.push({ rowNumber: row.rowNumber, reason: "Company skipped: missing company name or domain." });
    return null;
  }

  if (cache.companies.has(key)) return cache.companies.get(key);

  try {
    let existing = null;

    if (row.company.domain) {
      existing = await searchObjectByProperty("companies", "domain", row.company.domain, ["name", "domain"], hubspotToken);
    }

    if (!existing?.id && row.company.name) {
      existing = await searchObjectByProperty("companies", "name", row.company.name, ["name", "domain"], hubspotToken);
    }

    if (existing?.id) {
      const updated = await updateObject("companies", existing.id, row.company, hubspotToken);
      const result = { id: updated?.id || existing.id, action: "updated" };
      cache.companies.set(key, result);
      summary.companies.updated += 1;
      return result;
    }

    const created = await createObject("companies", row.company, hubspotToken);
    const result = { id: created.id, action: "created" };
    cache.companies.set(key, result);
    summary.companies.created += 1;
    return result;
  } catch (error) {
    addSummaryError(summary.companies, row.rowNumber, "company create/update", error);
    return null;
  }
}

function buildDealProperties(row, settings) {
  const deal = { ...row.deal };

  if (!deal.pipeline && settings.defaultPipeline) deal.pipeline = String(settings.defaultPipeline).trim();
  if (!deal.dealstage && settings.defaultDealstage) deal.dealstage = String(settings.defaultDealstage).trim();

  return deal;
}

async function ensureDeal(row, cache, summary, settings, hubspotToken) {
  const dealProperties = buildDealProperties(row, settings);
  const uniqueProperty = String(settings.dealUniqueProperty || "external_deal_id").trim();
  const uniqueValue = uniqueProperty ? String(dealProperties[uniqueProperty] || "").trim() : "";

  if (!hasAnyValue(dealProperties)) return null;

  if (!dealProperties.dealname && !uniqueValue) {
    summary.deals.skipped += 1;
    summary.deals.skippedRows.push({ rowNumber: row.rowNumber, reason: "Deal skipped: missing deal name or unique deal ID." });
    return null;
  }

  const cacheKey = uniqueValue ? `${uniqueProperty}:${uniqueValue}` : `row:${row.rowNumber}`;
  if (cache.deals.has(cacheKey)) return cache.deals.get(cacheKey);

  try {
    let existing = null;

    if (uniqueProperty && uniqueValue) {
      existing = await searchObjectByProperty("deals", uniqueProperty, uniqueValue, ["dealname", uniqueProperty], hubspotToken);
    }

    if (existing?.id) {
      const updated = await updateObject("deals", existing.id, dealProperties, hubspotToken);
      const result = { id: updated?.id || existing.id, action: "updated" };
      cache.deals.set(cacheKey, result);
      summary.deals.updated += 1;
      return result;
    }

    const created = await createObject("deals", dealProperties, hubspotToken);
    const result = { id: created.id, action: "created" };
    cache.deals.set(cacheKey, result);
    summary.deals.created += 1;
    return result;
  } catch (error) {
    addSummaryError(summary.deals, row.rowNumber, "deal create/update", error);
    return null;
  }
}

async function associateObjects(fromType, fromId, toType, toId, associationType, hubspotToken) {
  return hubspotRequest(
    "PUT",
    `/crm/v3/objects/${fromType}/${fromId}/associations/${toType}/${toId}/${associationType}`,
    null,
    hubspotToken
  );
}

async function safelyAssociate(summary, rowNumber, key, fromType, fromId, toType, toId, associationType, hubspotToken) {
  if (!fromId || !toId) return;

  try {
    await associateObjects(fromType, fromId, toType, toId, associationType, hubspotToken);
    summary.associations[key] += 1;
  } catch (error) {
    summary.associations.errors.push({
      rowNumber,
      association: key,
      status: error.status || 500,
      message: error.message,
      details: error.details || null,
    });
  }
}

function createSummary() {
  return {
    contacts: { created: 0, updated: 0, skipped: 0, skippedRows: [], errors: [] },
    companies: { created: 0, updated: 0, skipped: 0, skippedRows: [], errors: [] },
    deals: { created: 0, updated: 0, skipped: 0, skippedRows: [], errors: [] },
    associations: { contactCompany: 0, contactDeal: 0, companyDeal: 0, errors: [] },
  };
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const mappingRaw = formData.get("mapping");
    const customMappingsRaw = formData.get("customMappings");
    const selectionRaw = formData.get("selection");
    const settingsRaw = formData.get("settings");
    const hubspotToken = String(formData.get("hubspotToken") || "").trim();

    if (!hubspotToken) {
      return Response.json({ success: false, error: "HubSpot Private App token is required." }, { status: 400 });
    }

    if (!file || typeof file.text !== "function") {
      return Response.json({ success: false, error: "CSV file is required." }, { status: 400 });
    }

    if (!mappingRaw) {
      return Response.json({ success: false, error: "Column mapping is required." }, { status: 400 });
    }

    const mapping = JSON.parse(String(mappingRaw));
    const customMappings = customMappingsRaw ? JSON.parse(String(customMappingsRaw)) : [];
    const selection = selectionRaw ? JSON.parse(String(selectionRaw)) : { contact: true, company: true, deal: true };
    const settings = settingsRaw ? JSON.parse(String(settingsRaw)) : {};

    if (selection.contact !== false && !mapping?.contact?.email) {
      return Response.json({ success: false, error: "Contact email column must be mapped before syncing." }, { status: 400 });
    }

    const csvText = await file.text();
    const { headers, records } = parseCsv(csvText);

    if (headers.length === 0 || records.length === 0) {
      return Response.json({ success: false, error: "CSV has no usable rows." }, { status: 400 });
    }

    const { rows, skipped } = prepareCrmRows(records, mapping, customMappings, selection, settings);

    if (rows.length === 0) {
      return Response.json({
        success: false,
        error: "No valid rows found. Check your email mapping and CSV rows.",
        totalCsvRows: records.length,
        skipped,
      }, { status: 400 });
    }

    const cache = {
      contacts: new Map(),
      companies: new Map(),
      deals: new Map(),
    };

    const summary = createSummary();
    const rowResults = [];

    for (const row of rows) {
      const rowResult = { rowNumber: row.rowNumber };

      let contactResult = null;
      let companyResult = null;
      let dealResult = null;

      if (selection.contact !== false) {
        contactResult = await ensureContact(row, cache, summary, hubspotToken);
        rowResult.contact = contactResult || "failed/skipped";
      }

      if (selection.company !== false) {
        companyResult = await ensureCompany(row, cache, summary, hubspotToken);
        rowResult.company = companyResult || "skipped";
      }

      if (selection.deal !== false) {
        dealResult = await ensureDeal(row, cache, summary, settings, hubspotToken);
        rowResult.deal = dealResult || "skipped";
      }

      if (selection.associations !== false) {
        await safelyAssociate(
          summary,
          row.rowNumber,
          "contactCompany",
          "contacts",
          contactResult?.id,
          "companies",
          companyResult?.id,
          "contact_to_company",
          hubspotToken
        );

        await safelyAssociate(
          summary,
          row.rowNumber,
          "contactDeal",
          "contacts",
          contactResult?.id,
          "deals",
          dealResult?.id,
          "contact_to_deal",
          hubspotToken
        );

        await safelyAssociate(
          summary,
          row.rowNumber,
          "companyDeal",
          "companies",
          companyResult?.id,
          "deals",
          dealResult?.id,
          "company_to_deal",
          hubspotToken
        );
      }

      rowResults.push(rowResult);
    }

    const errors = [
      ...summary.contacts.errors,
      ...summary.companies.errors,
      ...summary.deals.errors,
      ...summary.associations.errors,
    ];

    return Response.json({
      success: errors.length === 0,
      mode: "CSV dynamic mapping → HubSpot contacts + companies + deals + associations",
      selectedObjects: selection,
      totalCsvRows: records.length,
      validRowsProcessed: rows.length,
      skippedRows: skipped.length,
      skipped,
      contacts: summary.contacts,
      companies: summary.companies,
      deals: summary.deals,
      associations: summary.associations,
      rowResults,
      errors,
      notes: [
        "Contact dedup/update uses email.",
        "Company dedup/update uses domain first, then company name.",
        `Deal update uses ${settings.dealUniqueProperty || "external_deal_id"} only when a Deal Unique ID is mapped; otherwise new deals are created per row.`,
      ],
    }, { status: errors.length === 0 ? 200 : 207 });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      details: error.details || null,
    }, { status: error.status || 500 });
  }
}
