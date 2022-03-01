import * as http from 'http'
import * as https from 'https'

const mailboxReadURL = 'http://localhost:4567/read'
const mailboxSendURL = 'http://localhost:4567/send'

async function request(url: string, data?: Record<string, string>) {
  const h = (url.startsWith('https') ? https : http)
  return new Promise<string>((resolve, reject) => {
    const callback = (response: http.IncomingMessage) => {
      const chunks: string[] = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(chunks.join('')))
    }
    if (!data) {
      h.get(url, callback).on('error', reject)
    } else {
      const option = { method: 'POST' }
      const req = h.request(url, option, callback)
      req.on('error', reject)
      req.write(JSON.stringify(data))
      req.end()
    }
  })
}

export async function readMailbox(id: string) {
  try {
    const url = `${mailboxReadURL}/${id}`
    return request(url)
  } catch(e) {
    console.log(e)
  }
}

export async function sendMailbox(to: string, data: string) {
  try {
    const url = `${mailboxSendURL}/${to}`
    await request(url, { data })
    return true
  } catch(e) {
    console.log(e)
    return false
  }
}
