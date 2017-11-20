JSMpeg.Source.WebSocket = (function(){ "use strict";

var WSSource = function(url, options) {
	this.url = url;
	this.options = options;
	this.socket = null;	

	this.callbacks = {connect: [], data: []};
	this.destination = null;

	this.reconnectInterval = options.reconnectInterval !== undefined
		? options.reconnectInterval
		: 5000;
	this.shouldAttemptReconnect = !!this.reconnectInterval;

	this.completed = false;
	this.established = false;
	this.progress = 0;

	this.reconnectTimeoutId = 0;
	this.forceReconnect = false;
};

WSSource.prototype.connect = function(destination) {
	this.destination = destination;
};

WSSource.prototype.destroy = function() {
	clearTimeout(this.reconnectTimeoutId);
	this.shouldAttemptReconnect = false;
	this.socket.close();
};

WSSource.prototype.send = function(data) {
	this.socket.send(data);
};

WSSource.prototype.start = function() {
	this.shouldAttemptReconnect = !!this.reconnectInterval;
	this.progress = 0;
	this.established = false;
	
	this.socket = new WebSocket(this.url, this.options.protocols || null);
	this.socket.binaryType = 'arraybuffer';
	this.socket.onmessage = this.onMessage.bind(this);
	this.socket.onopen = this.onOpen.bind(this);
	this.socket.onerror = this.onClose.bind(this);
	this.socket.onclose = this.onClose.bind(this);
};

WSSource.prototype.resume = function(secondsHeadroom) {
	// Nothing to do here
};

WSSource.prototype.onOpen = function() {
	this.progress = 1;
	this.established = true;

	if (typeof JSMpeg.on_source_opened === "function") { 
		JSMpeg.on_source_opened(this);
	}
};

WSSource.prototype.getReconnectInterval = function() {
	if (JSMpeg.config.reconnectInterval) {
		return JSMpeg.config.reconnectInterval;
	}
	return this.reconnectInterval;
};

WSSource.prototype.onClose = function() {
	if (this.shouldAttemptReconnect) {
		clearTimeout(this.reconnectTimeoutId);

		if (this.forceReconnect === true) {
			this.start();	
			this.forceReconnect = false;
		} else {
			this.reconnectTimeoutId = setTimeout(function(){
				this.start();	
			}.bind(this), this.getReconnectInterval());
		}
	}
};

WSSource.prototype.onMessage = function(ev) {
	if (this.destination) {
		this.destination.write(ev.data);
	}
};

WSSource.prototype.jsonPost = function( url, data, callback, timeout ) {
	timeout = timeout? timeout : 5000;  

	var xhr = new XMLHttpRequest();

	xhr.onerror = function (e) {
		callback('error');
	};

	xhr.onload = function() {
		var res = null;
		try {
			res = JSON.parse( xhr.responseText );
		} catch (e) {}

		if (res === null) {
			callback('formatError');
		}

		callback(null, res);
	};

	xhr.open('POST', url, true);
	xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	xhr.send(JSON.stringify(data));

	setTimeout(function() {
		if (xhr.readyState !== XMLHttpRequest.DONE) {
			xhr.abort();
			callback('timeout');
		}
	}, timeout);

};

return WSSource;

})();

