import { validateDeploymentEnvironment } from "../app/platform/deployment/preflight";

const issues = validateDeploymentEnvironment(process.env);

if (issues.length > 0) {
  process.stderr.write("Deployment preflight failed:\n");
  for (const issue of issues) process.stderr.write(`- ${issue}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Deployment preflight passed for ${process.env.DEPLOYMENT_ENVIRONMENT}.\n`,
  );
}
