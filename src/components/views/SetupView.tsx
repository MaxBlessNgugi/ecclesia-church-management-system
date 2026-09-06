// =============================================================================
// Ecclesia CMS — First-Run Parish Setup Wizard
// =============================================================================
//
// PURPOSE
//   Full-screen wizard shown after login when setupCompleted === false.
//   Two steps:
//     1. Parish identity — all identity fields + logo, saved via PUT /api/parish.
//     2. Email delivery  — SMTP settings for password-reset emails, with a
//        "Send verification email" action that tests the credentials (without
//        saving) before the parish commits. Can be skipped; the mailer then
//        falls back to backend/.env SMTP_* vars, or the dev outbox.
//   Finishing step 2 saves the SMTP config (when provided) and flips
//   setupCompleted via PUT /api/parish. The user cannot enter the main app
//   until the wizard is completed.
//
// DESIGN
//   - Two steps keep identity and email concerns separate; step 1 is saved
//     immediately so nothing is lost if setup is abandoned mid-way.
//   - Logo upload with client-side resize to max 256×256
//   - SMTP password is masked by the backend; sending the mask back means
//     "keep the stored password" (same convention as M-Pesa settings)
//
// RELATED FILES
//   - src/types.ts                      → ParishSettings / MailSettings
//   - src/services/api.ts               → parishApi, adminApi.mail
//   - src/App.tsx                       → gates on setupCompleted
//   - backend/src/routes/admin.ts       → /mail-settings(+ /verify) endpoints
// =============================================================================
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { parishApi, adminApi, authApi } from '../../services/api';
import { PARISH_CHANGED_EVENT } from '../../hooks/useParishInfo';
import { resizeImage } from '../../lib/image';
import { EcclesiaIcon } from '../EcclesiaIcon';

/** Props accepted by the setup wizard. */
interface SetupViewProps {
  /** Called after the wizard completes successfully. Triggers app reload. */
  onComplete: () => void;
}

/**
 * First-Run Parish Setup Wizard.
 *
 * Rendered as a full-screen overlay when the user has not yet completed the
 * initial setup. Step 1 collects the parish identity; step 2 collects the
 * outbound email (SMTP) settings and verifies them with a real email.
 */
