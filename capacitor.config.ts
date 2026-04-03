/// <reference types="@capacitor/push-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';

const appUrl = process.env.CAPACITOR_APP_URL?.trim();
const allowNavigation = process.env.CAPACITOR_ALLOW_NAVIGATION
  ?.split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const config: CapacitorConfig = {
  appId: 'com.mackbloom.bracketball',
  appName: 'bracketball',
  webDir: 'mobile-web',
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ...(appUrl
    ? {
        server: {
          url: appUrl,
          cleartext: appUrl.startsWith('http://'),
          ...(allowNavigation?.length ? { allowNavigation } : {}),
        },
      }
    : {}),
};

export default config;
