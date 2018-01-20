
### Add onvif support (2018-01-19)
* add onvifInterval=5000ms, control the internal of onvif camera discovery. The discovery need multicast support.
* add authentication that need for onvif camera.
* add mpeg1Qscale=8, control the quality of mpeg1video
* add defaultSourceIndex=0, with "defaultSource" together defines a source when startup.
* add alwaysNewest=true, when new onvif webcamera found, play it immediately
* move livestream configuration from centerNodes to root
