
const WebSocket = require('ws');

function wsClient(url, interval, recv) 
{
	var WSClient = function() {
		this.url = url;
		this.interval = interval;
		this.reconnectTimeoutId = 0;
		this.recv = recv;
	};

	WSClient.prototype.start = function() {
		this.socket = new WebSocket(this.url, {
			perMessageDeflate: false
		});

		this.socket.binaryType = 'nodebuffer';

		this.socket.on('message', function incoming(data) {
			this.recv(data);
		}.bind(this));

		this.socket.on('open', function open(){
			this.recv(null);
		}.bind(this));

		this.socket.on('error', this.onClose.bind(this));
		this.socket.on('close', this.onClose.bind(this));
		return this;
	};

	WSClient.prototype.onClose = function(ev) {
		clearTimeout(this.reconnectTimeoutId);
		this.reconnectTimeoutId = setTimeout(function(){
			this.start();	
		}.bind(this), this.interval);
	};

	WSClient.prototype.send = function(data) {
		if (this.socket.readyState === WebSocket.OPEN) {
			this.socket.send(data);
		}
	};

	return new WSClient().start();
}

module.exports = {
	wsClient
};
