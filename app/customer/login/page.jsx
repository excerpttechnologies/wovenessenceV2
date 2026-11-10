import CustomerOtpForm from '@/components/CustomerOtpForm';
import { Smartphone, Shield, Zap } from 'lucide-react';

export const metadata = {
  title: 'Customer Login | Woven Essence',
  description: 'Sign in to your Woven Essence account with WhatsApp OTP - secure and instant authentication.',
};

/* ==========================================================================
   Customer Login Page
   
   WhatsApp OTP authentication for storefront customers
   - Phone-based login
   - No passwords required
   - Secure OTP via WhatsApp
   ========================================================================== */

export default function CustomerLoginPage() {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/20 p-4 sm:p-8">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10 opacity-20">
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-teal-400 blur-3xl" />
      </div>

      {/* Main card */}
      <div className="relative w-full max-w-[900px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="grid lg:grid-cols-2">
          {/* Left panel - Brand showcase */}
          <div className="hidden flex-col justify-between bg-gradient-to-br from-emerald-700 to-teal-600 p-10 text-white lg:flex">
            <div>
              <h1 className="mb-3 text-3xl font-bold">Woven Essence</h1>
              <p className="text-[15px] leading-relaxed text-emerald-50">
                Experience seamless shopping with instant WhatsApp authentication
              </p>
            </div>

            <div className="space-y-6">
              <Feature
                icon={<Smartphone className="h-6 w-6" />}
                title="WhatsApp Login"
                description="Sign in instantly with your phone number - no password needed"
              />
              <Feature
                icon={<Shield className="h-6 w-6" />}
                title="Secure OTP"
                description="Cryptographically secure one-time passwords via WhatsApp"
              />
              <Feature
                icon={<Zap className="h-6 w-6" />}
                title="Quick Access"
                description="Access your orders, wishlist, and profile in seconds"
              />
            </div>

            <div className="text-[13px] text-emerald-100">
              © 2024 Woven Essence. All rights reserved.
            </div>
          </div>

          {/* Right panel - Login form */}
          <div className="flex items-center justify-center p-8 sm:p-12">
            <CustomerOtpForm redirectTo="/customer/dashboard" />
          </div>
        </div>
      </div>

      {/* Mobile brand header */}
      <div className="absolute left-0 right-0 top-8 text-center lg:hidden">
        <h1 className="text-2xl font-bold text-slate-900">Woven Essence</h1>
      </div>
    </div>
  );
}

function Feature({ icon, title, description }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
        {icon}
      </div>
      <div>
        <h3 className="mb-1 font-semibold">{title}</h3>
        <p className="text-[13.5px] leading-relaxed text-emerald-100">
          {description}
        </p>
      </div>
    </div>
  );
}
