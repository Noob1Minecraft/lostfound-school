import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export default defineConfig({
 testDir:'./e2e-neon',workers:1,reporter:'list',outputDir:join(tmpdir(),'lostfound-neon-playwright'),
 use:{channel:'chrome',baseURL:'http://127.0.0.1:5175',screenshot:'only-on-failure'},
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort',url:'http://127.0.0.1:5175',reuseExistingServer:false,env:{VITE_AUTH_PROVIDER:'neon',VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:'',VITE_API_URL:'/api'}},
})
