# problems I faced while using flask as a proxy
- We can't exclude content-header and we need to forward that so that the browser can encode the request
- websocket thing is another responsibility

# Solution
Needed some code first proxy like the mitmproxy
- So two things -> flask app for handling orchastrator commands and mitmproxy as a proxy over the codercom
- No /start or orchastrator stuff handling in the proxy as it is meant to be the single point(single threaded as well). We cant block.
Just request - verify - response

* proxy(no reverse mode) -> as we want to select the port based on the user auth and filtering out outgoing traffic, which is what forward proxies do
> mitmproxy -s proxy.py   --mode regular   --listen-port 5000

* web view for the logs
> mitmweb -s proxy.py --mode regular --listen-port 5000 --web-port 5001


# Local setup for proxy.
> It will replicate what a single node of an ASG will do

Build a local test environment where:

- A user requests a development server (Codermon),

- A centralized API launches and manages that instance,

- All interactions with the Codermon instance are authenticated and proxied through an API,

- The actual Codermon port (e.g., localhost:3001) is not directly exposed.

# Components
1. Orchestrator Script
A simple script to simulate a client requesting a VSCode server.

Sends a POST to the Flask API with a valid Authorization header.

2. API + Proxy
Central service that:

Authenticates incoming requests.

Launches Codermon instances on random free ports.

Stores mapping of user_id -> port.

Acts as a reverse proxy for all traffic to Codermon instances.

3. Codermon
The actual VSCode server, e.g., Coder’s VSCode server running at dynamic ports (localhost:3001, localhost:3002, ...).

Only accessible via the Flask API proxy.

4. Monitoring Script with scheduler(crons just hard to configure)
Periodically checks if instances are alive and reclaims unused ones.

5. Nginx(optional)

# Request Flow
User -> mitmproxy (localhost:5000)
            └── Validates auth
            └── Proxies request → localhost:3001 (Codermon)

Orchastrator -> flaskapp(localhost:5001)
                     └── start the container
                     └── return the response
