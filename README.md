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

`.github/workflows/build-and-deploy.yml` runs on every push to `main` that touches `src/`,
`pom.xml`, `Dockerfile`, or `deploy/`:

1. Assumes an AWS IAM role via **GitHub OIDC** (`aws-actions/configure-aws-credentials`,
   `id-token: write` permission) — no long-lived AWS keys are stored in GitHub.
2. Builds the Docker image and pushes `:latest` and `:<commit-sha>` to ECR.
3. Renders `deploy/taskdef.template.json` + `deploy/appspec.template.yaml` with the account's
   role ARNs / endpoints (from repo variables — see the infra repo's README for the mapping)
   and zips them into `deploy/taskdef-bundle.zip`.
4. Uploads that bundle to the CodePipeline artifact S3 bucket.

The ECR push itself fires an EventBridge rule (defined in the infra repo) that starts
CodePipeline, which runs a CodeDeploy **blue/green** deployment to ECS using the uploaded
task definition + appspec.

Before the workflow can succeed, set the repository variables listed in the infra repo's
README (`AWS_DEPLOY_ROLE_ARN`, `ECR_REPOSITORY`, `ARTIFACT_BUCKET`, etc.) under
**Settings → Secrets and variables → Actions → Variables**.
