
class HttpStreamBase
{
	constructor( matchPath ) 
	{
		this.Audience = new Array();
		this.matchPath = matchPath;
	}

	addAudience( res )
	{
		this.Audience.push( res );
	}

	removeAudience( res )
	{
		this.Audience.splice(this.Audience.indexOf(res), 1);
	}

	feed( chunk )
	{
		if (this.Audience.length === 0) {
			return;
		}

		this.Audience.forEach( (res)=> {
			res.bytesProcessed += chunk.length;
			res.write( chunk );
		});
	}

	initRes( res )
	{
		this.addAudience( res );
		res.bytesProcessed = 0;

		res.socket.on('close', ()=> {
			console.log('exiting mjpeg client!');
			this.removeAudience( res );
		});
	}
}

class HttpMjpegStream extends HttpStreamBase
{
	init( req, res )
	{
		if (req.url !== this.matchPath) {
			return false;
		}

		this.initRes( res );

		res.writeHead(200, {
			'Content-Type': 'multipart/x-mixed-replace;boundary=--MjpegBoundary',
			'Connection': 'keep-alive',
			'Expires': 'Mon, 01 Jul 1980 00:00:00 GMT',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache'
		});

		return true;
	}

	feed( jpeg ) 
	{
		if (this.Audience.length === 0) {
			return;
		}

		let content = Buffer( jpeg );
		let head =  "--MjpegBoundary\r\n" +
			"Content-Type: image/jpeg\r\n" + 
			"Content-Length: " + content.length + "\r\n\r\n";

		this.Audience.forEach( (res)=> {
			res.write( head );
			res.write( content, 'binary');
			res.write("\r\n");
			res.bytesProcessed += content.length;
		});
	}
}

class HttpMp3Stream extends HttpStreamBase
{
	init( req, res )
	{
		if (req.url !== this.matchPath) {
			return false;
		}

		this.initRes( res );

		res.writeHead(200, {
			'Content-Type': 'audio/mpeg3',
			'Connection': 'keep-alive',
			'Expires': 'Mon, 01 Jul 1980 00:00:00 GMT',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache'
		});

		return true;
	}
}

class HttpWavStream extends HttpStreamBase
{
	constructor( matchPath, config={} ) 
	{
		super( matchPath );

		this.channels = config.channels || 2;
		this.sampleRate = config.sampleRate || 44100;
		this.bitDepth = config.bitDepth || 16;
		this.wavHeader = this.getWavHeader( this.channels, this.sampleRate, this.bitDepth );
	}

	init( req, res )
	{
		if (req.url !== this.matchPath) {
			return false;
		}

		this.initRes( res );

		res.writeHead(200, {
			'Content-Type': 'audio/wav',
			'Connection': 'keep-alive',
			'Expires': 'Mon, 01 Jul 1980 00:00:00 GMT',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache'
		});

		res.write( this.wavHeader );
		return true;
	}

	getWavHeader( channels, sampleRate, bitDepth )
	{
		const FORMAT_PCM = 1;
		const endianness = 'LE';
		const format = FORMAT_PCM;

		var RIFF = new Buffer('RIFF');
		var WAVE = new Buffer('WAVE');
		var fmt = new Buffer('fmt ');
		var data = new Buffer('data');
		var MAX_WAV = 4294967295 - 100;

		var headerLength = 44; 
		var dataLength = MAX_WAV;
		var fileSize = dataLength + headerLength;
		var header = new Buffer(headerLength);
		var offset = 0;

		// write the "RIFF" identifier
		RIFF.copy(header, offset);
		offset += RIFF.length;

		// write the file size minus the identifier and this 32-bit int
		header['writeUInt32' + endianness](fileSize - 8, offset);
		offset += 4;

		// write the "WAVE" identifier
		WAVE.copy(header, offset);
		offset += WAVE.length;

		// write the "fmt " sub-chunk identifier
		fmt.copy(header, offset);
		offset += fmt.length;

		// write the size of the "fmt " chunk
		// XXX: value of 16 is hard-coded for raw PCM format. other formats have
		// different size.
		header['writeUInt32' + endianness](16, offset);
		offset += 4;

		// write the audio format code
		header['writeUInt16' + endianness](format, offset);
		offset += 2;

		// write the number of channels
		header['writeUInt16' + endianness](this.channels, offset);
		offset += 2;

		// write the sample rate
		header['writeUInt32' + endianness](this.sampleRate, offset);
		offset += 4;

		// write the byte rate
		var byteRate = this.byteRate;
		if (byteRate == null) {
			byteRate = this.sampleRate * this.channels * this.bitDepth / 8;
		}
		header['writeUInt32' + endianness](byteRate, offset);
		offset += 4;

		// write the block align
		var blockAlign = this.blockAlign;
		if (blockAlign == null) {
			blockAlign = this.channels * this.bitDepth / 8;
		}
		header['writeUInt16' + endianness](blockAlign, offset);
		offset += 2;

		// write the bits per sample
		header['writeUInt16' + endianness](this.bitDepth, offset);
		offset += 2;

		// write the "data" sub-chunk ID
		data.copy(header, offset);
		offset += data.length;

		// write the remaining length of the rest of the data
		header['writeUInt32' + endianness](dataLength, offset);
		offset += 4;

		// save the "header" Buffer for the end, we emit the "header" event at the end
		// with the "size" values properly filled out. if this stream is being piped to
		// a file (or anything else seekable), then this correct header should be placed
		// at the very beginning of the file.
		return header;
	}

}



module.exports = {
	HttpMjpegStream,
	HttpMp3Stream,
	HttpWavStream
};
