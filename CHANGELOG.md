### Fix bugs (2018-04-28)
* remove "size" option in config.json5, the video size will hard code in ffmpeg -filter:v parameter

### Fix bugs (2018-02-7)
* fix bug of mjpeg stream in relayNode, previous will stop after switchVideoMode 

### add support (2018-02-5)
* in centerNode config add "allowSources" array, only load the Specified sources

### Fix bugs (2018-01-26)
* add advertise superisor routine, to force stop advertise while movie is playing

### Fix bugs (2018-01-23)
* while not in webcam mode, stop discovery for new webcam. but allways can be start manually

### Add onvif support (2018-01-19)
* add onvifInterval=5000ms, control the internal of onvif camera discovery. The discovery need multicast support.
* add authentication that need for onvif camera.
* add mpeg1Qscale=8, control the quality of mpeg1video
* add defaultSourceIndex=0, with "defaultSource" together defines a source when startup.
* add alwaysNewest=true, when new onvif webcamera found, play it immediately
* move livestream configuration from centerNodes to root
