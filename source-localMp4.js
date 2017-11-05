
const resolve = require('path').resolve;
const dir = require('node-dir');
const {JpegsFromMp4File} = require('./base.js');

module.exports = class LocalMp4Source
{
	constructor( env ) 
	{
		this.sourceName = 'localMp4';
		this.feed = env.get('feed');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.active = false;

		this.file2Play = this.getMp4Files( this.config.src );
		if (this.config.autoStart === true) {
			this.start();
		}
	}

	start()
	{
		let mp4File = this.file2Play.shift();

		if (mp4File === undefined) {
			if (this.config.loop === 'yes') {
				this.file2Play = this.getMp4Files( this.config.src );
				mp4File = this.file2Play.shift();
			} else {
				return this.stop();
			}
		}

		this.source = new JpegsFromMp4File( mp4File, this.feedProxy.bind(this), function end(){
			setImmediate( function(){
				this.start();
			}.bind(this));
		}.bind(this)).start();
		this.active = true;
	}

	getMp4Files( mp4Paths ) 
	{
		let allFiles = [];
		mp4Paths.forEach(function( mp4Path) {
			mp4Path = resolve( mp4Path );
			let files = dir.files( mp4Path, {sync:true} );
			files = files.filter(function(fileName) {
				return /mp4$/.test(fileName);
			});
			allFiles = allFiles.concat(files);
		});
		return allFiles;
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
