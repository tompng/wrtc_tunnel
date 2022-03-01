class TimeoutHash
  attr_reader :timeout

  def initialize(timeout)
    @timeout = timeout
    @hash = {}
    @cnt = 0
  end

  def cleanup
    @cnt += 1
    return if @cnt < @hash.size / 2
    current = Time.now
    @cnt = 0
    @hash.select! { |_k, (_v, t)| current - t < timeout }
  end

  def [](key)
    cleanup
    value, time = @hash[key]
    value if time && Time.now - time < timeout
  end

  def []=(key, value)
    cleanup
    @hash[key] = [value, Time.now]
  end
end
