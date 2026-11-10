import { defineConfig } from '@playwright/test'
export default defineConfig({
 testDir:'./e2e',fullyParallel:false,workers:1,reporter:'list',
 outputDir:process.env.TEMP ? `${process.env.TEMP}/lostfound-playwright` : '/tmp/lostfound-playwright',
 use:{baseURL:'http://127.0.0.1:5173',channel:'chrome',screenshot:'only-on-failure'},
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'https://school-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_testfixture',VITE_API_URL:'/api'}},
})
