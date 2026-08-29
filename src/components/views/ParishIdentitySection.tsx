// =============================================================================
// Ecclesia CMS — Parish Identity Section (Admin Panel)
// =============================================================================
//
// PURPOSE
//   Re-usable parish identity form that appears in the Administration panel
//   under the "PARISH IDENTITY" tab. Shows exactly the same fields as the
//   first-run wizard (SetupView) but in a non-fullscreen card layout.
//   Any admin or super_admin can edit name, logo, motto, address, etc. at any
//   time. Saves via PUT /api/parish.
//
// RELATED FILES
//   - src/components/views/SetupView.tsx  → first-run wizard (same form fields)
//   - src/services/api.ts                 → parishApi.update()
//   - src/types.ts                        → ParishSettings interface
// =============================================================================
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { parishApi } from '../../services/api';
import { ParishSettings } from '../../types';
import { PARISH_CHANGED_EVENT } from '../../hooks/useParishInfo';
import { resizeImage } from '../../lib/image';
import { useToast } from '../Toast';

export const ParishIdentitySection: React.FC = () => {
  const { showSuccess, toastEl } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form fields
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

  // Load current settings on mount
  useEffect(() => {
    parishApi
      .get()
      .then((s: ParishSettings) => {
        setName(s.name);
        setDiocese(s.diocese);
        setLocalChurch(s.localChurch);
        setSccLabel(s.sccLabel || 'Jumuiya');
        setCounty(s.county);
        setCountry(s.country || 'Kenya');
        setAddress(s.address);
        setPhone(s.phone);
        setEmail(s.email);
        setMotto(s.motto);
        setLogoData(s.logoData);
      })
      .catch((err) => console.error('Failed to load parish settings', err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    try {
      const dataUrl = await resizeImage(file);
      setLogoData(dataUrl);
      setError('');
    } catch {
      setError('Failed to process the image.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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
      });
      window.dispatchEvent(new CustomEvent(PARISH_CHANGED_EVENT));
      showSuccess('Parish identity updated successfully!');
    } catch (err) {
      console.error('Failed to save parish settings', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs text-center">
        <p className="text-xs text-[#444748] animate-pulse">Loading parish settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6 max-w-3xl">
      {toastEl}
      <div>
        <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Parish Identity</h3>
        <p className="text-xs text-[#444748] mt-1">
          Configure the parish name, logo, and identity that appears on receipts, certificates, and the application header.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 text-xs">
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
            <p className="text-[10px] text-[#999] mt-0.5">Recommended: square image, max 256×256px</p>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => void handleLogoUpload(e)} className="hidden" />
          </div>
        </div>

        {/* Form fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block font-bold text-[#1a1c1c] mb-1">
              Parish Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. St. Mary's Catholic Parish"
              className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]"
              required
            />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">Diocese</label>
            <input type="text" value={diocese} onChange={(e) => setDiocese(e.target.value)} placeholder="e.g. Archdiocese of Nairobi" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">Local Church</label>
            <input type="text" value={localChurch} onChange={(e) => setLocalChurch(e.target.value)} placeholder="e.g. Our Lady of Guadalupe" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">Jumuiya / SCC Label</label>
            <input type="text" value={sccLabel} onChange={(e) => setSccLabel(e.target.value)} placeholder="Jumuiya" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">County</label>
            <input type="text" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="e.g. Nairobi" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">Country</label>
            <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Kenya" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">Physical Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="P.O. Box 123-00100, Nairobi" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 700 000000" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div>
            <label className="block font-bold text-[#1a1c1c] mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parish@ecclesia.local" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>

          <div className="md:col-span-2">
            <label className="block font-bold text-[#1a1c1c] mb-1">Parish Motto</label>
            <input type="text" value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="e.g. Serve the Lord with gladness" className="w-full px-3 py-2 bg-[#f9f9f9] border border-[#e1e3e3] rounded text-[#1a1c1c] placeholder:text-[#aaa]" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800">{error}</div>
        )}

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Parish Identity'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ParishIdentitySection;
