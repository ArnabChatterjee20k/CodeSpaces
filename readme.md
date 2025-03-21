### What is this?
It is a vscode as a service similar to github codespaces. Mainly I built this for learning asgs, instance scaling and deployments

1. users can come and start using the service
2. My orchastrator will sit in between all of tehm
3. it will scale up and down asgs as per the users
4. now the best feature would be if an instance is having some low usage liek 50% then it will redirect user to the same instance and create andother docker container inside and user will be able to use that
inactive for 15mins , scale down that inactive machine


1️⃣ Independent Cache (Redis)
Stores container status, instance info, and assigned user sessions.
Orchestrator reads from this cache instead of pinging EC2s constantly.

2️⃣ Multiple EC2s (Auto Scaling Group)
Each instance runs up to 20 containers.
When a container stops (idle for 15 min), the EC2 script triggers a Lambda.
Lambda updates the orchestrator’s cache with the latest container state.

3️⃣ Orchestrator API
Handles ASG scaling (spins up/down EC2s as needed).
Checks cache to assign users to available containers.
No more constant pinging—orchestrator relies on the cache and events instead.
4️⃣ EC2-to-Orchestrator Communication
✅ Instance detects idle container → Calls Lambda → Lambda updates cache
✅ Orchestrator checks cache → Assigns available containers → Returns IP & port

> We can take advantage of the using the add life cycle hooks of the asgs

![alt text](image.png)