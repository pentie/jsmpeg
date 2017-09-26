
//-------------------------
//  functions
//-------------------------

function encode (input) {
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
}

//------------------------------------------------------------
//  cookies  

function userid()
{
	var id = get_cookie('id');
	if (id === '') {
		id = 'xxyxxyxxyxxyxxyx'.replace(/[xy]/g, function(c) {
			var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
			return v.toString(16);
		});

		set_cookie('id', id, 365);
	}
	return id;
}

function set_cookie(cname,cvalue,exdays)
{
	var d = new Date();
	d.setTime(d.getTime()+(exdays*24*60*60*1000));
	var expires = "expires="+d.toGMTString();
	document.cookie = cname + "=" + cvalue + "; " + expires;
}

function get_cookie(cname)
{
	var name = cname + "=";
	var ca = document.cookie.split(';');
	for(var i=0; i<ca.length; i++) 
	{
		var c = ca[i].trim();
		if (c.indexOf(name)==0) return c.substring(name.length,c.length);
	}
	return "";
}

//-----------------------------------------------------------
//  reconnect websocket client 

function ws_client(url, interval, recv) 
{
	var WSClient = function() {
		this.url = url;
		this.interval = interval;
		this.reconnectTimeoutId = 0;
		this.recv = recv;
	};

	WSClient.prototype.start = function() {
		this.socket = new WebSocket(this.url);
		this.socket.binaryType = 'arraybuffer';
		this.socket.onmessage= (function(ev){
			this.recv(ev);
		}).bind(this);

		this.socket.onopen = (function(){
			this.recv(null);
		}).bind(this);

		this.socket.onerror = this.onClose.bind(this);
		this.socket.onclose = this.onClose.bind(this);
		return this;
	};

	WSClient.prototype.onClose = function() {
		clearTimeout(this.reconnectTimeoutId);
		this.reconnectTimeoutId = setTimeout(function(){
			this.start();	
		}.bind(this), this.interval);
	};

	WSClient.prototype.send = function(data) {
		this.socket.send(data);
	};


	return new WSClient().start();
}

