
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

		this.mjpegName = this.config.mjpegStreamName? this.config.mjpegStreamName : 'seed.mjpeg';
		this.mjpeUrl= '/mjpeg/' + this.mjpegName;
		this.mjpegBoundary = 'MjpegBoundary';
		this.mjpegAudience = new Array();

		this.interval = this.config.mjpegUpdateInterval? parseInt(this.config.mjpegUpdateInterval) : 100;
	}

	http( req, res )
	{
		if (req.url !== this.mjpeUrl ) {
			res.json({status: 'error', error: 'command error.'});
			return;
		}

		this.mjpegStream( req, res );
	}

	feedMjpegStream( jpeg ) 
	{
		if (this.mjpegAudience.length === 0) {
			return;
		}

		let content = Buffer(jpeg);
		let head =  '--' + this.mjpegBoundary + "\r\n" +
			"Content-Type: image/jpeg\r\n" + 
			"Content-Length: " + content.length + "\r\n\r\n";

		this.mjpegAudience.forEach( function( res ) {
			res.write( head );
			res.write( content, 'binary');
			res.write("\r\n");
		});
	}

	mjpegStream( req, res )
	{
		let self = this;
		self.mjpegAudience.push( res );

		res.writeHead(200, {
			'Content-Type': 'multipart/x-mixed-replace;boundary=' + self.mjpegBoundary,
			'Connection': 'keep-alive',
			'Expires': 'Mon, 01 Jul 1980 00:00:00 GMT',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache'
		});

		res.socket.on('close', function () {
			console.log('exiting mjpeg client!');
			self.mjpegAudience.splice(self.mjpegAudience.indexOf(res), 1);
		});
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

	feed (chunk) 
	{
		this.downstream (chunk);
	}

	downstream( chunk, downClients ) 
	{
		this.feedMjpegStream( chunk );

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


