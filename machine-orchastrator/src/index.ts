import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import getCache from './cache.js'
import { getASGInstancesMetrics } from './asg.js';

const app = new Hono()

// interval work
async function refreshASG(){
  const cache = await getCache()
}

app.get('/', (c) => {
  getASGInstancesMetrics().then(console.log)
  return c.text('Hello Hono!')
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
