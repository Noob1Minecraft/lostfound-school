import { createVercelApp } from '../server/vercel.ts'

// No listener, startup network requests, credentials in responses, or user state.
export default createVercelApp(process.env)
