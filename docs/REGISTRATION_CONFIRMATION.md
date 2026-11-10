# Registration Confirmation Code

## Overview

The WhatsApp OTP login system includes a **registration confirmation code** feature to prevent unauthorized new account registrations. Only users who have the confirmation code can complete registration.

---

## How It Works

### For Existing Users
1. Enter phone number
2. Receive OTP via WhatsApp
3. Enter OTP
4. **Login successful** ✅

### For New Users
1. Enter phone number
2. Receive OTP via WhatsApp
3. Enter OTP
4. **System detects new user** 🔒
5. Prompted for confirmation code
6. Enter confirmation code: `ETPL@2026`
7. **Registration complete** ✅

---

## Configuration

### Environment Variable

Add to your `.env` file:

```bash
# Customer Registration Confirmation Code (required for new accounts)
CUSTOMER_REGISTRATION_CODE=ETPL@2026
```

### Changing the Code

To change the confirmation code:

1. Update `.env`:
   ```bash
   CUSTOMER_REGISTRATION_CODE=YOUR_NEW_CODE
   ```

2. Restart your server:
   ```bash
   npm run dev
   # or
   npm run build && npm start
   ```

3. Inform authorized users of the new code

---

## User Experience

### New User Registration Flow

**Step 1: Phone Number**
```
┌─────────────────────────────────┐
│   Sign in with WhatsApp         │
│                                 │
│   Phone Number                  │
│   [+91] [98765 43210]          │
│                                 │
│   [    Send OTP    ]           │
└─────────────────────────────────┘
```

**Step 2: OTP Verification**
```
┌─────────────────────────────────┐
│   ← Change number               │
│                                 │
│   Enter OTP                     │
│   Sent to +91 98765 43210      │
│                                 │
│   6-Digit OTP                   │
│   [1] [2] [3] [4] [5] [6]      │
│                                 │
│   [  Verify & Login  ]         │
│                                 │
│   Resend OTP                    │
└─────────────────────────────────┘
```

**Step 3: Confirmation Code (NEW USERS ONLY)**
```
┌─────────────────────────────────┐
│   ← Back to OTP                 │
│                                 │
│   New Registration              │
│   Enter the confirmation code   │
│   to complete your registration │
│                                 │
│   Confirmation Code             │
│   [ETPL@2026________]          │
│                                 │
│   [Complete Registration]       │
│                                 │
│ ⚠️ Contact support if you      │
│   don't have a confirmation     │
│   code. Only authorized users   │
│   can register.                 │
└─────────────────────────────────┘
```

---

## Security Benefits

### Prevents Unauthorized Registrations
- ✅ Only users with the confirmation code can register
- ✅ Existing customers login normally without code
- ✅ Reduces spam and fake accounts
- ✅ Controls who can access your platform

### Use Cases
- **Invite-only platform**: Distribute code to approved customers
- **Employee portal**: Share code with staff members
- **Beta testing**: Limit access during testing phase
- **Partner access**: Control partner registration

---

## API Response Codes

### For New Users Without Code

**Request:**
```json
POST /api/auth/customer/verify-otp
{
  "phone": "9876543210",
  "otp": "123456"
}
```

**Response (403):**
```json
{
  "error": "Confirmation code is required for registration",
  "code": "CONFIRMATION_REQUIRED",
  "isNewUser": true
}
```

### For New Users With Invalid Code

**Request:**
```json
POST /api/auth/customer/verify-otp
{
  "phone": "9876543210",
  "otp": "123456",
  "confirmationCode": "WRONG_CODE"
}
```

**Response (403):**
```json
{
  "error": "Invalid confirmation code. Contact support to get the registration code.",
  "code": "INVALID_CONFIRMATION",
  "isNewUser": true
}
```

### For New Users With Valid Code

**Request:**
```json
POST /api/auth/customer/verify-otp
{
  "phone": "9876543210",
  "otp": "123456",
  "confirmationCode": "ETPL@2026"
}
```

**Response (200):**
```json
{
  "ok": true,
  "customer": {
    "id": "673abc...",
    "phone": "+919876543210",
    "name": "",
    "email": "",
    "isNewCustomer": true
  },
  "message": "Login successful"
}
```

