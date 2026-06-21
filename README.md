# HubSpot CSV CRM Sync — Vercel Ready

This is a full Next.js app for **dynamic CSV column mapping** and **HubSpot CRM sync**.

It supports:

```txt
CSV → Contacts + Companies + Deals + Associations
```

It solves this real problem:

> The uploaded CSV may have unknown headings and may contain 10, 50, or more columns.

The app reads the CSV headings, lets the user map those columns to HubSpot contact/company/deal properties, previews the mapped output, then creates or updates CRM records in HubSpot.

---

## Features

### CSV / Mapping

- Upload any `.csv` file
- Detect all CSV headings automatically
- Auto-guess common mappings
- Manual dropdown mapping for every object type
- Preview first 5 mapped rows before sync
- Optional custom HubSpot internal property mapping

### Contacts

- Create new contacts
- Update existing contacts by email
- Full-name splitting into first name and last name
- Email validation
- Contacts without valid email are skipped

### Companies

- Create new companies
- Update existing companies by domain first, then company name
- Company fields include name, domain, phone, city, country, industry, description

### Deals

- Create new deals
- Update existing deals only when `Deal Unique ID` is mapped
- Default deal pipeline and deal stage inputs
- Amount cleanup: `$5,000` → `5000`
- Close date cleanup: `2026-07-10` → ISO format

### Associations

- Associate Contact ↔ Company
- Associate Contact ↔ Deal
- Associate Company ↔ Deal

### Security / Deployment

- HubSpot Private App token is entered manually before each sync
- Token is sent only with the current sync request and is not stored in the app
- `ADMIN_SYNC_KEY` has been removed
- Vercel-ready deployment

---

## Project Structure

```txt
hubspot-csv-vercel/
├── app/
│   ├── api/
│   │   ├── health/route.js
│   │   └── sync/route.js
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── lib/
│   └── csv.js
├── public/
│   └── sample-leads.csv
├── .env.example
├── package.json
└── README.md
```

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment file

No `.env.local` file is required in this version.

The HubSpot Private App token is entered manually in the browser before clicking **Sync**.

### 3. Run locally

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

---

## HubSpot Private App Scopes

Your HubSpot Private App token should have these scopes:

```txt
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.companies.read
crm.objects.companies.write
crm.objects.deals.read
crm.objects.deals.write
```

If your HubSpot screen has association-related permissions, enable CRM association permissions too.

---

## CSV Format

The CSV does not need fixed headings.

Example:

```csv
Customer Full Name,Email Address,Mobile No,Company Name,Company Domain,Industry,Deal ID,Deal Title,Deal Value,Pipeline,Stage,Close Date
Rahim Uddin,rahim@example.com,+8801711111111,ABC Ltd,abc.com,Software,DEAL-001,Website Project,5000,default,appointmentscheduled,2026-07-10
```

The user maps it like this:

```txt
Contact Full Name  -> Customer Full Name
Contact Email      -> Email Address
Contact Phone      -> Mobile No
Company Name       -> Company Name
Company Domain     -> Company Domain
Company Industry   -> Industry
Deal Unique ID     -> Deal ID
Deal Name          -> Deal Title
Deal Amount        -> Deal Value
Deal Pipeline      -> Pipeline
Deal Stage         -> Stage
Deal Close Date    -> Close Date
```

---

## Important Deal Note

To update existing deals safely, HubSpot needs a unique deal property.

This app uses this default property name:

```txt
external_deal_id
```

You should create this custom property in HubSpot if you want repeat uploads to update the same deal instead of creating new duplicate deals.

If you do not map `Deal Unique ID`, the app creates a new deal per valid CSV row.

---

## Deal Pipeline / Stage

HubSpot API normally needs internal values, not UI labels.

Examples often look like:

```txt
pipeline = default
dealstage = appointmentscheduled
```

Your account may use different internal IDs. Check HubSpot Settings → Objects → Deals → Pipelines.

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "hubspot csv crm sync app"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Import on Vercel

1. Go to Vercel Dashboard
2. Click **New Project**
3. Import your GitHub repository
4. No HubSpot environment variable is required.
5. Click **Deploy**
6. Open the live URL and paste your HubSpot Private App token in the token input before syncing.

---

## How the Sync Works

```txt
CSV Upload
  ↓
Browser detects headings and previews rows
  ↓
User maps CSV columns to HubSpot Contact / Company / Deal properties
  ↓
User enters HubSpot Private App token manually
  ↓
/api/sync receives CSV + mapping + token for this request only
  ↓
Server validates and cleans rows
  ↓
Contact checked by email
Company checked by domain/name
Deal checked by external_deal_id if mapped
  ↓
Records are created or updated
  ↓
Associations are created
  ↓
Result report is shown
```

---

## API Endpoints

### Health check

```txt
GET /api/health
```

### Sync CSV to HubSpot

```txt
POST /api/sync
```

Body: `multipart/form-data`

Fields:

```txt
file = CSV file
mapping = JSON object
customMappings = JSON array
selection = JSON object
settings = JSON object
hubspotToken = HubSpot Private App token for this request
```

---

## Limitations

- This is ideal for portfolio demos and small/medium CSV sync.
- For very large CSV files, use Render/Railway/background workers instead of Vercel serverless functions.
- Deals may duplicate unless a unique deal property such as `external_deal_id` is created and mapped.
- HubSpot dropdowns usually require internal values, not display labels.
