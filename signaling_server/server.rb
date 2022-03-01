require 'sinatra'
require_relative './util'

set :server, :puma

timeout = 30
hash = TimeoutHash.new timeout

post '/write/:key' do
  key = params[:key].to_s
  data = request.body.read
  hash[key] = data unless key.empty? || data.empty?
end

get '/read/:key' do
  hash[params[:key]].to_s
end
