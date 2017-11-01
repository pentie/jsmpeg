
class GifsHandler 
{
	constructor(env) {
		this.handlerName = 'gifs';
		this.nodeId = env.get('nodeId');
		this.eachClient = env.get('eachClient');
		//this.chunkHead = 0xFFD8;	
		this.feed_list = new Array();
		this.upstreamLastTime = Date.now();
	}

	onUpConnect (socket) 
	{
		let nowTime = Date.now();

		socket.send(JSON.stringify({
			userId: this.nodeId,
			handler: this.handlerName,
			cmd: 'active',
			req_time: nowTime - this.upstreamLastTime,
			draw_time: 0
		}));

		this.upstreamLastTime = nowTime;
	}

	onUpResponse (chunk, socket) {
		this.downstream(chunk);
	}

	feed (chunk) {
		this.downstream (chunk);
	}

	downstream (chunk) {
		if (this.feed_list.length === 0) {
			return;
		}
	
		this.eachClient(function each(client) {
			client.send(chunk);
		}, this.feed_list);

		this.feed_list.length = 0;
	}

	onDownConnect (socket) {
	}

	onDownRequest (socket, req) {
		let userId = req.userId;
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

module.exports = GifsHandler;

