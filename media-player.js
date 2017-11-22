
const configs = require('config').get('playerNodes');
const MPlayer = require('mplayer');
const Frambuffer = require('framebuffer');

configs.forEach( function( config ) {
	let fb = new Frambuffer( config.fbdev );
	let xres = fb.xres;
	delete fb;

	let cmdlineArgs = [
		'-vo fbdev2:'+ config.fbdev,
		'-vf scale -zoom -xy '+xres,
		'-nocache',
		'-demuxer lavf'
	].join(' ');

	let player = new MPlayer({ 
		debug: config.debug, 
		verbose: config.verbose, 
		args: cmdlineArgs
	});

	player.openFile( config.url );
	player.play();
});


