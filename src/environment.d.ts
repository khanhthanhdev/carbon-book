declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET: string
      DATABASE_URL: string
      GOOGLE_GENERATIVE_AI_API_KEY: string
      UPSTASH_VECTOR_REST_URL: string
      UPSTASH_VECTOR_REST_TOKEN: string
      UPSTASH_VECTOR_NAMESPACE?: string
      NEXT_PUBLIC_SERVER_URL: string
      VERCEL_PROJECT_PRODUCTION_URL: string
      CRON_SECRET?: string
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
