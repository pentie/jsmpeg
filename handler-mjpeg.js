
module.exports = class MJpegHandler 
{
	constructor(env) 
	{
		this.handlerName = 'mjpeg';
		this.nodeId = env.get('nodeId');
		this.cache = env.get('newCache')();
		this.eachClient = env.get('eachClient');
		this.chunkHead = 0xFFD8;	
		this.feed_list = new Array();
		this.upstreamLastTime = Date.now();
	}

	infos () 
	{
		let activeCount = this.cache.keys().length;
		return {
			mjpegClientCount: activeCount,
			mjpegActiveCount: activeCount
		};
	}

	onUpConnect (socket, cmd = 'active') 
	{
		let nowTime = Date.now();

		socket.send(JSON.stringify({
			userId: this.nodeId,
			handler: this.handlerName,
			cmd: cmd,
			req_time: nowTime - this.upstreamLastTime,
			draw_time: 0
		}));

		this.upstreamLastTime = nowTime;
	}

	onUpResponse (chunk, socket) 
	{
		this.downstream(chunk);

		setTimeout(function(){
			this.onUpConnect(socket, 'interval');
		}.bind(this), 100);
	}

	feed (chunk) 
	{
		this.downstream (chunk);
	}

	downstream (chunk) 
	{
		if (this.feed_list.length === 0) {
			return;
		}

		this.eachClient(function each(client) {
			client.send(chunk);
		}, this.feed_list);

		this.feed_list.length = 0;
	}

	onDownConnect (socket) 
	{
	}

	onDownRequest (socket, req) 
	{
		let userId = req.userId;
		this.cache.set(userId, Date.now(), 5);

		 switch (req.cmd) {
		 	case 'active':
				console.log(req);
			case 'interval':
				this.feed_list.push(socket);
				break;

			default:
				console.log('cmd not handled: ', req);
		 }
	}

};


