import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize for faster First Contentful Paint
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Create smaller, more focused chunks for better loading
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@radix-ui')) {
              return 'ui-vendor';
            }
            if (id.includes('@fullcalendar')) {
              return 'calendar-vendor';
            }
            if (id.includes('date-fns') || id.includes('luxon')) {
              return 'date-vendor';
            }
            if (id.includes('@supabase') || id.includes('@tanstack')) {
              return 'data-vendor';
            }
            return 'vendor';
          }
        },
        // Optimize file naming for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Optimize build settings for performance
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: false
  }
}));
