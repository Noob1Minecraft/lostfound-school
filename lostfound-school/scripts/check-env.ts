import { loadEnv } from 'vite'
import { validateEnvironment } from '../shared/config.ts'
import { readFileSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'
// Read Vite's actual env precedence as well as the API's Node .env values.
const server={...(existsSync('.env')?parseEnv(readFileSync('.env','utf8')):{}),...process.env}
const browser=loadEnv(process.env.NODE_ENV==='production'?'production':'development',process.cwd(),'VITE_')
const errors=validateEnvironment({...server,...browser})
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1}
else console.log('Environment structure valid. Values are redacted. Run staging integration tests to verify connectivity and key validity.')