---

## Distributing the Code

### Methods to Share with Customers

1. **In-Store**: Print on receipts or business cards
2. **WhatsApp**: Send via official business WhatsApp
3. **Email**: Include in welcome emails
4. **SMS**: Send during customer onboarding
5. **Staff**: Train staff to provide code at checkout
6. **Website**: Display for logged-in admin users
7. **Packaging**: Print on product packaging

### Example Communication

**WhatsApp Message:**
```
🎉 Welcome to Woven Essence!

To access your online account:
1. Visit: erp.wovenessence.in/customer/login
2. Enter your mobile number
3. Enter OTP you receive
4. Use registration code: ETPL@2026

Need help? Reply to this message!
```

**Receipt Footer:**
```
═══════════════════════════════════
    ONLINE ACCOUNT ACCESS
    
    Visit: wovenessence.in/login
    Registration Code: ETPL@2026
    
    Track orders, view history & more!
═══════════════════════════════════
```

---

## Disabling Confirmation Code

To allow open registration (not recommended for production):

1. Remove or comment out in `.env`:
   ```bash
   # CUSTOMER_REGISTRATION_CODE=ETPL@2026
   ```

2. The system will fall back to allowing registrations without code

**⚠️ Warning:** Open registration may lead to spam accounts and abuse.

---

## Admin Interface (Optional Enhancement)

Consider adding an admin panel to:
- View confirmation code usage statistics
- Change code without server restart
- Generate time-limited codes
- Track who registered with each code
- Revoke/expire old codes

---

## Troubleshooting

### "Confirmation code is required"
→ User is trying to register for the first time. They need the code.

### "Invalid confirmation code"
→ User entered wrong code. Verify they have the correct code: `ETPL@2026`

### Existing users prompted for code
→ Check database - user might not exist. Verify phone number format.

### Code not working after restart
→ Verify `.env` file has `CUSTOMER_REGISTRATION_CODE=ETPL@2026`

---

## Best Practices

### Security
1. **Change Periodically**: Update code every 3-6 months
2. **Keep Private**: Don't post publicly on website
3. **Selective Sharing**: Only give to authorized customers
4. **Monitor Usage**: Track registrations to detect abuse

### User Experience
1. **Clear Communication**: Explain why code is needed
2. **Easy Access**: Make code easy to find for legitimate users
3. **Support Ready**: Train support team on providing code
4. **Existing Users**: Don't impact returning customer experience

### Code Format
1. **Memorable**: Use business name or year
2. **Type-able**: Avoid confusing characters (0/O, 1/l)
3. **Reasonable Length**: 8-16 characters is ideal
4. **Case Sensitive**: Clearly communicate if case matters

---

## Example Codes

```bash
# Business branding
CUSTOMER_REGISTRATION_CODE=ETPL@2026

# Date-based (changes quarterly)
CUSTOMER_REGISTRATION_CODE=ETPL-Q4-2026

# Department-specific
CUSTOMER_REGISTRATION_CODE=SALES@ETPL2026

# Location-based
CUSTOMER_REGISTRATION_CODE=DELHI-ETPL-26

# Invite-only
CUSTOMER_REGISTRATION_CODE=INVITE-WELCOME
```

---

## Future Enhancements

Consider implementing:
- Multiple valid codes (for different channels)
- Code expiry dates
- Usage limits per code
- Customer-specific invitation codes
- QR code generation for easy sharing
- Admin dashboard for code management

---

## Support Response Templates

### Customer Asks: "What is confirmation code?"

```
The confirmation code is required to create your account 
and is provided by our store. 

If you're a registered customer of TEMPLE FABRICS, 
your confirmation code is: ETPL@2026

If you haven't received a code, please visit our 
store or contact us at [phone/email].
```

### Customer Says: "I don't have a code"

```
The confirmation code is provided to authorized customers 
of TEMPLE FABRICS. 

To get your code:
1. Visit our store at [address]
2. Call us at [phone number]
3. Check your recent purchase receipt

Your access code will be: ETPL@2026
```

---

**Last Updated**: October 29, 2026  
**Feature Version**: 1.1.0  
**Default Code**: ETPL@2026
