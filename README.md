# To-Do App — Application Code

Spring Boot 3 (Java 21) REST API + a small static HTML/JS frontend. Writes go straight to
PostgreSQL through RDS Proxy; reads are cached in Redis (ElastiCache) for 30 seconds, so a
repeated `GET /api/tasks` within that window is served without touching the database.

Infrastructure lives in the separate [`todo-app-infra`](../todo-app-infra) repo.

## Stack

- **Spring Data JPA** (`org.postgresql` driver) — the standard JDBC-based SDK for talking to
  PostgreSQL through RDS Proxy; the AWS SDK has no role here since RDS Proxy speaks the
  Postgres wire protocol, not an AWS API.
- **Spring Data Redis** (Lettuce client) via `@Cacheable`/`@CacheEvict` — same reasoning for
  ElastiCache: it's the Redis protocol, so the Redis-native client is correct, not the AWS SDK.
- **Spring Boot Actuator** — exposes `/actuator/health`, used as the ALB target group health
  check.
- DB credentials and Redis/Proxy endpoints are injected as environment variables /
  ECS `secrets` by the task definition — the app never calls Secrets Manager itself.

## Local development

Requires a local Postgres and Redis (or point `SPRING_DATASOURCE_URL` /
`REDIS_HOST` at any reachable instances):

```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tododb postgres:16
docker run --rm -d -p 6379:6379 redis:7

SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/tododb \
SPRING_DATASOURCE_USERNAME=postgres \
SPRING_DATASOURCE_PASSWORD=postgres \
REDIS_HOST=localhost \
mvn spring-boot:run
```

Then open http://localhost:8080.

## Build & run the container

```bash
docker build -t todo-app .
docker run -p 8080:8080 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:5432/tododb \
  -e SPRING_DATASOURCE_USERNAME=... -e SPRING_DATASOURCE_PASSWORD=... \
  -e REDIS_HOST=<redis-host> \
  todo-app
```

## CI/CD

`.github/workflows/build-and-deploy.yml` runs on every push to `main`:

1. Assumes `todo-app-github-actions` via **GitHub OIDC** (`aws-actions/configure-aws-credentials`,
   `id-token: write` permission) — no long-lived AWS keys are stored in GitHub. That role is
   created by the infra repo's `stacks/iam.yaml`, scoped to this exact repo/branch.
2. Builds the image and pushes it to ECR tagged with the commit SHA (immutable, traceable).
3. Calls `aws ecs describe-task-definition` on the **live** `todo-app-task` definition — the one
   CloudFormation created/updated with the real RDS Proxy endpoint, DB secret ARN, and Redis
   host/port already baked in — strips the fields ECS doesn't accept on re-registration, and
   patches only the `app` container's `image` field to the placeholder `<IMAGE1_NAME>`.
4. Zips that patched `taskdef.json` with the static `deploy/appspec.yaml` and uploads it to the
   CodePipeline artifact bucket at `deploy/deploy-bundle.zip`.
5. Pushes the `:latest` tag last, deliberately — CodePipeline's ECR source action and the
   EventBridge rule that starts the pipeline both watch that fixed tag, and by the time it's
   pushed the SHA-tagged image and the deploy bundle already exist in place.

CodePipeline then runs a CodeDeploy **blue/green** deployment: the new task definition is
registered with `<IMAGE1_NAME>` replaced by the resolved image digest, traffic shifts from the
blue target group to green via the ALB's test listener, and the old tasks are torn down after a
5-minute bake time.

No GitHub repository variables to configure — the account ID, region, ECR repo, artifact
bucket, and role name are fixed values in the workflow itself (see the `env:` block), since
this repo is scoped to one specific AWS account by design.
