
var WebSocket = require('ws');

class MJpegHandler 
{
	constructor(env) {
		this.handlerName = 'mjpeg';
		this.nodeId = env.get('nodeId');
		this.chunkHead = 0xFFD8;	
		this.feed_list = new Array();
		this.upstreamLastTime = Date.now();
	}

	onUpConnect (socket) 
	{
		let nowTime = Date.now();

		socket.send(JSON.stringify({
			user_id: this.nodeId,
			handler: this.handlerName,
			cmd: 'active',
			req_time: nowTime - this.upstreamLastTime,
			draw_time: 0
		}));

		this.upstreamLastTime = nowTime;
	}

	onUpResponse (chunk, socket) {
		this.downstream(chunk);
		this.onUpConnect(socket);
	}

	feed (chunk) {
		this.downstream (chunk);
	}

	downstream (chunk) {
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

	onDownConnect (socket) {
	}

	onDownRequest (socket, req) {
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

}

module.exports = MJpegHandler;

