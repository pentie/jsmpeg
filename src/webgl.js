JSMpeg.Renderer.WebGL = (function(){ "use strict";

var WebGLRenderer = function(options) {
	this.canvas = options.canvas || document.createElement('canvas');
	this.width = this.canvas.width;
	this.height = this.canvas.height;
	this.enabled = true;

	var contextCreateOptions = {
		preserveDrawingBuffer: !!options.preserveDrawingBuffer,
		alpha: false,
		depth: false,
		stencil: false,
		antialias: false
	};

	this.gl = 
		this.canvas.getContext('webgl', contextCreateOptions) || 
		this.canvas.getContext('experimental-webgl', contextCreateOptions);

	if (!this.gl) {
		throw new Error('Failed to get WebGL Context');
	}

	var gl = this.gl;
	var vertexAttr = null;

	// Init buffers
	this.vertexBuffer = gl.createBuffer();
	var vertexCoords = new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]);
	gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, vertexCoords, gl.STATIC_DRAW);

	// Setup the main YCrCbToRGBA shader
	this.program = this.createProgram(
		WebGLRenderer.SHADER.VERTEX_IDENTITY,
		WebGLRenderer.SHADER.FRAGMENT_YCRCB_TO_RGBA
	);
	vertexAttr = gl.getAttribLocation(this.program, 'vertex');
	gl.enableVertexAttribArray(vertexAttr);
	gl.vertexAttribPointer(vertexAttr, 2, gl.FLOAT, false, 0, 0);

	this.textureY = this.createTexture(0, 'textureY');
	this.textureCb = this.createTexture(1, 'textureCb');
	this.textureCr = this.createTexture(2, 'textureCr');


	// Setup the loading animation shader
	this.loadingProgram = this.createProgram(
		WebGLRenderer.SHADER.VERTEX_IDENTITY,
		WebGLRenderer.SHADER.FRAGMENT_LOADING
	);
	vertexAttr = gl.getAttribLocation(this.loadingProgram, 'vertex');
	gl.enableVertexAttribArray(vertexAttr);
	gl.vertexAttribPointer(vertexAttr, 2, gl.FLOAT, false, 0, 0);

	this.shouldCreateUnclampedViews = !this.allowsClampedTextureData();
};

WebGLRenderer.prototype.destroy = function() {
	var gl = this.gl;
	
	gl.deleteTexture(this.textureY);
	gl.deleteTexture(this.textureCb);
	gl.deleteTexture(this.textureCr);

	gl.deleteProgram(this.program);
	gl.deleteProgram(this.loadingProgram);

	gl.deleteBuffer(this.vertexBuffer);
};

WebGLRenderer.prototype.resize = function(width, height) {
	this.width = width|0;
	this.height = height|0;

	this.canvas.width = this.width;
	this.canvas.height = this.height;

	this.gl.useProgram(this.program);
	this.gl.viewport(0, 0, this.width, this.height);
};

WebGLRenderer.prototype.createTexture = function(index, name) {
	var gl = this.gl;
	var texture = gl.createTexture();

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.uniform1i(gl.getUniformLocation(this.program, name), index);

	return texture;
};

WebGLRenderer.prototype.createProgram = function(vsh, fsh) {
	var gl = this.gl;
	var program = gl.createProgram();

	gl.attachShader(program, this.compileShader(gl.VERTEX_SHADER, vsh));
	gl.attachShader(program, this.compileShader(gl.FRAGMENT_SHADER, fsh));
	gl.linkProgram(program);
	gl.useProgram(program);

	return program;
};

WebGLRenderer.prototype.compileShader = function(type, source) {
	var gl = this.gl;
	var shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(shader));
	}

	return shader;
};

WebGLRenderer.prototype.allowsClampedTextureData = function() {
	var gl = this.gl;
	var texture = gl.createTexture();

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(
		gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0,
		gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8ClampedArray([0])
	);
	return (gl.getError() === 0);
};

