const argv = require('minimist')(process.argv.slice(2));
const {wsClient} = require('./module-wsClient.js');
const {PcmFromFile, JpegsPcmFromFile} = require('./module-transcode.js');

let host = argv.host? argv.host : 'localhost:8080';
let mode = argv.mode? argv.mode: 'audio';
let input = argv.input? argv.input : __dirname + '/public/media/mp3/clapping.mp3';
let interval = 300;

let pcmClient = wsClient( 'ws://'+host+'/stream/pcm', interval, (data)=> {
	if ( data === null ) {
		console.log( 'pcm client connected' );
		return;
	}
	console.log( data );
});

let mjpegClient = wsClient( 'ws://'+host+'/stream/mjpeg', interval, (data)=> {
	if ( data === null ) {
		console.log( 'mjpeg client connected' );
		return;
	}
	console.log( data );
});

let source;

source = new PcmFromFile( null, input, pcmClient.send.bind(pcmClient), (msg)=>{
	console.log('finish ' + msg);
}).start((cmdline)=>{
	console.log(cmdline);
});
return;
//-------------------------------------

source = new MjpegPcmFromFile( null, 
	input,
	data=>mjpegClient.send(data),
	data=>pcmClient.send(data)
).start(()=>{
	console.log('pushing ' + input );
});

return;
//-------------------------------------







