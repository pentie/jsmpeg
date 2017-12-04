
const {JpegsFromWebCamera} = require('./common-modules.js');

module.exports = class WebCameraSource
{
	constructor(env) 
	{
		this.sourceName = 'webCamera';
		this.feed = env.get('feed');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.active = false;

		if (this.config.autoStart === true) {
			this.start(this.config.src[0]);
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
		let url = cmdObj.url;
		this.source = new JpegsFromWebCamera( this.config, url, this.feedProxy.bind(this) );
		this.source.start( callback );
		this.active = true;
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


