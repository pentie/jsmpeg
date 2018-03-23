
module.exports = class MJpegHandler 
{
	constructor(env) 
	{
		this.handlerName = 'mjpeg';
		this.nodeId = env.get('nodeId');
		this.isCenter = env.get('isCenter');
		this.config = env.get('getConfig')();
		this.cache = env.get('newCache')();
		this.eachClient = env.get('eachClient');
		this.feedList = new Array();
		this.upstreamLastTime = Date.now();

		this.interval = this.config.mjpegUpdateInterval? parseInt(this.config.mjpegUpdateInterval) : 100;
	}

	http( req, res )
	{
		res.json({ status: 'ok', message: this.handlerName + ' handler responses' });
	}

	infos () 
	{
		let activeCount = this.cache.keys().length;
		return {
			mjpegClientCount: activeCount,
			mjpegActiveCount: activeCount
		};
	}

	onUpConnect( client ) 
	{
		this.requestNextJpeg( client, 'active');
	}

	requestNextJpeg ( client, cmd ) 
	{
		let nowTime = Date.now();

		client.send(JSON.stringify({
			userId: this.nodeId,
			handler: this.handlerName,
			cmd: cmd,
			req_time: nowTime - this.upstreamLastTime,
			draw_time: 0
		}));

		this.upstreamLastTime = nowTime;
	}

	onUpResponse( chunk, client ) 
	{
		this.downstream( chunk, client.downClients );

		setTimeout( (param)=>{
			this.requestNextJpeg( param, 'interval');
		}, this.interval, client);
	}

	feedImage( chunk ) 
	{
		this.downstream( chunk );
	}

	downstream( chunk, downClients ) 
	{
		if (this.feedList.length === 0) {
			return;
		}

		this.eachClient(( socket ) => {
			let index = this.feedList.indexOf( socket.uuid );

			if (index !== -1) {
				// ! this.isCenter && console.log(chunk);
				socket.send( chunk );
				delete this.feedList[index];
			}
		}, downClients );
	}

	onDownRequest (socket, req) 
	{
		let userId = req.userId;
		this.cache.set(userId, Date.now(), 5);

		 switch (req.cmd) {
		 	case 'active':
			case 'interval':
				// ! this.isCenter && console.log(req);

				if ( this.feedList.indexOf( socket.uuid ) === -1 ) {
					this.feedList.push(socket.uuid);
				}
				break;

			default:
				console.log('cmd not handled: ', req);
		 }
	}

};


