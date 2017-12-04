
const configs = require('config').get('playerNodes');
const MPlayer = require('mplayer');

configs.forEach( function( config ) {
	let cmdlineArgs = [
		'-vo x11 -screen '+ config.screen,
		'-fs -zoom',
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


