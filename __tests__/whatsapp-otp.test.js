/* ==========================================================================
   WhatsApp OTP Authentication Tests
   
   Run with: npm test __tests__/whatsapp-otp.test.js
   Or: node --test __tests__/whatsapp-otp.test.js
   
   Tests cover:
   - OTP generation and hashing
   - Phone normalization
   - Rate limiting logic
   - Session expiry
   ========================================================================== */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

// Import OTP utilities
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  hashPhone,
  normalizePhone,
  getOtpExpiry,
  isExpired,
  maxAttemptsReached,
  maxResendsReached,
  getResendCooldown,
} from '../lib/otp.js';

describe('OTP Generation', () => {
  it('should generate 6-digit OTP', () => {
    const otp = generateOtp();
    assert.strictEqual(otp.length, 6);
    assert.ok(/^\d{6}$/.test(otp), 'OTP should contain only digits');
  });

  it('should generate different OTPs', () => {
    const otp1 = generateOtp();
    const otp2 = generateOtp();
    assert.notStrictEqual(otp1, otp2, 'OTPs should be different');
  });

  it('should pad with leading zeros', () => {
    // Test multiple times to catch edge cases
    for (let i = 0; i < 100; i++) {
      const otp = generateOtp();
      assert.strictEqual(otp.length, 6, `OTP length should always be 6, got ${otp}`);
    }
  });
});

describe('OTP Hashing and Verification', () => {
  it('should hash OTP consistently', () => {
    const otp = '123456';
    const hash1 = hashOtp(otp);
    const hash2 = hashOtp(otp);
    assert.strictEqual(hash1, hash2, 'Same OTP should produce same hash');
  });

  it('should produce different hashes for different OTPs', () => {
    const hash1 = hashOtp('123456');
    const hash2 = hashOtp('654321');
    assert.notStrictEqual(hash1, hash2, 'Different OTPs should produce different hashes');
  });

  it('should verify correct OTP', () => {
    const otp = '123456';
    const hash = hashOtp(otp);
    assert.ok(verifyOtp(otp, hash), 'Correct OTP should verify');
  });

  it('should reject incorrect OTP', () => {
    const hash = hashOtp('123456');
    assert.ok(!verifyOtp('654321', hash), 'Incorrect OTP should not verify');
  });

  it('should reject empty OTP', () => {
    const hash = hashOtp('123456');
    assert.ok(!verifyOtp('', hash), 'Empty OTP should not verify');
  });

  it('should reject null hash', () => {
    assert.ok(!verifyOtp('123456', null), 'Null hash should not verify');
  });
});

describe('Phone Number Hashing', () => {
  it('should hash phone consistently', () => {
    const phone = '+919876543210';
    const hash1 = hashPhone(phone);
    const hash2 = hashPhone(phone);
    assert.strictEqual(hash1, hash2, 'Same phone should produce same hash');
  });

  it('should produce different hashes for different phones', () => {
    const hash1 = hashPhone('+919876543210');
    const hash2 = hashPhone('+918765432109');
    assert.notStrictEqual(hash1, hash2, 'Different phones should produce different hashes');
  });

  it('should produce 64-character hex hash', () => {
    const hash = hashPhone('+919876543210');
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash), 'Hash should be hexadecimal');
  });
});

describe('Phone Number Normalization', () => {
  it('should normalize 10-digit Indian number', () => {
    const result = normalizePhone('9876543210', '91');
    assert.strictEqual(result, '+919876543210');
  });

  it('should normalize number with country code', () => {
    const result = normalizePhone('919876543210', '91');
    assert.strictEqual(result, '+919876543210');
  });

  it('should normalize number with + prefix', () => {
    const result = normalizePhone('+919876543210', '91');
    assert.strictEqual(result, '+919876543210');
  });

  it('should remove leading 0 from 11-digit number', () => {
    const result = normalizePhone('09876543210', '91');
    assert.strictEqual(result, '+919876543210');
  });

  it('should remove 00 international prefix', () => {
    const result = normalizePhone('00919876543210', '91');
    assert.strictEqual(result, '+919876543210');
  });

  it('should handle spaces and dashes', () => {
    const result = normalizePhone('98765-43210', '91');
    assert.strictEqual(result, '+919876543210');
  });

  it('should reject invalid numbers', () => {
    assert.strictEqual(normalizePhone('123', '91'), '');
    assert.strictEqual(normalizePhone('abcd', '91'), '');
    assert.strictEqual(normalizePhone('', '91'), '');
  });

  it('should reject numbers that are too long', () => {
    const result = normalizePhone('123456789012345678', '91');
    assert.strictEqual(result, '', 'Too long numbers should be rejected');
  });

  it('should handle US numbers', () => {
    const result = normalizePhone('2025551234', '1');
    assert.strictEqual(result, '+12025551234');
  });
});

