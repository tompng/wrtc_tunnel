require 'sinatra'
require_relative './util'

set :server, :puma

timeout = 500
mailbox = TimeoutHash.new timeout

post '/send/:to' do
  id = params[:to].to_s
  data = JSON.parse(request.body.read)['data']
  p [id, data]
  mailbox[id] = data unless id.empty? || data.empty?
end

get '/read/:id' do
  mailbox[params[:id]].to_s
end
