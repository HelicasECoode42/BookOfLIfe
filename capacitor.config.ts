import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.helicase.wenbanyiguang',
  appName: '温伴忆光',
  webDir: 'mobile_web',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
