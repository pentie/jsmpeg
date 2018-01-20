
const {JpegsToLiveRtmp} = require('./module-common.js');
const tcpPortUsed = require('tcp-port-used');

module.exports = class LiveStreamHandler 
{
	constructor(env) 
	{
		this.handlerName = 'stream';
		this.eachClient = env.get('eachClient');
		this.isCenter = env.get('isCenter');
		this.config = env.get('getConfig')();
		this.nodeId = env.get('nodeId');
		this.cache = env.get('newCache')();
		this.livestreams = this.config.livestreams || { active: false };
		this.streamActived = false;
		this.retryMs = this.livestreams.retryMs || 3000;

		if (!this.isCenter) {
			console.log( this.handlerName, ' didn\'t run in center node');
			return;
		}

		if (this.livestreams.active !== true) {
			console.log( 'Not found livestream config');
			return;
		}

		this.streamDelay();
	}

	streamDelay( delayMs )
	{
		if (delayMs === undefined) {
			setImmediate( () => {
				this.chunker = new JpegsToLiveRtmp( this.livestreams, this.onStreamEnd.bind(this) );
				this.chunker.start( this.onStreamStart.bind(this) );
			});
		} else {
			setTimeout( () => {
				this.chunker = new JpegsToLiveRtmp( this.livestreams, this.onStreamEnd.bind(this) );
				this.chunker.start( this.onStreamStart.bind(this) );
			}, delayMs );
		}
	}

	onStreamStart( cmdline )
	{
		this.streamActived = true;
		console.log('live stream: ', cmdline);
	}

	onStreamEnd( error )
	{
		this.streamActived = false;
		this.streamDelay( this.retryMs );
		console.log('live stream end, restart after ', this.retryMs );
	}

	http( req, res )
	{
		res.json({ status: 'ok', message: "stream handler responses" });
	}

	infos () 
	{
		return {
			startTime: 0,
			restartTimes: 0
		};
	}

	feed( chunk ) 
	{
		this.streamActived && this.chunker.write( chunk );
	}

	onDownRequest (socket, req) 
	{
		let userId = req.userId;
		 
		 switch (req.cmd) {
		 	case 'active':
				break;

			case 'intra':
				break;

			default:
				console.log('cmd not handled: ', req);
		 }
	}
};

