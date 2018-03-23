
const {genPlaylist} = require('./module-common.js');
const {JpegsPcmFromFile} = require('./module-transcode.js');

module.exports = class AdvertiseBox
{
	constructor( config, imageCallback, pcmCallback ) 
	{
		this.config = config;
		this.imageCallback = imageCallback;
		this.pcmCallback = pcmCallback;
		this.size = this.config.size;
		this.active = false;
		this.onlineList = {};
		this.disableList = [];
		this.file2Play = []
		this.nowLoop = this.config.loop;
		this.nowOrder = this.config.order;
		this.ownerName = this.constructor.name;

		this.defaultCmdObj = {
			disableList: [], 
			order: this.nowOrder,
			loop: this.nowLoop
		};

		genPlaylist( this.config.src, [], this.nowOrder, ollist=>{
			this.onlineList	= ollist;
		});
	}

	start( cmdObj, callback )
	{
		this.active = true;
		cmdObj = cmdObj || this.defaultCmdObj;

		if (cmdObj.internalCall !== true) {
			this.file2Play.length = 0;
			this.source && this.source.stop();
		}

		if (this.file2Play.length === 0) {
			genPlaylist( this.config.src, cmdObj.disableList, cmdObj.order, list => {
				this.file2Play = list;
				setImmediate( ()=> {
					cmdObj.internalCall = true;
					this.active && this.start( cmdObj );
				});
			});
			
			this.disableList = cmdObj.disableList;
			this.nowLoop = cmdObj.loop;
			this.nowOrder = cmdObj.order;
			return;
		}

		let mp4File = this.file2Play.shift();
		do {
			if (mp4File) break;

			if (cmdObj.loop !== 'yes') {
				this.stop();
				return;
			}

			setImmediate( ()=>{
				this.active && this.start( cmdObj );
			});
			return;
		} while(false);

		console.log(this.ownerName + ' advertise: ', mp4File);

		this.source = new JpegsPcmFromFile( this.config, mp4File, 
			this.feedImageProxy.bind(this),
			this.feedPcmProxy.bind(this),
			()=>{
				if ( ! this.active ) {
					return;
				}
				setImmediate( ()=>{
					cmdObj.internalCall = true;
					this.active && this.start( cmdObj );
				});
		}).start( callback );
	}

	feedImageProxy( jpeg ) 
	{
		this.active && this.imageCallback( jpeg );
	}

	feedPcmProxy( chunk ) 
	{
		this.active && this.pcmCallback( chunk );
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
