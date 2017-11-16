
function ajaxPost(url, data, callback) 
{
	const http = new XMLHttpRequest();
	http.open('POST', url, true);
	http.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	http.send(JSON.stringify(data));
	http.onload = function() {
		callback(http.responseText, http.status);
	};
}


function getUrl()
{
	if (document.location.port) {
		return 'ws://'+document.location.hostname+':'+document.location.port;
	} else {
		return 'ws://'+document.location.hostname;
	}
}

function wsClient( url, interval, recv ) 
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

		this.socket.onmessage = function incoming(data) {
			this.recv(data);
		}.bind(this);

		this.socket.onopen = function open(){
			this.recv(null);
		}.bind(this);

		this.socket.onerror = this.onClose.bind(this);
		this.socket.onclose = this.onClose.bind(this);
		return this;
	};

	WSClient.prototype.onClose = function(ev) {
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


(function(funcName, baseObj) {
    "use strict";
    // The public function name defaults to window.docReady
    // but you can modify the last line of this function to pass in a different object or method name
    // if you want to put them in a different namespace and those will be used instead of 
    // window.docReady(...)
    funcName = funcName || "docReady";
    baseObj = baseObj || window;
    var readyList = [];
    var readyFired = false;
    var readyEventHandlersInstalled = false;
    
    // call this when the document is ready
    // this function protects itself against being called more than once
    function ready() {
        if (!readyFired) {
            // this must be set to true before we start calling callbacks
            readyFired = true;
            for (var i = 0; i < readyList.length; i++) {
                // if a callback here happens to add new ready handlers,
                // the docReady() function will see that it already fired
                // and will schedule the callback to run right after
                // this event loop finishes so all handlers will still execute
                // in order and no new ones will be added to the readyList
                // while we are processing the list
                readyList[i].fn.call(window, readyList[i].ctx);
            }
            // allow any closures held by these functions to free
            readyList = [];
        }
    }
    
    function readyStateChange() {
        if ( document.readyState === "complete" ) {
            ready();
        }
    }
    
    // This is the one public interface
    // docReady(fn, context);
    // the context argument is optional - if present, it will be passed
    // as an argument to the callback
    baseObj[funcName] = function(callback, context) {
        if (typeof callback !== "function") {
            throw new TypeError("callback for docReady(fn) must be a function");
        }
        // if ready has already fired, then just schedule the callback
        // to fire asynchronously, but right away
        if (readyFired) {
            setTimeout(function() {callback(context);}, 1);
            return;
        } else {
            // add the function and context to the list
            readyList.push({fn: callback, ctx: context});
        }
        // if document already ready to go, schedule the ready function to run
        // IE only safe when readyState is "complete", others safe when readyState is "interactive"
        if (document.readyState === "complete" || (!document.attachEvent && document.readyState === "interactive")) {
            setTimeout(ready, 1);
        } else if (!readyEventHandlersInstalled) {
            // otherwise if we don't have event handlers installed, install them
            if (document.addEventListener) {
                // first choice is DOMContentLoaded event
                document.addEventListener("DOMContentLoaded", ready, false);
                // backup is window load event
                window.addEventListener("load", ready, false);
            } else {
                // must be IE
                document.attachEvent("onreadystatechange", readyStateChange);
                window.attachEvent("onload", ready);
            }
            readyEventHandlersInstalled = true;
        }
    }
})("docReady", window);

docReady(function() {
	if (typeof main === 'function') {
		main();
	}
});
