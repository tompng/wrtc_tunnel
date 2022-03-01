import * as http from 'http'
import * as https from 'https'

async function request(url: string, data?: string) {
  const h = (url.startsWith('https') ? https : http)
  return new Promise<string>((resolve, reject) => {
    const callback = (response: http.IncomingMessage) => {
      const chunks: string[] = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(chunks.join('')))
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
  readURL: 'http://localhost:4567/read',
  writeURL: 'http://localhost:4567/write',
  async read(id: string) {
    try {
      const url = `${this.readURL}/${id}`
      return request(url)
    } catch(e) {
      console.log(e)
    }
  },
  async write(key: string, value: string) {
    try {
      const url = `${this.writeURL}/${key}`
      await request(url, value)
      return true
    } catch(e) {
      console.log(e)
      return false
    }
  }
}
