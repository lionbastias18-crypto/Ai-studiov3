import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.infdev.voxelengine',
  appName: 'Infdev Mobile Voxel Engine',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
