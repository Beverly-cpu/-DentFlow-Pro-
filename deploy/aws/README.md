# AWS production API runtime

`runtime.yml` defines ECR, ALB/HTTPS, ECS Fargate, IAM and CloudWatch. It expects an existing VPC/private subnets, ACM certificate, PostgreSQL, private clinical-asset S3/KMS, and a Secrets Manager secret whose entire value is `DATABASE_URL`.

Deploy with a non-root deployment role in `ap-east-2`. Deploy the stack with `CAPABILITY_IAM`, build/push the API using the Git SHA as `ImageTag`, update the stack, point DNS to the ALB output, then run the production preflight, private-S3 smoke test and HTTPS API smoke test. Fargate has no public IP; port 8787 accepts traffic only from the ALB security group. RDS must separately allow 5432 only from the API security group.
