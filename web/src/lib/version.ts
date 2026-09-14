import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface AppVersion {
  label: string;
  isNative: boolean;
  version: string;
  build: string;
}

export function useAppVersion(): AppVersion | null {
  const [info, setInfo] = useState<AppVersion | null>(null);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      App.getInfo()
        .then(x => setInfo({
          label: `${x.version} · ${x.build}`,
          version: x.version,
          build: x.build,
          isNative: true,
        }))
        .catch(() => setInfo({ label: '-', version: '', build: '', isNative: true }));
    } else {
      setInfo({ label: 'веб-версия', version: 'web', build: '', isNative: false });
    }
  }, []);

  return info;
}
