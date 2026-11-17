import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.infdev.voxelengine',
  appName: 'Infdev Mobile Voxel Engine',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'scenic-beaker-7nzsc.firebaseapp.com',
      '*.firebaseapp.com',
      'accounts.google.com',
      '*.google.com',
      '*.googleusercontent.com',
      '*.gstatic.com',
      'apis.google.com',
      '*.firebaseio.com'
    ]
  }
};

export default config;
