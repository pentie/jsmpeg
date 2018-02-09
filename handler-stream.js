
const {JpegsToLiveRtmp, LocalToLiveRtmp} = require('./module-common.js');
const tcpPortUsed = require('tcp-port-used');

module.exports = class LiveStreamHandler 
{
	constructor(env) 
	{
		this.handlerName = 'stream';
		this.eachClient = env.get('eachClient');
		this.isCenter = env.get('isCenter');
		this.config = env.get('getConfig')();
		this.configs = env.get('configs');
		this.nodeId = env.get('nodeId');
		this.cache = env.get('newCache')();

		if (!this.isCenter) {
			console.log( this.handlerName, ' didn\'t run in center node');
			return;
		}

		this.livestream = null;
		this.livestreams = this.configs.get('livestreams');
		this.livestreams.some( (confItem) => {
			if ( confItem.name === this.config.livestream ){
				this.livestream = confItem;
				return true;
			}
			return false;
		});

		if ( ! this.livestream ) {
			console.log( 'Not found livestream config');
			return;
		}

		this.streamActived = false;
		this.retryMs = this.livestream.retryMs || 3000;
		this.streamDelay();
	}

	streamDelay( delayMs )
	{
		if(this.config.defaultSource === "localMp4") {

			this.chunker = new LocalToLiveRtmp( this.livestream, this.onStreamEnd.bind(this) );
			this.chunker.start( console.log );

		} else {

			if (delayMs === undefined) {
				setImmediate( () => {
					this.chunker = new JpegsToLiveRtmp( this.livestream, this.onStreamEnd.bind(this) );
					this.chunker.start( this.onStreamStart.bind(this) );
				});
			} else {
				setTimeout( () => {
					this.chunker = new JpegsToLiveRtmp( this.livestream, this.onStreamEnd.bind(this) );
					this.chunker.start( this.onStreamStart.bind(this) );
				}, delayMs );
			}
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

