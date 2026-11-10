import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { validatePublicEnvironment } from './shared/config'
export default defineConfig(({mode})=>{
 const errors=validatePublicEnvironment({...loadEnv(mode,process.cwd(),''),...process.env})
 if(errors.length)throw new Error(errors.join('\n'))
 return {plugins:[react(),tailwindcss()],server:{proxy:{'/api':'http://127.0.0.1:3001'}}}
})
