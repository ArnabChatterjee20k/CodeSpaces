### Code server command
```bash
docker run -d -p 8083:8080 \
  -e PASSWORD="arnab" \
  codercom/code-server --auth password
```

### How I ended up with a bill with cdks?
I created vpc using cdk and it created nat gateway and it charged up bill. SO make sure to have a zero spend budget and write deterministic code


### Getting instance id inside the instance and making it isloated
We can use cloud utils linux package
Or use the get request
And save it in the env var

And now user in the container even if makes a request and get instance id they can't change the env var as their env is the container env and not the instance env
Or set using the user-data of the instance and set in the env
```
sudo apt install cloud-utils
EC2_INSTANCE_ID=$(ec2metadata --instance-id)
```
# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
