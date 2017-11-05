
const {JpegsFromWebCamera} = require('./base.js');

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

	start( url )
	{
		this.source = new JpegsFromWebCamera( url, this.feedProxy.bind(this) );
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
		this.source.stop();
	}

	infos () 
	{

	}
};


