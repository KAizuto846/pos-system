'use client';

import { useEffect, useState } from 'react';

export interface BusinessSettings {
  businessName: string;
  palette: string;
  font: string;
  logo: string;
}

const DEFAULT_BUSINESS: BusinessSettings = {
  businessName: '',
  palette: 'emerald',
  font: 'sistema',
  logo: '',
};

export const BUSINESS_UPDATED_EVENT = 'pos:business-updated';

export function useBusiness(): BusinessSettings {
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setBusiness({
          businessName: data.businessName || '',
          palette: data.palette || 'emerald',
          font: data.font || 'sistema',
          logo: data.logo || '',
        });
      } catch {
        // Sin red: se mantienen los valores por defecto
      }
    };
    load();
    window.addEventListener(BUSINESS_UPDATED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(BUSINESS_UPDATED_EVENT, load);
    };
  }, []);

  return business;
}

export function notifyBusinessUpdated() {
  window.dispatchEvent(new Event(BUSINESS_UPDATED_EVENT));
}