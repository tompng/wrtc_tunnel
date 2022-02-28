import * as readline from 'readline'
const reader = readline.createInterface({ input: process.stdin })
const buffer: string[] = []
const callbacks: ((text: string) => void)[] = []
reader.on('line', line => {
  const cb = callbacks.shift()
  if (cb) {
    cb(line)
  } else {
    buffer.push(line)
  }
})
export async function readLine(prompt?: string) {
  if (prompt) process.stdout.write(prompt)
  const line = buffer.shift()
  if (line) return line
  return new Promise<string>(resolve => {
    callbacks.push(resolve)
  })
}
