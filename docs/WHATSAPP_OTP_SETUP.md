# WhatsApp OTP Authentication Setup Guide

Complete guide to set up WhatsApp OTP login for storefront customers using Meta WhatsApp Cloud API.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Meta WhatsApp Cloud API Setup](#meta-whatsapp-cloud-api-setup)
3. [Create Authentication Template](#create-authentication-template)
4. [Environment Configuration](#environment-configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)
7. [Security Best Practices](#security-best-practices)

---

## Prerequisites

- Meta Business Account
- WhatsApp Business Account
- Phone number for WhatsApp Business (verified)
- Server with HTTPS (required by Meta for webhooks)
- MongoDB database

---

## Meta WhatsApp Cloud API Setup

### 1. Create Meta Business App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **"Create App"**
3. Select **"Business"** as app type
4. Fill in app details:
   - **App Name**: Your Business Name OTP
   - **App Purpose**: Business
   - **Company**: Your Business

### 2. Add WhatsApp Product

1. In your app dashboard, click **"Add Product"**
2. Find **"WhatsApp"** and click **"Set up"**
3. Go to **WhatsApp → API Setup**

### 3. Get Credentials

You'll need these three values for your `.env` file:

#### A. Phone Number ID
- In WhatsApp → API Setup
- Under **"Send and receive messages"**
- Copy the **Phone Number ID** (looks like: `123456789012345`)

#### B. Temporary Access Token (for testing)
- In the same section, find **"Temporary access token"**
- Click **"Copy"** (valid for 24 hours)
- Use this for initial setup and testing

#### C. Permanent Access Token (for production)
1. Go to **"System Users"** in Business Settings
2. Create a System User:
   - Role: **Admin**
   - Name: `WhatsApp OTP Service`
3. Click **"Generate New Token"**
4. Select your WhatsApp app
5. Permissions needed:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Copy and securely store this token (shown only once!)

---

## Create Authentication Template

WhatsApp requires Meta-approved templates to initiate conversations with customers.

### 1. Navigate to Message Templates

1. In Meta Business Manager: https://business.facebook.com/
2. Go to **Account tools → Message templates**
3. Or directly from your WhatsApp app dashboard

### 2. Create OTP Template

Click **"Create Template"** and fill in:

#### Template Details
- **Template Name**: `customer_auth_otp` (must match `WHATSAPP_OTP_TEMPLATE` in .env)
- **Category**: `AUTHENTICATION`
- **Language**: `English (US)`

#### Template Content

**Header** (optional but recommended):
```
Your verification code
```

**Body** (required):
```
Your OTP code is {{1}}. Valid for {{2}} minutes. Do not share this code with anyone.
```

Variables:
- `{{1}}` = 6-digit OTP
- `{{2}}` = Expiry minutes (10)

**Footer** (optional):
```
Woven Essence
```

**Buttons**: None (authentication templates don't support buttons)

#### Security Settings (IMPORTANT)

For **AUTHENTICATION** category templates:
- ✅ Check **"Add security recommendation"**
- This adds Meta's standard security disclaimer

### 3. Submit for Approval

1. Review the template
2. Click **"Submit"**
3. Approval typically takes 1-24 hours
4. You'll get email notification when approved

### 4. Check Approval Status

- Go to **Message Templates**
- Status should show **"Approved"** with green checkmark
- If rejected, check feedback and resubmit with fixes

---

## Environment Configuration

Add these variables to your `.env` file:

```bash
# ========================================
# WhatsApp Cloud API Configuration
# ========================================
WHATSAPP_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxx (your permanent token)
WHATSAPP_API_VERSION=v21.0
WHATSAPP_DEFAULT_COUNTRY_CODE=91
WHATSAPP_REQUEST_TIMEOUT_MS=8000

# ========================================
# WhatsApp OTP Authentication
# ========================================
WHATSAPP_OTP_TEMPLATE=customer_auth_otp
WHATSAPP_OTP_TEMPLATE_LANGUAGE=en_US
WHATSAPP_OTP_EXPIRY_MINUTES=10
WHATSAPP_OTP_MAX_ATTEMPTS=3
WHATSAPP_OTP_MAX_RESENDS_PER_DAY=3

# Authentication Secret (generate secure random string)
AUTH_SECRET=your-secure-random-secret-min-32-chars
```

### Generate Secure AUTH_SECRET

```bash
# Linux/Mac
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use: https://generate-secret.now.sh/32
```

---

## Testing

### 1. Test Number Registration

Before sending to customers, add test numbers:

1. In WhatsApp API Setup
2. Find **"To"** section
3. Click **"Manage phone number list"**
4. Add your phone number (must have WhatsApp installed)
5. You'll receive verification code on WhatsApp
6. Enter code to verify

### 2. Test OTP Flow

#### A. Request OTP
```bash
curl -X POST http://localhost:3200/api/auth/customer/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

Expected response:
```json
{
  "ok": true,
  "expiresIn": 600,
  "message": "OTP sent to +9198******"
}
```

Check WhatsApp on your test phone for the OTP message.

#### B. Verify OTP
```bash
curl -X POST http://localhost:3200/api/auth/customer/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210", "otp": "123456"}'
```

Expected response:
```json
{
  "ok": true,
  "customer": {
    "id": "...",
    "phone": "+919876543210",
    "name": "",
    "email": ""
  },
  "message": "Login successful"
}
```

### 3. Test UI

Navigate to: `http://localhost:3200/customer/login`

1. Enter your test phone number
2. Click "Send OTP"
3. Check WhatsApp for OTP
4. Enter OTP
5. Should redirect to customer dashboard

---

## Troubleshooting

### Template Not Approved

**Error**: Template rejected

**Common reasons**:
- Template doesn't follow Meta's guidelines
- Security recommendation not added
- Variables not properly formatted
- Category mismatch

**Solution**:
1. Read rejection feedback carefully
2. Fix issues
3. Resubmit template
4. Use simple, clear language

### OTP Not Received

**Error**: "Failed to send OTP via WhatsApp"

**Checks**:
1. Is template approved? (Status = "Approved")
2. Is phone number registered for testing?
3. Does phone have WhatsApp installed?
4. Is `WHATSAPP_ENABLED=true` in .env?
5. Is access token valid? (Check expiry)
6. Check server logs for detailed error

**Common errors**:

```
Template not approved (code 132001)
→ Wait for Meta approval or check template name

Number not on WhatsApp (code 131026)
→ Verify phone has WhatsApp installed

Invalid access token (code 190)
→ Regenerate permanent token
```

### Rate Limiting

**Error**: "Too many requests"

**Cause**: Exceeded Meta's rate limits or app's configured limits

**Solution**:
1. Wait 60 seconds between resends (enforced by app)
2. Max 3 OTP requests per 24 hours per phone (enforced by app)
3. Meta's limits: Check your Business Manager quotas

### Session Issues

**Error**: "Session validation failed"

**Checks**:
1. Is `AUTH_SECRET` set in .env?
2. Did you restart server after changing .env?
3. Is cookie being set? (Check browser dev tools)
4. Is session expired? (12 hour default)

---

## Security Best Practices

### ✅ Do's

1. **Never log OTPs** - OTPs are never logged or exposed in URLs
2. **Use HTTPS** - Required for production (webhooks, cookies)
3. **Secure AUTH_SECRET** - Min 32 characters, random, never commit
4. **Rotate tokens** - Regenerate access tokens periodically
5. **Monitor usage** - Watch for abuse patterns
6. **Rate limiting** - Already implemented (3 attempts, 3 resends/24h)

### ❌ Don'ts

1. **Don't commit tokens** - Never commit `.env` to version control
2. **Don't share templates** - Each business needs separate approval
3. **Don't skip HTTPS** - Local dev OK, production requires HTTPS
4. **Don't reuse OTPs** - OTPs are single-use (enforced)
5. **Don't skip expiry** - OTPs expire in 10 minutes (enforced)

### Security Features Implemented

✅ Cryptographically secure OTP generation (`crypto.randomInt`)  
✅ HMAC-SHA256 keyed hash storage (never plaintext OTPs)  
✅ Constant-time comparison (prevents timing attacks)  
✅ Attempt-based rate limiting (3 attempts per OTP)  
✅ Time-based expiry (10 minutes)  
✅ Resend throttling (60s cooldown, 3/day limit)  
✅ Single-use consumption (OTP deleted after verification)  
✅ Phone number hashing (privacy)  
✅ Server-only access token (never exposed to client)  
✅ Approved WhatsApp template (Meta security review)  

---

## Template Examples

### Authentication Template (Required)

**Name**: `customer_auth_otp`  
**Category**: AUTHENTICATION

```
Header: Your verification code
Body: Your OTP code is {{1}}. Valid for {{2}} minutes. Do not share this code with anyone.
Footer: Woven Essence
```

### Alternative Templates (Optional)

#### Simple OTP
```
Body: {{1}} is your verification code. Valid for {{2}} minutes.
```

#### Branded OTP
```
Header: Woven Essence Security
Body: Your one-time password is {{1}}. This code expires in {{2}} minutes. Never share your OTP with anyone, including Woven Essence staff.
Footer: Questions? Contact support
```

---

## Support & Resources

- **Meta WhatsApp Docs**: https://developers.facebook.com/docs/whatsapp/cloud-api
- **Template Guidelines**: https://developers.facebook.com/docs/whatsapp/message-templates/guidelines
- **Rate Limits**: https://developers.facebook.com/docs/whatsapp/cloud-api/rate-limits
- **Error Codes**: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

---

## Checklist

Before going live:

- [ ] Meta Business Account created
- [ ] WhatsApp Business phone verified
- [ ] System User created with permanent token
- [ ] Authentication template approved
- [ ] All environment variables configured
- [ ] `AUTH_SECRET` is secure random string (min 32 chars)
- [ ] Tested OTP request with test number
- [ ] Tested OTP verification flow
- [ ] Tested resend functionality
- [ ] Tested rate limiting
- [ ] HTTPS enabled on production
- [ ] Access token secured (not in version control)
- [ ] Error monitoring set up
- [ ] Customer support process ready

---

## Updates & Maintenance

### Monthly
- Review WhatsApp usage metrics
- Check for failed message patterns
- Verify template still approved

### Quarterly
- Rotate access tokens (security best practice)
- Review and update templates if needed
- Audit security logs

### As Needed
- Update API version in .env if Meta releases new version
- Update template if rejected or business requirements change
- Scale up messaging quotas if needed (contact Meta)

---

**Last Updated**: October 2026  
**Version**: 1.0.0
