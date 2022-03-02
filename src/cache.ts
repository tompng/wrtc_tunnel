export class TimeoutCache<Key, Value> {
  candidates = new Set<Key>()
  livings = new Set<Key>()
  data = new Map<Key, Value>()
  value2key?: Map<Value, Key>
  ondelete?: (key: Key, value: Value) => void
  timer: NodeJS.Timer | null = null
  constructor(timeout: number, reverseGet = false) {
    this.timer = setInterval(() => this.cleanup(), timeout)
    if(reverseGet) this.value2key = new Map()
  }
  terminate() {
    for (const [key, value] of this.data) this.ondelete?.(key, value)
    if (this.timer) clearInterval(this.timer)
    this.candidates.clear()
    this.livings.clear()
    this.data.clear()
    this.value2key?.clear()
    this.timer = null
  }
  has(key: Key) {
    return this.data.has(key)
  }
  get(key: Key, touch = false) {
    if (touch) this.touch(key)
    return this.data.get(key)
  }
  hasValue(value: Value) {
    return !!this.value2key?.has(value)
  }
  getKey(value: Value, touch = false) {
    const key = this.value2key?.get(value)
    if (touch && this.value2key?.has(value)) this.touch(key!)
    return key
  }
  reverseGet(value: Value) {
    this.value2key?.get(value)
  }
  touch(key: Key) {
    if (this.candidates.delete(key)) this.livings.add(key)
  }
  set(key: Key, value: Value) {
    this.candidates.delete(key)
    this.livings.add(key)
    if (this.value2key) {
      if (this.data.has(key)) {
        const oldValue = this.data.get(key)!
        this.value2key.delete(oldValue)
      }
      this.value2key.set(value, key)
    }
    this.data.set(key, value)
  }
  cleanup() {
    const { data } = this
    for (const key of this.candidates) {
      this.ondelete?.(key, data.get(key)!)
      data.delete(key)
    }
    this.candidates = this.livings
    this.livings = new Set()
  }
}