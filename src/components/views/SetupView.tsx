// =============================================================================
// Ecclesia CMS — First-Run Parish Setup Wizard
// =============================================================================
//
// PURPOSE
//   Full-screen wizard shown after login when setupCompleted === false.
//   Collects all parish identity fields and a logo, then saves them via
//   PUT /api/parish with setupCompleted: true. The user cannot enter the
//   main app until this wizard is completed.
//
// DESIGN
//   - Single-page form (no steps — simpler UX for a parish admin)
//   - Logo upload with client-side resize to max 256×256
//   - All fields from ParishSettings are collected
//   - Uses the same parishApi.update() as the admin settings form
//
// RELATED FILES
//   - src/types.ts                      → ParishSettings interface
//   - src/services/api.ts               → parishApi.update()
//   - src/App.tsx                       → gates on setupCompleted
// =============================================================================
import React, { useState, useRef, useCallback } from 'react';
import { parishApi } from '../../services/api';
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
 * initial parish identity setup. Shows a welcome banner and a comprehensive
 * form with all ParishSettings fields.
 */
export const SetupView: React.FC<SetupViewProps> = ({ onComplete }) => {
  // ── Form state ───────────────────────────────────────────────────────────
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

  // ── UI state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Form submission ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Require at least the parish name
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
        setupCompleted: true,
      });
      window.dispatchEvent(new CustomEvent(PARISH_CHANGED_EVENT));
      onComplete();
    } catch (err) {
      console.error('Failed to save parish settings', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings. Please try again.');
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
            Let's set up your parish identity. This information will appear on receipts,
            certificates, and the application header.
          </p>
        </div>

        {/* Setup form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
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
              {saving ? 'Saving...' : 'Complete Setup →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetupView;
