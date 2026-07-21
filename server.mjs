import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleQuoteRequest } from './server/quote.mjs'

const app = express()
const root = path.dirname(fileURLToPath(import.meta.url))
app.use(handleQuoteRequest)
app.use(express.static(path.join(root, 'dist')))
app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
const port = Number(process.env.PORT ?? 4173)
app.listen(port, '127.0.0.1', () => console.log(`Market Range Dashboard: http://127.0.0.1:${port}`))

