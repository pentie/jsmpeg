
const {JpegsFromUsbCamera} = require('./base.js');

module.exports = class UsbCameraSource
{
	constructor( env ) 
	{
		this.sourceName = 'usbCamera';
		this.feed = env.get('feed');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.active = false;

		if (this.config.autoStart === true) {
			this.start(this.config.src[0]);
		}
	}

	start( devPath )
	{
		this.source = new JpegsFromUsbCamera( devPath, this.feedProxy.bind(this) );
		this.source.start();
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
