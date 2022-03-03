import * as http from 'http'
import * as https from 'https'

async function request(url: string, data?: string) {
  const h = (url.startsWith('https') ? https : http)
  return new Promise<string>((resolve, reject) => {
    const callback = (response: http.IncomingMessage) => {
      const chunks: string[] = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(chunks.join('')))
      response.on('error', reject)
    }
    if (data == null) {
      h.get(url, callback).on('error', reject)
    } else {
      const option = { method: 'POST' }
      const req = h.request(url, option, callback)
      req.on('error', reject)
      req.write(data)
      req.end()
    }
  })
}

export const KVS = {
  baseURL: 'http://localhost:4567',
  async read(id: string) {
    try {
      const url = `${this.baseURL}/read/${id}`
      return await request(url)
    } catch(e) {
      return null
    }
  },
  async write(key: string, value: string) {
    try {
      const url = `${this.baseURL}/write/${key}`
      await request(url, value)
      return true
    } catch(e) {
      return false
    }
  }
}
