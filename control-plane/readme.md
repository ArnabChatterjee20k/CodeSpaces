* Not using docker cause the control plane and proxy needs to directly talk with the docker containers. Running docker inside the docker is a bit of not good dx.

* Using systemd service since the control plane controlling the docker and I dont want it to give the sudo level permission. So having a reboot wont affect the daemon service

Best -> Creating our own Amazon Base Image to have a good build speed