let log4js = require('log4js');
log4js.configure({
  appenders: { out: { type: 'stdout', layout: { type: 'basic' } } },
  categories: { default: { appenders: [ 'out' ], level: 'debug' } }
});
const logger = log4js.getLogger();

const resolve = require('path').resolve;
const dir = require('node-dir');

const {LocalToLiveRtmp} = require('./module-transcode.js');
const allConfigs = require('config');

class Feed2RtmpPush
{
	static get name() { 
		return 'localMp4'; 
	}

	constructor( livestreamConfig ) 
	{
		this.config = livestreamConfig;
		logger.debug("config:", this.config)

		this.defaultCmdObj = { };
	}

	list()
	{
		return {
			name: this.sourceName,
			active: this.active,
			caption: this.config.caption,
			loop: this.nowLoop,
			order: this.nowOrder,
			disableList: this.disableList,
			onlineList: this.onlineList
		}
	}

	start( callback )
	{
		let cmdObj = this.defaultCmdObj;
		this.active = true;
		this.source = new LocalToLiveRtmp( this.config,
			(err, sout, serr)=>{
				logger.log("live retryMs: "+this.config.retryMs);
				setTimeout( ()=>{
					cmdObj.internalCall = true;
					this.active && this.start( cmdObj );
				}, this.config.retryMs);
			}).start( callback );
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

(function () {
	const config = allConfigs.get('livestreams')[0];
	let src = new Feed2RtmpPush(config);
	src.start((cmdline)=> { logger.info(`startd: ${cmdline}`); })
})();