export const SetupView: React.FC<SetupViewProps> = ({ onComplete }) => {
  // ── Wizard state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);

  // ── Step 1: parish identity form state ───────────────────────────────────
  const [name, setName] = useState('');
  const [diocese, setDiocese] = useState('');
  const [localChurch, setLocalChurch] = useState('');
  const [sccLabel, setSccLabel] = useState('Jumuiya');
  const [county, setCounty] = useState('');
  const [country, setCountry] = useState('Kenya');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [motto, setMotto] = useState('');
  const [logoData, setLogoData] = useState<string | null>(null);

  // ── Step 2: email (SMTP) form state ──────────────────────────────────────
  const [mailEnabled, setMailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [hasStoredPass, setHasStoredPass] = useState(false);
  const [verifyTo, setVerifyTo] = useState('');
  const [mailNote, setMailNote] = useState('');       // hint banner (mode / success)
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prefill step 1 with any previously saved parish identity (e.g. when the
  // wizard was abandoned mid-way and is shown again).
  useEffect(() => {
    parishApi
      .get()
      .then((s) => {
        setName((n) => n || s.name);
        setDiocese((d) => d || s.diocese);
        setLocalChurch((c) => c || s.localChurch);
        setSccLabel((v) => (v === 'Jumuiya' && s.sccLabel ? s.sccLabel : v));
        setCounty((c) => c || s.county);
        setCountry((c) => c || s.country);
        setAddress((a) => a || s.address);
        setPhone((p) => p || s.phone);
        setEmail((e) => e || s.email);
        setMotto((m) => m || s.motto);
        setLogoData((l) => l ?? s.logoData);
      })
      .catch(() => {
        /* settings unavailable — start with the empty defaults */
      });
  }, []);

  // Load the SMTP form (masked) + a sensible verification recipient when
  // entering the email step.
  const enterMailStep = useCallback(() => {
    adminApi.mail
      .get()
      .then((m) => {
        setMailEnabled(m.enabled && Boolean(m.smtpHost));
        setSmtpHost((h) => h || m.smtpHost);
        setSmtpPort((p) => (p === '587' ? String(m.smtpPort) : p));
        setSmtpSecure(m.smtpSecure);
        setSmtpUser((u) => u || m.smtpUser);
        setFromAddress((f) => f || m.fromAddress);
        setHasStoredPass(Boolean(m.hasSmtpPass));
        setMailNote(
          m.mode === 'env'
            ? 'Email is currently configured via backend/.env — values saved here will take over.'
            : m.mode === 'db'
              ? 'Using the SMTP settings saved previously.'
              : 'No SMTP configured yet — reset codes currently land in the server outbox (backend/logs/outbox).'
        );
      })
      .catch(() => {
        /* mail settings unavailable — leave defaults */
      });
    authApi
      .me()
      .then((u) => setVerifyTo((t) => t || u.email || ''))
      .catch(() => {
        /* recipient stays empty — the user types one */
      });
  }, []);

  /** Build the MailSettings payload from the form, resolving the password mask. */
  const mailPayload = () => ({
    enabled: mailEnabled,
    smtpHost: smtpHost.trim(),
    smtpPort: Number(smtpPort) || 587,
    smtpSecure,
    smtpUser: smtpUser.trim(),
    // Empty password with one already stored means "keep the stored one" —
    // send the mask so the backend preserves it.
    smtpPass: smtpPass || (hasStoredPass ? '••••••••••••••••' : ''),
    fromAddress: fromAddress.trim() || 'ECCLESIA <no-reply@ecclesia.local>',
  });

  // ── Logo upload handler ──────────────────────────────────────────────────
  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.).');
      return;
    }
    try {
      const dataUrl = await resizeImage(file);
      setLogoData(dataUrl);
      setError('');
    } catch {
      setError('Failed to process the image. Please try another file.');
    }
  }, []);

  // ── Step 1 submission: save identity, continue to email step ─────────────
  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Parish name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await parishApi.update({
        name: name.trim(),
        diocese: diocese.trim(),
        localChurch: localChurch.trim(),
        sccLabel: sccLabel.trim() || 'Jumuiya',
        county: county.trim(),
        country: country.trim() || 'Kenya',
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        motto: motto.trim(),
        logoData,
        // setupCompleted stays false until the wizard finishes.
      });
      window.dispatchEvent(new CustomEvent(PARISH_CHANGED_EVENT));
      setStep(2);
      enterMailStep();
    } catch (err) {
      console.error('Failed to save parish settings', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2: send a verification email with the values as typed ───────────
  const handleVerifyEmail = async () => {
    setVerifyError('');
    setMailNote('');
    if (!mailEnabled || !smtpHost.trim()) {
      setVerifyError('Enable SMTP and enter a server host first.');
      return;
    }
    if (!verifyTo.trim()) {
      setVerifyError('Enter the address the verification email should go to.');
      return;
    }
    setVerifying(true);
    try {
      const res = await adminApi.mail.verify({ ...mailPayload(), to: verifyTo.trim() });
      setMailNote(res.message);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verification email failed.');
    } finally {
      setVerifying(false);
    }
  };

  // ── Step 2 submission: optionally save mail config and finish the wizard ─
  // `saveMail` is false for "Skip for now" — leaves email settings untouched.
  const handleFinish = async (saveMail: boolean) => {
    setSaving(true);
    setError('');
    try {
      if (saveMail && mailEnabled && smtpHost.trim()) {
        await adminApi.mail.update(mailPayload());
      }
      await parishApi.update({ setupCompleted: true });
      window.dispatchEvent(new CustomEvent(PARISH_CHANGED_EVENT));
      onComplete();
    } catch (err) {
      console.error('Failed to finish setup', err);
      setError(err instanceof Error ? err.message : 'Failed to finish setup. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f9f9f9] via-white to-[#f0f0f0] p-4">
      <div className="w-full max-w-2xl">
        {/* Welcome header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1e1e1e] text-white mb-4">
            <EcclesiaIcon size={40} className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-[#1a1c1c]">
            Welcome to ECCLESIA
          </h1>
          <p className="text-sm text-[#444748] mt-2 max-w-md mx-auto">
            {step === 1
              ? "Let's set up your parish identity. This information will appear on receipts, certificates, and the application header."
              : 'Set up outbound email so password-reset codes reach your users. You can skip this and configure it later under Administration.'}
          </p>
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className={`h-1.5 rounded-full transition-all ${step === 1 ? 'w-8 bg-[#1e1e1e]' : 'w-4 bg-[#c4c7c7]'}`} />
            <span className={`h-1.5 rounded-full transition-all ${step === 2 ? 'w-8 bg-[#1e1e1e]' : 'w-4 bg-[#c4c7c7]'}`} />
          </div>
        </div>

        {step === 1 && (
          <form
            onSubmit={(e) => void handleIdentitySubmit(e)}
            className="bg-white border border-[#e1e3e3] rounded-xl p-8 shadow-lg space-y-6"
          >
            {/* Logo upload */}
            <div className="flex items-center gap-6">
              <div
                className="w-24 h-24 rounded-xl border-2 border-dashed border-[#c4c7c7] flex items-center justify-center bg-[#f9f9f9] overflow-hidden cursor-pointer hover:border-[#1e1e1e] transition-colors shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoData ? (
                  <img src={logoData} alt="Parish logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center">
                    <span className="material-symbols-outlined text-2xl text-[#c4c7c7]">add_photo_alternate</span>
                    <p className="text-[9px] text-[#999] mt-0.5">Logo</p>
                  </div>
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-[#1e1e1e] underline cursor-pointer hover:text-[#444748]"
                >
                  {logoData ? 'Change logo' : 'Upload parish logo'}
                </button>
                <p className="text-[10px] text-[#999] mt-0.5">
                  Recommended: square image, max 256×256px
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleLogoUpload(e)}
                  className="hidden"
                />
              </div>
            </div>

            {/* Parish identity fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">
                  Parish Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. St. Mary's Catholic Parish"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Diocese</label>
                <input
                  type="text"
                  value={diocese}
                  onChange={(e) => setDiocese(e.target.value)}
                  placeholder="e.g. Archdiocese of Nairobi"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Local Church</label>
                <input
                  type="text"
                  value={localChurch}
                  onChange={(e) => setLocalChurch(e.target.value)}
                  placeholder="e.g. Our Lady of Guadalupe"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">
                  Jumuiya / SCC Label
                </label>
                <input
                  type="text"
                  value={sccLabel}
                  onChange={(e) => setSccLabel(e.target.value)}
                  placeholder="Jumuiya"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">County</label>
                <input
                  type="text"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  placeholder="e.g. Nairobi"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Kenya"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Physical Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="P.O. Box 123-00100, Nairobi"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254 700 000000"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parish@ecclesia.local"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Parish Motto</label>
                <input
                  type="text"
                  value={motto}
                  onChange={(e) => setMotto(e.target.value)}
                  placeholder="e.g. Serve the Lord with gladness"
                  className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                />
              </div>
            </div>

            {/* Error display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-2.5 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded text-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : 'Continue →'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-8 shadow-lg space-y-6">
            {/* Current delivery mode hint */}
            {mailNote && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-[#444748]">
                {mailNote}
              </div>
            )}

            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mailEnabled}
                onChange={(e) => setMailEnabled(e.target.checked)}
                className="w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-bold text-[#1a1c1c]">
                Send emails over SMTP (password-reset codes, notifications)
              </span>
            </label>

            {mailEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#1a1c1c] mb-1">
                    SMTP Host <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="e.g. smtp.gmail.com or smtp-relay.brevo.com"
                    className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Port</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                    className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                  />
                </div>

                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs text-[#1a1c1c]">
                      Use TLS/SSL (port 465)
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Username</label>
                  <input
                    type="text"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="SMTP username (often the email address)"
                    className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1a1c1c] mb-1">Password</label>
                  <input
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={hasStoredPass ? '•••••••• (stored — leave blank to keep)' : 'SMTP password'}
                    className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#1a1c1c] mb-1">From Address</label>
                  <input
                    type="text"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    placeholder={`ECCLESIA <no-reply@${smtpHost.trim() ? 'yourdomain.org' : 'ecclesia.local'}>`}
                    className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#1a1c1c] mb-1">
                    Send a test email to <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={verifyTo}
                      onChange={(e) => setVerifyTo(e.target.value)}
                      placeholder="you@parish.org"
                      className="flex-1 px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] placeholder:text-[#aaa]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleVerifyEmail()}
                      disabled={verifying}
                      className="px-4 py-2 font-bold text-[#1e1e1e] border border-[#1e1e1e] hover:bg-[#1e1e1e] hover:text-white rounded text-xs transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                    >
                      {verifying ? 'Sending...' : 'Send verification email'}
                    </button>
                  </div>
                  <p className="text-[10px] text-[#999] mt-1">
                    Tests the values above without saving them. Gmail users: create an App
                    Password — your normal login will not work.
                  </p>
                  {verifyError && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                      {verifyError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#e1e3e3]">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-[#444748] hover:underline cursor-pointer"
              >
                ← Back to parish identity
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleFinish(false)}
                  disabled={saving}
                  className="text-xs text-[#444748] hover:underline cursor-pointer disabled:opacity-50"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={() => void handleFinish(true)}
                  disabled={saving}
                  className="px-8 py-2.5 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded text-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Finishing...' : 'Finish Setup →'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupView;
