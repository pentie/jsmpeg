
var WebSocket = require('ws');
var WebSocketServer = require('./wsocket-relay.js');


class MJpegHandler 
{
	constructor(env) {
		this.handlerName = 'mjpeg';
		this.feed_list = new Array();
	}

	onConnect (socket) {
	}

	onRequest (socket, req) {
		let user_id = req.user_id;
		 
		 switch (req.cmd) {
		 	case 'active':
			case 'interval':
				this.feed_list.push(socket);
				break;

			default:
				console.log('cmd not handled: ', req);
		 }
	}

	feed (chunk) {
		if (this.feed_list.length === 0) {
			return;
		}

		for (var index in this.feed_list) {
			let client = this.feed_list[index];
			if (client.readyState === WebSocket.OPEN) {
				client.send(chunk);
			}
		}
		this.feed_list.length = 0;
	}
}

module.exports = MJpegHandler;

