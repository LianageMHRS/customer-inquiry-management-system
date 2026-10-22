import { env } from './config/env.js'
import { createApp } from './app.js'

const app = createApp()

app.listen(env.PORT, () => {
  process.stdout.write(`API listening on http://localhost:${env.PORT}\n`)
})
