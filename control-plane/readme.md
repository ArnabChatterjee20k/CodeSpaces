### Why no docker for running these?
Cause the control plane and proxy needs to directly talk with the docker containers. Running docker inside the docker is a bit of not good dx.
Good workaournd -> turn them to systemd services
But currently will go with nohup