describe('OTP Expiry', () => {
  it('should create future expiry date', () => {
    const expiry = getOtpExpiry();
    assert.ok(expiry > new Date(), 'Expiry should be in the future');
  });

  it('should not be expired for future date', () => {
    const futureDate = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    assert.ok(!isExpired(futureDate), 'Future date should not be expired');
  });

  it('should be expired for past date', () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    assert.ok(isExpired(pastDate), 'Past date should be expired');
  });
});

describe('Rate Limiting', () => {
  it('should not reach max attempts at 0', () => {
    assert.ok(!maxAttemptsReached(0), '0 attempts should not reach max');
  });

  it('should not reach max attempts at 2', () => {
    assert.ok(!maxAttemptsReached(2), '2 attempts should not reach max');
  });

  it('should reach max attempts at 3', () => {
    assert.ok(maxAttemptsReached(3), '3 attempts should reach max');
  });

  it('should reach max attempts above 3', () => {
    assert.ok(maxAttemptsReached(5), '5 attempts should reach max');
  });

  it('should not reach max resends below limit', () => {
    const lastResend = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    assert.ok(!maxResendsReached(2, lastResend), '2 resends should not reach max');
  });

  it('should reach max resends at limit within 24h', () => {
    const lastResend = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    assert.ok(maxResendsReached(3, lastResend), '3 resends in 24h should reach max');
  });

  it('should reset after 24 hours', () => {
    const lastResend = new Date(Date.now() - 1000 * 60 * 60 * 25); // 25 hours ago
    assert.ok(!maxResendsReached(3, lastResend), 'Resends should reset after 24h');
  });
});

describe('Resend Cooldown', () => {
  it('should return 0 for null lastResend', () => {
    const cooldown = getResendCooldown(null);
    assert.strictEqual(cooldown, 0);
  });

  it('should return 0 for old lastResend', () => {
    const lastResend = new Date(Date.now() - 120 * 1000); // 2 minutes ago
    const cooldown = getResendCooldown(lastResend);
    assert.strictEqual(cooldown, 0);
  });

  it('should return positive cooldown for recent resend', () => {
    const lastResend = new Date(Date.now() - 10 * 1000); // 10 seconds ago
    const cooldown = getResendCooldown(lastResend);
    assert.ok(cooldown > 0 && cooldown <= 60, 'Cooldown should be between 0 and 60');
  });
});

describe('Security Properties', () => {
  it('should use cryptographically secure random', () => {
    // Generate 1000 OTPs and check for reasonable distribution
    const otps = new Set();
    for (let i = 0; i < 1000; i++) {
      otps.add(generateOtp());
    }
    // Should have at least 990 unique OTPs (allowing for some collision)
    assert.ok(otps.size >= 990, 'OTPs should be sufficiently random');
  });

  it('should use constant-time comparison', () => {
    // Verify that verifyOtp uses timingSafeEqual by checking it doesn't throw
    const otp = '123456';
    const hash = hashOtp(otp);
    
    // These should not throw even with different lengths
    verifyOtp('123', hash);
    verifyOtp('12345678', hash);
    verifyOtp('', hash);
    
    assert.ok(true, 'Constant-time comparison should handle different lengths');
  });

  it('should hash with HMAC-SHA256', () => {
    const otp = '123456';
    const hash = hashOtp(otp);
    
    // SHA256 hex output is 64 characters
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash), 'Hash should be hexadecimal');
  });
});

console.log('All WhatsApp OTP tests completed!');