WebGLRenderer.prototype.renderProgress = function(progress) {
	var gl = this.gl;

	gl.useProgram(this.loadingProgram);

	var loc = gl.getUniformLocation(this.loadingProgram, 'progress');
	gl.uniform1f(loc, progress);
	
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

WebGLRenderer.prototype.render = function(y, cb, cr) {
	if (!this.enabled) {
		return;
	}

	var gl = this.gl;
	var w = ((this.width + 15) >> 4) << 4,
		h = this.height,
		w2 = w >> 1,
		h2 = h >> 1;

	// In some browsers WebGL doesn't like Uint8ClampedArrays (this is a bug
	// and should be fixed soon-ish), so we have to create a Uint8Array view 
	// for each plane.
	if (this.shouldCreateUnclampedViews) {
		y = new Uint8Array(y.buffer),
		cb = new Uint8Array(cb.buffer),
		cr = new Uint8Array(cr.buffer);	
	}

	gl.useProgram(this.program);

	this.updateTexture(gl.TEXTURE0, this.textureY, w, h, y);
	this.updateTexture(gl.TEXTURE1, this.textureCb, w2, h2, cb);
	this.updateTexture(gl.TEXTURE2, this.textureCr, w2, h2, cr);

	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

WebGLRenderer.prototype.renderJpeg = function(image) {
	if (!this.enabled) {
		return;
	}

	var gl = this.gl;

	if (!this.imageProgram) {
		this.imageProgram = this.createProgram(
			WebGLRenderer.SHADER.VERTEX_IDENTITY,
			WebGLRenderer.SHADER.FRAGMENT_IMAGE
		);

		var vertexAttr = gl.getAttribLocation(this.imageProgram, 'vertex');
		gl.enableVertexAttribArray(vertexAttr);
		gl.vertexAttribPointer(vertexAttr, 2, gl.FLOAT, false, 0, 0);

		this.textureImage = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.textureImage);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.imageProgram.imageUniform = gl.getUniformLocation(this.imageProgram, 'textureImage');
	}

	gl.useProgram(this.imageProgram);
	this.updateTextureImage(gl.TEXTURE0, this.textureImage, image);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

/*

WebGLRenderer.prototype.drawImage= function(image) {

	function loadImageAndCreateTextureInfo(jpegData) {
		var tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		// Fill the texture with a 1x1 blue pixel.
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
				new Uint8Array([0, 0, 255, 255]));

		// let's assume all images are not a power of 2
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

		var textureInfo = {
			width: 1,   // we don't know the size until it loads
			height: 1,
			texture: tex,
		};

		var img = new Image();
		img.addEventListener('load', function() {
			textureInfo.width = img.width;
			textureInfo.height = img.height;

			gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		});
		img.src = 'data:image/png;base64,'+this.jpgEncode(jpegData);

		return textureInfo;
	}

	function drawImage(tex, texWidth, texHeight, dstX, dstY) {
		gl.bindTexture(gl.TEXTURE_2D, tex);

		// Tell WebGL to use our shader program pair
		gl.useProgram(program);

		// Setup the attributes to pull data from our buffers
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
		gl.enableVertexAttribArray(texcoordLocation);
		gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

		// this matirx will convert from pixels to clip space
		var matrix = m4.orthographic(0, gl.canvas.width, gl.canvas.height, 0, -1, 1);

		// this matrix will translate our quad to dstX, dstY
		matrix = m4.translate(matrix, dstX, dstY, 0);

		// this matrix will scale our 1 unit quad
		// from 1 unit to texWidth, texHeight units
		matrix = m4.scale(matrix, texWidth, texHeight, 1);

		// Set the matrix.
		gl.uniformMatrix4fv(matrixLocation, false, matrix);

		// Tell the shader to get the texture from texture unit 0
		gl.uniform1i(textureLocation, 0);

		// draw the quad (2 triangles, 6 vertices)
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}




};
*/

WebGLRenderer.prototype.updateTextureImage = function(unit, texture, image) {
	var gl = this.gl;
	gl.activeTexture(unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

WebGLRenderer.prototype.updateTexture = function(unit, texture, w, h, data) {
	var gl = this.gl;
	gl.activeTexture(unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(
		gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, 
		gl.LUMINANCE, gl.UNSIGNED_BYTE, data
	);
}

WebGLRenderer.prototype.jpgEncode = function (input) {
	var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
	var output = "";
	var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
	var i = 0;

	while (i < input.length) {
		chr1 = input[i++];
		chr2 = i < input.length ? input[i++] : Number.NaN; // Not sure if the index 
		chr3 = i < input.length ? input[i++] : Number.NaN; // checks are needed here

		enc1 = chr1 >> 2;
		enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
		enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
		enc4 = chr3 & 63;

		if (isNaN(chr2)) {
			enc3 = enc4 = 64;
		} else if (isNaN(chr3)) {
			enc4 = 64;
		}
		output += keyStr.charAt(enc1) + keyStr.charAt(enc2) +
			keyStr.charAt(enc3) + keyStr.charAt(enc4);
	}
	return output;
};

WebGLRenderer.IsSupported = function() {
	try {
		if (!window.WebGLRenderingContext) {
			return false;
		}

		var canvas = document.createElement('canvas'); 
		return !!(
			canvas.getContext('webgl') || 
			canvas.getContext('experimental-webgl')
		);
	}
	catch (err) {
		return false;
	} 
};

WebGLRenderer.SHADER = {
	FRAGMENT_IMAGE : [
		'precision mediump float;',
		'uniform sampler2D textureImage;',
		'varying vec2 texCoord;',

		'void main() {',
			'gl_FragColor = texture2D(textureImage, texCoord);',
		'}'
	].join('\n'),

	FRAGMENT_YCRCB_TO_RGBA: [
		'precision mediump float;',
		'uniform sampler2D textureY;',
		'uniform sampler2D textureCb;',
		'uniform sampler2D textureCr;',
		'varying vec2 texCoord;',

		'mat4 rec601 = mat4(',
			'1.16438,  0.00000,  1.59603, -0.87079,',
			'1.16438, -0.39176, -0.81297,  0.52959,',
			'1.16438,  2.01723,  0.00000, -1.08139,',
			'0, 0, 0, 1',
		');',

		'void main() {',
			'float y = texture2D(textureY, texCoord).r;',
			'float cb = texture2D(textureCb, texCoord).r;',
			'float cr = texture2D(textureCr, texCoord).r;',

			'gl_FragColor = vec4(y, cr, cb, 1.0) * rec601;',
		'}'
	].join('\n'),

	FRAGMENT_LOADING: [
		'precision mediump float;',
		'uniform float progress;',
		'varying vec2 texCoord;',

		'void main() {',
			'float c = ceil(progress-(1.0-texCoord.y));',
			'gl_FragColor = vec4(c,c,c,1);',
		'}'
	].join('\n'),

	VERTEX_IDENTITY: [
		'attribute vec2 vertex;',
		'varying vec2 texCoord;',

		'void main() {',
			'texCoord = vertex;',
			'gl_Position = vec4((vertex * 2.0 - 1.0) * vec2(1, -1), 0.0, 1.0);',
		'}'
	].join('\n')
};

return WebGLRenderer;

})();

