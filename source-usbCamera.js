
const {JpegsFromUsbCamera} = require('./common-modules.js');

module.exports = class UsbCameraSource
{
	constructor( env ) 
	{
		this.sourceName = 'usbCamera';
		this.feed = env.get('feed');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.size = this.config.size;
		this.active = false;

		if (this.config.autoStart === true) {
			this.start( {devPath: this.config.src[0] });
		}
	}

	list() 
	{
		return {
			name: this.sourceName,
			caption: this.config.caption,
			active: this.active,
			src: this.config.src
		};
	}

	start( cmdObj, callback )
	{
		let devPath = cmdObj.devPath;
		if (!devPath) {
			callback(null);
			return;
		}

		this.source = new JpegsFromUsbCamera( this.config, devPath, this.feedProxy.bind(this) );
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
