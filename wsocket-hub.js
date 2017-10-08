var WebSocket = require('ws');

class WebSocketHub 
{
	constructor(port) 
	{
		this.handlers = new Array();
		this.env = new Map(); 

		this.socketServer = new WebSocket.Server({
			port: port, 
			perMessageDeflate: false, 
			binaryType: 'arraybuffer'
		});

		this.socketServer.connectionCount = 0;

		this.socketServer.on('connection', (function(socket, upgradeReq) {
			this.socketServer.connectionCount++;
			//socket.client_id = ;
			console.log(
				'New ImageFeed Connection: ', 
				(upgradeReq || socket.upgradeReq).socket.remoteAddress,
				(upgradeReq || socket.upgradeReq).headers['user-agent'],
				'('+this.socketServer.connectionCount+' total)'
			);

			socket.on('close', (function(code, message){
				this.socketServer.connectionCount--;
				console.log(
					'Disconnected ImageFeed('+this.socketServer.connectionCount+' total)'
				);
			}).bind(this));

			socket.on('message', (function(dataStr){
				let req = null;
				try {
					req = JSON.parse(dataStr);
				} catch (e) {
				}

				if (req) {
					this.onClientRequest (socket, req);
				}
			}).bind(this));

			socket.on('error', function(err){
				console.log('image feed err: '+err);	
			});

			this.handlers.forEach(function(handler) {
				if (typeof handler.onConnect === "function") { 
					handler.onConnect(socket);
				}
			});

		}).bind(this));

		this.env.set('server', this.socketServer);
		this.env.set('eachClient', this.eachClient.bind(this));
	}


	feed (chunk) 
	{
		this.handlers.forEach(function(handler) {
			if (typeof handler.feed === "function") { 
				handler.feed(chunk);
			}
		});
	}

	onClientRequest (socket, req)
	{
		this.handlers.some(function(handler) {
			if (handler.handlerName !== req.handler) {
				return false;
			}

			do {
				if (typeof handler.onRequest !== "function") break;
				if (!req.hasOwnProperty('cmd')) break;
				if (!req.hasOwnProperty('user_id')) break;
				handler.onRequest(socket, req);
			} while (false);
			return true;
		});
	}

	addHandler (Handler) 
	{
		this.handlers.push(new Handler(this.env));
	}

	eachClient (callback) 
	{
		this.socketServer.clients.forEach(function each(client) {
			if (client.readyState === WebSocket.OPEN) {
				callback(client);
			}
		});

	}

	broadcast (chunk) 
	{
		this.socketServer.clients.forEach(function each(client) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(chunk);
			}
		});
	}
}

module.exports = WebSocketHub;
