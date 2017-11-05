
var ffmpeg = require('fluent-ffmpeg');
var PassThroughStream = require('stream').PassThrough;
var net = require('net');

const SOI = new Buffer([0xff, 0xd8]);
const EOI = new Buffer([0xff, 0xd9]);

class MjpegStreamToJpegs
{
	constructor( jpegCallback ) 
	{
		if (!Buffer.prototype['indexOf']) bufferTools.extend();
		this.jpegCallback = jpegCallback;
		this._buffer = null;
	}

	checkpoint( chunk ) 
	{
		let image = null;
		let imgStart, imgEnd;
		while (chunk) {
			if (this._buffer === null) {
				chunk = -1 != (imgStart = chunk.indexOf(SOI)) ? chunk.slice(imgStart) : null;
				if (chunk) this._buffer = new Buffer(0);
				continue;
			}

			if (-1 != (imgEnd = chunk.indexOf(EOI))) {
				imgEnd += EOI.length;
				image = Buffer.concat([this._buffer, chunk.slice(0, imgEnd)]);
				this.jpegCallback(image);
				this._buffer = null;
				chunk = chunk.slice(imgEnd);
				continue;
			}

			this._buffer = Buffer.concat( [this._buffer, chunk] );
			chunk = null;
		}
	}

	flush() {
		this._buffer = null;
	}
}

class ChunksFromFFmpegBase
{
	constructor( chunksCallback ) 
	{
		this.output = new PassThroughStream();
		this.output.on('data', chunksCallback );
		this.output.on('error', this.onError.bind(this));
	}

	onFFmepgEnd () {
		console.log( this.constructor.name, ': Processing finished !');
	}

	onError (err) {
		console.log( this.constructor.name, 'error occurred: ' + err.message);
	}
}

class JpegsFromFFmpegBase extends ChunksFromFFmpegBase
{
	constructor( jpegsCallback ) 
	{
		let extractor = new MjpegStreamToJpegs( jpegsCallback );
		super( function(chunk) {
			extractor.checkpoint(chunk);
		});
	}
}

class JpegsFromMp4File extends JpegsFromFFmpegBase
{
	constructor( mp4File, jpegsCallback, endCallback ) 
	{
		super(jpegsCallback);
		this.mp4File = mp4File;
		this.endCallback = endCallback;
	}

	start () 
	{
		this.command = ffmpeg()
			.input( this.mp4File )
			.native()
			.output( this.output )
			.outputOptions(['-f mjpeg', '-c:v mjpeg'])
			.outputFps(30)
			.on('error', this.onError.bind(this))
			.on('end', this.endCallback )
			.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

class JpegsFromWebCamera extends JpegsFromFFmpegBase
{
	constructor( url, jpegsCallback ) 
	{
		super(jpegsCallback);
		this.url = url;
	}

	start () 
	{
		this.command = ffmpeg()
			.input(this.url)
			.output(this.output)
			.outputOptions(['-f mjpeg', '-c:v copy'])
			.outputFps(30)
			.on('error', this.onError.bind(this))
			.on('end', this.onFFmepgEnd.bind(this))
			.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

class JpegsFromUsbCamera extends JpegsFromFFmpegBase
{
	constructor( devPath, jpegsCallback ) 
	{
		super( jpegsCallback );
		this.devPath = devPath;
	}

	start () 
	{
		this.command = ffmpeg()
			.input(this.devPath)
			.inputOptions( ['-f v4l2', '-input_format mjpeg'] )
			.output(this.output)
			.outputOptions(['-f mjpeg', '-c:v copy'])
			.outputFps(30)
			.on('error', this.onError.bind(this))
			.on('end', this.onFFmepgEnd.bind(this))
			.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

class Mpeg1tsFromJpegs extends ChunksFromFFmpegBase
{
	constructor( mpegtsCallback, qscale=8 ) 
	{
		super( mpegtsCallback );
		this.qscale = qscale;
		
		this.input = new PassThroughStream();
		this.input.on('error', this.onError.bind(this));
	}

	write( chunk ) {
		this.input.write(chunk);	
	}

	start () 
	{
		this.command = ffmpeg()
			.input(this.input)
			.inputFormat('mjpeg')
			.output(this.output)
			.outputOptions(['-f mpegts', '-c:v mpeg1video', '-q:v '+ this.qscale, '-bf 0'])
			.outputFps(30)
			.on('error', this.onError.bind(this))
			.on('end', this.onFFmepgEnd.bind(this))
			.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

module.exports = {
	JpegsFromWebCamera,
	JpegsFromUsbCamera,
	JpegsFromMp4File,
	Mpeg1tsFromJpegs
};
