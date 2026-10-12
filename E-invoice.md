# GST e-Invoice (IRN) – Credentials and Setup Guide

This guide covers the Inter Company Sell → Sales Invoice → **Print E-Invoice** feature. It has three parts:

- **Part A** is for the business owner (the client). It explains where to create the e-invoice credentials, first for testing and then for real use.
- **Part B** is for the developer. It explains what to do once the credentials arrive.

---

## How it works today

The app has three modes. You switch between them with one setting in `.env`.

| Mode | `EINVOICE_MODE` | What happens |
|---|---|---|
| **Mock** (current default) | `mock` (or not set) | IRN, Ack No and QR code are generated locally. No GSTIN, credentials or internet are needed. Every mock print says *"TEST e-INVOICE – MOCK IRN, NOT REGISTERED WITH GST"*. |
| **Sandbox** | `sandbox` | Uses the government's **test** portal. The IRN is real in shape but not legally valid. |
| **Live** | `live` | Uses the government's **production** portal. The IRN is real and legally valid. |

Code files involved:
- `lib/einvoice/payload.js`: builds the invoice JSON in the government (NIC) format, schema v1.1.
- `lib/einvoice/provider.js`: switches between mock, sandbox and live, and holds the code that talks to the government portal.
- `app/api/ic-item-invoice/[id]/einvoice/route.js`: the Generate IRN, Cancel IRN and preview API.

---

## Part A – For the client (business owner)

The credentials are tied to the company's **GSTIN**. The OTP goes to the **GSTIN's registered mobile and email**, so the client must do these steps themselves. Sitting with the developer on a call works best.

### Step 1 – Testing (sandbox) credentials. Do this first.

**Website:** https://einv-apisandbox.nic.in

1. Open the site and click **Sign Up / Register**.
2. Enter the company's **GSTIN**.
3. Enter the **OTP** sent to the GSTIN's registered mobile or email.
4. After registering, the portal shows a **Client ID** and **Client Secret**. Save them.
5. Create an **API Username** and **API Password** on the same portal.
6. Download the **sandbox public key** from the portal's API documentation or downloads section.

### Step 2 – Production (live) credentials, for real IRNs

**Website:** https://einvoice1.gst.gov.in

1. Log in with the company's **e-invoice or e-way bill** username and password.
   - If the company has no account yet, register on the same site with the GSTIN and an OTP.
2. Go to **API Registration → User Credentials → Create API User**.
3. Choose **"Through ERP"** (direct integration). This is what the app uses.
   - If only **"Through GSP"** is offered, the business does not qualify for direct API access, which depends on turnover. Tell the developer: a GSP account (such as ClearTax, Masters India or IRIS) will be needed, and a small code change goes with it.
4. Set the **API Username** and **API Password**.
5. The portal then shows the **Client ID**, **Client Secret**, the **production API URL** and the **public key** to download.

> Menu names on government portals change from time to time. If a step looks different, check the **"API Registration"** or **"Help → API documentation"** section of the same site.

### Step 3 – What the client sends to the developer

Send these separately for **sandbox** and for **live**:

- [ ] GSTIN
- [ ] Client ID
- [ ] Client Secret
- [ ] API Username
- [ ] API Password
- [ ] Public key file
- [ ] API base URL (live only; the sandbox URL is fixed)

> Share these privately, for example in a password manager or over a call. Do not post them in WhatsApp groups or email threads.

---

## Part B – For the developer

### 1. Put the credentials in `.env` (project root)

**Sandbox (testing):**
```env
EINVOICE_MODE=sandbox
EINVOICE_BASE_URL=https://einv-apisandbox.nic.in
EINVOICE_CLIENT_ID=<client id>
EINVOICE_CLIENT_SECRET=<client secret>
EINVOICE_USERNAME=<api username>
EINVOICE_PASSWORD=<api password>
EINVOICE_GSTIN=<client GSTIN>
EINVOICE_PUBLIC_KEY=<NIC public key>
```

**Live (production):** use the same keys with:
```env
EINVOICE_MODE=live
EINVOICE_BASE_URL=<production API URL from the portal>
```
and replace every credential with the **live** values.

Notes:
- `EINVOICE_PUBLIC_KEY` accepts either the full PEM text (`-----BEGIN PUBLIC KEY-----...`, with line breaks written as `\n` on one line) or just the base64 part.
- To go back to testing without credentials, set `EINVOICE_MODE=mock` or remove the line.
- **Restart the server** after any change to `.env`.

### 2. Before the first sandbox call, check `lib/einvoice/provider.js`

The government-portal code was written from NIC's API specification but has **not yet been run against the real server**. Compare these against the NIC developer documentation:

- **`PATHS`** at the top of the NIC section:
  - `auth: /eivital/v1.04/auth`
  - `generate: /eicore/v1.03/Invoice`
  - `cancel: /eicore/v1.03/Invoice/Cancel`

  Update the version numbers if the docs show newer ones.
- **The login encryption in `nicSession()`**: whether NIC wants the login JSON base64-encoded before RSA encryption. If the first login fails with a decryption or invalid-data error, check this line first.

**If the client uses a GSP instead of direct NIC access:** only the `nic` object in `provider.js` changes, to match that GSP's login and URLs. Everything else stays the same: the payload builder, the API route, the print page and the database fields.

### 3. Fill in the masters

The real portal rejects incomplete data. Fill these in from the Masters screens; no code change is needed.

- **GSTIN** (15 characters) on the sender and receiver **Business / Location**.
- **Address line 1**, **City** and a **6-digit PIN** on both.
- **HSN code** (4–8 digits) on the items.
- The sender and receiver must have **different GSTINs**. A transfer within one GSTIN is not an e-invoice.

The e-invoice page lists anything missing. In sandbox or live mode it will not generate until those are fixed. In mock mode it generates anyway and only warns.

### 4. Test end to end

1. Go to **Inter Company Sell → Sales Invoice → Billed**.
2. Click the green **Print E-Invoice** button on a **new** invoice.
3. The box above the invoice shows the mode and status. Click **Generate IRN**.
4. **If it works:** you get the IRN, Ack No, Ack Date and QR code on the printed invoice, and the "MOCK" warning no longer shows.
5. **If it fails:** the government's error message shows in the box, for example `2150: Duplicate IRN`.
6. **Show request JSON** shows the exact JSON sent to the portal, which is useful for debugging.

### 5. Things to know

- **Cancel IRN** is allowed only **within 24 hours** of generation, which is the government's rule. After that, raise a credit note instead. Cancelling removes only the IRN; the invoice and its billed items stay as they are.
- Invoices that already have a **mock IRN keep it**. Test sandbox and live on new invoices.
- e-Invoicing is mandatory only for **B2B invoices between different GSTINs**, and only when the seller's annual turnover is **over ₹5 crore**.
- The normal **Print** button is unchanged and never shows IRN details. Only **Print E-Invoice** does.

### 6. Security

- Never commit `.env` or any credential or public key file to git.
- Use separate credentials for sandbox and live. Never put live credentials on a test server.
