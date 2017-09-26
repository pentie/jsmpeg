
var WebSocket = require('ws');

ImageFeedWebsocket= function (port)
{
	this.feed_list = new Array();
	this.socketServer = new WebSocket.Server({port: port, perMessageDeflate: false, binaryType: 'arraybuffer'});
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
				this.__onCmdRequest(socket, req);
			}
		}).bind(this));

		socket.on('error', function(err){
			console.log('image feed err: '+err);	
		});
	}).bind(this));

};

ImageFeedWebsocket.prototype.__onCmdRequest= function(socket, req) {
	req.client = socket;
	this.feed_list.push(req);
};


ImageFeedWebsocket.prototype.broadcast = function(image) {
	this.socketServer.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(image);
		}
	});
};

ImageFeedWebsocket.prototype.feed = function(image) {
	if (this.feed_list.length === 0) {
		return;
	}

	for (var index in this.feed_list) {
		let req = this.feed_list[index];

		let client = req.client;
		if (client.readyState === WebSocket.OPEN) {
			client.send(image);
		}
	}

	this.feed_list.length = 0;
};


module.exports = function(port){
	return new ImageFeedWebsocket(port);
};


