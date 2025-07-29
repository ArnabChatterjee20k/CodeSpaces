* Not using docker cause the control plane and proxy needs to directly talk with the docker containers. Running docker inside the docker is a bit of not good dx.

* Using systemd service since the control plane controlling the docker and I dont want it to give the sudo level permission. So having a reboot wont affect the daemon service

Best -> Creating our own Amazon Base Image to have a good build speed

### Giving docker access to control plane
* So ubuntu doesnt come with the docker installed. So installing it via the runtime. 
But after adding the current user(ubuntu) to the docker group, we need to reboot(not favourable)

* Since we are starting the control plane as a systemd service , so running it as as root (who has Docker access by default)

* Plus due to systemd even if restarts we dont have to manually set

* Proxy is running as the current user(ubuntu)