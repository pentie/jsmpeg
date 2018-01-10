
const {JpegsFromWebCamera} = require('./common-modules.js');
const tcpPortUsed = require('tcp-port-used');
const url = require('url');

module.exports = class WebCameraSource
{
	constructor(env) 
	{
		this.sourceName = 'webCamera';
		this.feed = env.get('feed');
		this.activeSource = env.get('activeSource');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.active = false;

		this.defaultCmdObj = {
			url: this.config.src[0]
		};

		if (this.config.autoStart === true) {
			this.start();
		}
	}

	list() 
	{
		return {
			name: this.sourceName,
			active: this.active,
			caption: this.config.caption,
			src: this.config.src
		};
	}

	start( cmdObj, callback )
	{
		if (cmdObj === undefined) {
			cmdObj = this.defaultCmdObj;
		} else {
			if (cmdObj.url) {
				this.defaultCmdObj = cmdObj ;
			} else {
				cmdObj = this.defaultCmdObj;
			}
		}

		this.source = new JpegsFromWebCamera( this.config, cmdObj.url, this.feedProxy.bind(this), ()=>{
			this.source && this.source.stop();
			this.onWebCameraShutdown();
		});
		this.source.start( callback );
		this.active = true;
	}

	onWebCameraShutdown()
	{
		this.activeSource('advertise');

		let urlObj = url.parse(this.defaultCmdObj.url);
		tcpPortUsed.waitUntilUsedOnHost( parseInt(urlObj.port), urlObj.hostname, this.config.retryTimeMs, this.config.timeOutMs )
		.then( ()=> {
			this.defaultCmdObj.sourceName = this.sourceName;
			this.activeSource( this.defaultCmdObj, (ffmpegCmd) => {
				console.log('webcam is back, playing: ', ffmpegCmd);
			});
			console.log(`Port ${urlObj.port} on ${urlObj.hostname} is now in use.`);
		}, (err)=> {
			console.log('tcpPortUsed error:', err.message);
		});
	}

	feedProxy( jpeg ) 
	{
		this.active && this.feed( jpeg );
	}

	pause ()
	{
		this.active = false;
	}

	resume ()
	{
		this.active = true;
	}

	stop ()
	{
		this.active = false;
		this.source && this.source.stop();
	}
};


