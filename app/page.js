"use client";

import { useMemo, useState } from "react";
import {
  parseCsv,
  guessMapping,
  getPreview,
  prepareCrmRows,
  buildObjectProperties,
  CONTACT_FIELDS,
  COMPANY_FIELDS,
  DEAL_FIELDS,
} from "@/lib/csv";

const OBJECT_LABELS = {
  contact: "Contacts",
  company: "Companies",
  deal: "Deals",
};

function downloadSampleCsv() {
  const rows = [
    "Customer Full Name,Email Address,Mobile No,Company Name,Company Domain,Industry,Deal ID,Deal Title,Deal Value,Pipeline,Stage,Close Date,Notes",
    "Rahim Uddin,rahim@example.com,+8801711111111,ABC Ltd,abc.com,Software,DEAL-001,Website Project,5000,default,appointmentscheduled,2026-07-10,First demo row",
    "Karim Ahmed,karim@example.com,+8801811111111,XYZ Ltd,xyz.com,Manufacturing,DEAL-002,CRM Setup,7500,default,appointmentscheduled,2026-07-20,Second demo row",
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sample-crm-leads.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function emptyNestedMapping() {
  return { contact: {}, company: {}, deal: {} };
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [records, setRecords] = useState([]);
  const [mapping, setMapping] = useState(emptyNestedMapping());
  const [customMappings, setCustomMappings] = useState([]);
  const [selection, setSelection] = useState({ contact: true, company: true, deal: true, associations: true });
  const [settings, setSettings] = useState({
    defaultPipeline: "",
    defaultDealstage: "",
    dealUniqueProperty: "external_deal_id",
  });
  const [hubspotToken, setHubspotToken] = useState("");
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const previewRows = useMemo(() => getPreview(records, 5), [records]);

  const prepared = useMemo(() => {
    if (!records.length) return { rows: [], skipped: [] };
    return prepareCrmRows(records, mapping, customMappings, selection, settings);
  }, [records, mapping, customMappings, selection, settings]);

  const mappedPreview = useMemo(() => {
    return previewRows.map((row) => ({
      rowNumber: row.__rowNumber,
      contact: buildObjectProperties(row, "contact", mapping.contact || {}, customMappings, settings),
      company: buildObjectProperties(row, "company", mapping.company || {}, customMappings, settings),
      deal: buildObjectProperties(row, "deal", mapping.deal || {}, customMappings, settings),
    }));
  }, [previewRows, mapping, customMappings, settings]);

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];
    setStatus(null);
    setFile(selectedFile || null);
    setHeaders([]);
    setRecords([]);
    setMapping(emptyNestedMapping());
    setCustomMappings([]);

    if (!selectedFile) return;

    try {
      const text = await selectedFile.text();
      const parsed = parseCsv(text);

      if (!parsed.headers.length) {
        throw new Error("No headers found in this CSV.");
      }

      const guessed = guessMapping(parsed.headers);
      setHeaders(parsed.headers);
      setRecords(parsed.records);
      setMapping(guessed);
      setStatus({ type: "success", message: `CSV loaded: ${parsed.headers.length} columns and ${parsed.records.length} data rows found.` });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  function updateMapping(objectType, field, csvColumn) {
    setMapping((current) => ({
      ...current,
      [objectType]: {
        ...(current[objectType] || {}),
        [field]: csvColumn,
      },
    }));
  }

  function updateSelection(key, value) {
    setSelection((current) => ({ ...current, [key]: value }));
  }

  function addCustomMapping() {
    setCustomMappings((items) => [...items, { objectType: "contact", propertyName: "", csvColumn: "" }]);
  }

  function updateCustomMapping(index, key, value) {
    setCustomMappings((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item))
    );
  }

  function removeCustomMapping(index) {
    setCustomMappings((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSync() {
    if (!file) {
      setStatus({ type: "error", message: "Please upload a CSV file first." });
      return;
    }

    if (selection.contact && !mapping?.contact?.email) {
      setStatus({ type: "error", message: "Contact email mapping is required before syncing." });
      return;
    }

    if (!hubspotToken.trim()) {
      setStatus({ type: "error", message: "HubSpot Private App token is required before syncing." });
      return;
    }

    setSyncing(true);
    setStatus({ type: "info", message: "Sync started. Please wait; HubSpot API calls may take a moment." });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("customMappings", JSON.stringify(customMappings));
      formData.append("selection", JSON.stringify(selection));
      formData.append("settings", JSON.stringify(settings));
      formData.append("hubspotToken", hubspotToken.trim());

      const response = await fetch("/api/sync", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok && response.status !== 207) {
        throw new Error(data?.error || "Sync failed.");
      }

      setStatus({
        type: data.success ? "success" : "warning",
        message: data.success ? "Sync completed successfully." : "Sync completed with some warnings/errors. Review the result report.",
        result: data,
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setSyncing(false);
    }
  }

  function renderMappingSection(objectType, title, fields, description) {
    if (!selection[objectType]) return null;

    return (
      <section className="card">
        <div className="sectionHeader">
          <div>
            <div className="eyebrow">Mapping</div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>

        <div className="mappingGrid">
          {fields.map((field) => (
            <div className="mapRow" key={`${objectType}-${field.key}`}>
              <label>
                <strong>{field.label}</strong>
                <small>{field.help}</small>
              </label>
              <select
                value={mapping?.[objectType]?.[field.key] || ""}
                onChange={(e) => updateMapping(objectType, field.key, e.target.value)}
              >
                <option value="">-- Ignore / not mapped --</option>
                {headers.map((header) => (
                  <option key={`${objectType}-${field.key}-${header}`} value={header}>{header}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <main className="shell">
      <section className="card hero">
        <div className="heroText">
          <div className="eyebrow">Vercel + HubSpot CRM</div>
          <h1>CSV to Contacts, Companies & Deals</h1>
          <p>
            Upload any CSV, map unknown headings, then create/update HubSpot contacts, companies and deals with associations.
          </p>
        </div>
        <button className="secondaryButton" onClick={downloadSampleCsv}>Download CRM sample CSV</button>
      </section>

      <section className="grid">
        <div className="card stepCard">
          <div className="stepNumber">1</div>
          <div className="eyebrow">Step 1</div>
          <h2>Upload CSV</h2>
          <p>The CSV can have any headings and many columns. The app reads the first row as headers.</p>
          <input className="fileInput" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        </div>

        <div className="card stepCard">
          <div className="stepNumber">2</div>
          <div className="eyebrow">Step 2</div>
          <h2>Select CRM Objects</h2>
          <p>Choose what this CSV should sync.</p>
          <div className="checkGrid">
            {Object.entries(OBJECT_LABELS).map(([key, label]) => (
              <label className="checkRow" key={key}>
                <input type="checkbox" checked={selection[key]} onChange={(e) => updateSelection(key, e.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
            <label className="checkRow">
              <input type="checkbox" checked={selection.associations} onChange={(e) => updateSelection("associations", e.target.checked)} />
              <span>Associations</span>
            </label>
          </div>
        </div>
      </section>

      {status && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}

      {headers.length > 0 && (
        <>
          <section className="card">
            <div className="sectionHeader">
              <div>
                <div className="eyebrow">CSV Summary</div>
                <h2>Detected Columns</h2>
                <p>{file?.name} loaded. Review the stats before mapping.</p>
              </div>
            </div>
            <div className="stats">
              <div><strong>{headers.length}</strong><span>Columns detected</span></div>
              <div><strong>{records.length}</strong><span>CSV data rows</span></div>
              <div><strong>{prepared.rows.length}</strong><span>Valid rows</span></div>
              <div><strong>{prepared.skipped.length}</strong><span>Skipped rows</span></div>
            </div>
            <div className="pillWrap">
              {headers.map((header) => <span className="pill" key={header}>{header}</span>)}
            </div>
          </section>

          {renderMappingSection(
            "contact",
            "Contact Fields",
            CONTACT_FIELDS,
            "Email is required for contact create/update and for connecting contacts with companies/deals."
          )}

          {renderMappingSection(
            "company",
            "Company Fields",
            COMPANY_FIELDS,
            "Company deduplication uses domain first, then company name."
          )}

          {selection.deal && (
            <section className="card">
              <div className="sectionHeader">
                <div>
                  <div className="eyebrow">Deal Settings</div>
                  <h2>Deal Defaults & Unique ID</h2>
                  <p>
                    Deal stage and pipeline must be HubSpot internal values. If they are not in the CSV, set defaults here.
                  </p>
                </div>
              </div>

              <div className="settingsGrid">
                <label>
                  <strong>Default Pipeline</strong>
                  <input
                    value={settings.defaultPipeline}
                    placeholder="Example: default"
                    onChange={(e) => setSettings((current) => ({ ...current, defaultPipeline: e.target.value }))}
                  />
                </label>
                <label>
                  <strong>Default Deal Stage</strong>
                  <input
                    value={settings.defaultDealstage}
                    placeholder="Example: appointmentscheduled"
                    onChange={(e) => setSettings((current) => ({ ...current, defaultDealstage: e.target.value }))}
                  />
                </label>
                <label>
                  <strong>Deal Unique Property</strong>
                  <input
                    value={settings.dealUniqueProperty}
                    placeholder="external_deal_id"
                    onChange={(e) => setSettings((current) => ({ ...current, dealUniqueProperty: e.target.value }))}
                  />
                  <small>Only needed if you map Deal Unique ID. This custom property should exist in HubSpot.</small>
                </label>
              </div>
            </section>
          )}

          {renderMappingSection(
            "deal",
            "Deal Fields",
            DEAL_FIELDS,
            "If Deal Unique ID is mapped, existing deals are updated; otherwise a new deal is created per valid row."
          )}

          <section className="card">
            <div className="sectionHeader">
              <div>
                <div className="eyebrow">Optional</div>
                <h2>Custom HubSpot Properties</h2>
                <p>Add internal HubSpot property names if your CRM has extra fields.</p>
              </div>
              <button className="secondaryButton" onClick={addCustomMapping}>+ Add custom mapping</button>
            </div>

            {customMappings.length === 0 && <p className="muted">No custom mappings added.</p>}

            {customMappings.map((item, index) => (
              <div className="customRow" key={`custom-${index}`}>
                <select value={item.objectType} onChange={(e) => updateCustomMapping(index, "objectType", e.target.value)}>
                  <option value="contact">Contact</option>
                  <option value="company">Company</option>
                  <option value="deal">Deal</option>
                </select>
                <input
                  placeholder="HubSpot internal property name"
                  value={item.propertyName}
                  onChange={(e) => updateCustomMapping(index, "propertyName", e.target.value)}
                />
                <select value={item.csvColumn} onChange={(e) => updateCustomMapping(index, "csvColumn", e.target.value)}>
                  <option value="">-- CSV column --</option>
                  {headers.map((header) => <option key={`custom-${index}-${header}`} value={header}>{header}</option>)}
                </select>
                <button className="dangerButton" onClick={() => removeCustomMapping(index)}>Remove</button>
              </div>
            ))}
          </section>

          <section className="card">
            <div className="sectionHeader">
              <div>
                <div className="eyebrow">Step 3</div>
                <h2>Preview Mapped Output</h2>
                <p>Only mapped fields will be sent to HubSpot. First 5 rows are shown.</p>
              </div>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Contact</th>
                    <th>Company</th>
                    <th>Deal</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedPreview.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td><code>{JSON.stringify(row.contact, null, 2)}</code></td>
                      <td><code>{JSON.stringify(row.company, null, 2)}</code></td>
                      <td><code>{JSON.stringify(row.deal, null, 2)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {prepared.skipped.length > 0 && (
              <div className="skippedBox">
                <strong>Rows that will be skipped:</strong>
                <pre>{JSON.stringify(prepared.skipped, null, 2)}</pre>
              </div>
            )}
          </section>

          <section className="card syncCard">
            <div>
              <div className="eyebrow">Step 4</div>
              <h2>Sync to HubSpot</h2>
              <p>
                Contacts are checked by email. Companies are checked by domain/name. Deals use Deal Unique ID if mapped.
              </p>
              <input
                className="adminInput"
                type="password"
                autoComplete="off"
                placeholder="Paste HubSpot Private App token here (required)"
                value={hubspotToken}
                onChange={(e) => setHubspotToken(e.target.value)}
              />
              <small className="helperText">
                <div>
                  <i>Token is sent only with this sync request and is not stored in the app.</i>
                </div>
              </small>
            </div>
            <button className="primaryButton" disabled={syncing || !prepared.rows.length || !hubspotToken.trim() || (selection.contact && !mapping?.contact?.email)} onClick={handleSync}>
              {syncing ? "Syncing..." : "Sync valid CRM rows to HubSpot"}
            </button>
          </section>

          {status?.result && (
            <section className="card">
              <h2>Result Report</h2>
              <pre className="resultBox">{JSON.stringify(status.result, null, 2)}</pre>
            </section>
          )}
        </>
      )}
    </main>
  );
}
