import React from 'react';

/**
 * Footer Component for Ecclesia Church Management System.
 * Displays parish system branding, spiritual motto, and helpful quick links.
 */
export const Footer: React.FC = () => {
  return (
    // Outer footer container with top border divider and responsive padding
    <footer className="mt-12 border-t border-[#e1e3e3] bg-[#ffffff] py-6 px-6 text-center text-xs text-[#444748]">
      {/* Centered content wrapper matching standard application layout width */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left side: System Title & Parish Identity */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#1a1c1c]">† Ecclesia CMS</span>
          <span className="text-[#c4c7c7]">|</span>
          <span>Parish Administration</span>
        </div>

        {/* Center: Inspirational parish governance quote */}
        <p className="italic text-[#444748] text-[11px]">
          "Servants of the Lord, let us manage His house with integrity."
        </p>

        {/* Right side: Auxiliary navigation & administrative support links */}
        <div className="flex items-center gap-4 text-[11px]">
          <span className="hover:underline cursor-pointer">Privacy Policy</span>
          <span>•</span>
          <span className="hover:underline cursor-pointer">Terms of Service</span>
          <span>•</span>
          <span className="hover:underline cursor-pointer">System Support</span>
        </div>
      </div>
    </footer>
  );
};

