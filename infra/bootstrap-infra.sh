# !/bin/bash
export CDK_DEFAULT_REGION=
export AWS_ACCESS_KEY_ID=
export AWS_SECRET_ACCESS_KEY=
export AWS_DEFAULT_REGION=
export AWS_REGION=
npm run build
# npx cdk bootstrap
npx cdk deploy --all
# npx cdk destroy --all
# stacks=("InfraStack" "ASGStack")

# for stack in "${stacks[@]}"
# do
#   echo "Deploying $stack..."
#   npx cdk deploy "$stack"
# done