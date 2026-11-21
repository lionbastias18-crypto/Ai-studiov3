import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [tailwindcss(), react()],
      build: {
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('three') || id.includes('@react-three') || id.includes('three-stdlib')) {
                  return 'three-bundle';
                }
                return 'vendor';
              }
            }
          }
        }
      },
      resolve: {
        dedupe: ['react', 'react-dom', 'three'],
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
