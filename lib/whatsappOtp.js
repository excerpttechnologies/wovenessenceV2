/* ==========================================================================
   WhatsApp OTP Sending via Meta WhatsApp Cloud API
   
   - Uses approved authentication template
   - Server-side access token (never exposed to client)
   - Template structure:
     * Header: "Your verification code"
     * Body: "Your OTP code is {{1}}. Valid for {{2}} minutes. Do not share."
   ========================================================================== */

/**
 * Send OTP via WhatsApp Cloud API using approved template
 * @param {string} phone - Phone number in E.164 format (e.g., +919876543210)
 * @param {string} otp - 6-digit OTP (NEVER logged)
 * @param {number} expiryMinutes - OTP validity in minutes
 * @returns {Promise<{ok: boolean, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppOtp(phone, otp, expiryMinutes = 10) {
  const {
    WHATSAPP_ENABLED,
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_API_VERSION,
    WHATSAPP_OTP_TEMPLATE,
    WHATSAPP_OTP_TEMPLATE_LANGUAGE,
    WHATSAPP_REQUEST_TIMEOUT_MS,
  } = process.env;

  // Check if WhatsApp is configured
  if (String(WHATSAPP_ENABLED).toLowerCase() === 'false') {
    return { ok: false, error: 'WhatsApp OTP is disabled in configuration.' };
  }
  
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return {
      ok: false,
      error: 'WhatsApp is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to .env',
    };
  }

  // Validate inputs (but never log the OTP)
  if (!phone || !phone.startsWith('+')) {
    return { ok: false, error: 'Invalid phone number format. Expected E.164 format (+919876543210)' };
  }
  
  if (!otp || otp.length !== 6) {
    return { ok: false, error: 'Invalid OTP format' };
  }

  const API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION || 'v21.0'}`;
  const template = WHATSAPP_OTP_TEMPLATE || 'customer_auth_otp';
  const language = WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'en_US';
  const timeout = Math.max(8000, Number(WHATSAPP_REQUEST_TIMEOUT_MS) || 8000);

  try {
    const response = await fetch(
      `${API_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/^\+/, ''), // Remove + for API
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: otp },
                  { type: 'text', text: String(expiryMinutes) },
                ],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(timeout),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        error: parseWhatsAppError(data, response.status),
      };
    }

    return {
      ok: true,
      messageId: data.messages?.[0]?.id || '',
    };
  } catch (error) {
    const isTimeout = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      ok: false,
      error: isTimeout
        ? 'WhatsApp did not respond in time. Please try again.'
        : `Failed to send OTP: ${error?.message || 'Unknown error'}`,
    };
  }
}

/**
 * Parse WhatsApp API error into user-friendly message
 * @param {object} errorData - Error response from WhatsApp API
 * @param {number} status - HTTP status code
 * @returns {string} User-friendly error message
 */
function parseWhatsAppError(errorData, status) {
  const error = errorData?.error;
  if (!error) return 'Failed to send OTP via WhatsApp';

  const code = error.code;
  const message = error.error_user_msg || error.message || '';

  // Template-related errors
  if (code === 132001 || code === 132000) {
    return 'WhatsApp authentication template is not approved yet. Please contact support.';
  }

  // Number/recipient errors
  if (code === 131026 || code === 131030 || code === 131051) {
    return 'This number cannot receive WhatsApp messages. Verify the number is correct and has WhatsApp.';
  }

  // Authentication errors
  if (code === 190 || status === 401) {
    return 'WhatsApp authentication failed. Please contact support.';
  }

  // Rate limiting
  if (code === 130429 || status === 429) {
    return 'Too many requests. Please wait a few minutes and try again.';
  }

  // Spam/quality errors
  if (code === 131048 || code === 131047) {
    return 'Message cannot be sent due to WhatsApp quality restrictions. Please try again later.';
  }

  // Generic error with user message
  if (message) {
    return `WhatsApp: ${message}`;
  }

  return `Failed to send OTP (Error ${code || status})`;
}

/**
 * Validate WhatsApp configuration
 * @returns {{ok: boolean, error?: string}}
 */
export function validateWhatsAppConfig() {
  const {
    WHATSAPP_ENABLED,
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
  } = process.env;

  if (String(WHATSAPP_ENABLED).toLowerCase() === 'false') {
    return { ok: false, error: 'WhatsApp is disabled' };
  }

  if (!WHATSAPP_ACCESS_TOKEN) {
    return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN is not configured' };
  }

  if (!WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: 'WHATSAPP_PHONE_NUMBER_ID is not configured' };
  }

  return { ok: true };
}
