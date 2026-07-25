import fs from "fs";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import { shopifyApiProject, ApiType } from "@shopify/api-codegen-preset";
import type { IGraphQLConfig } from "graphql-config";

function getConfig() {
  const adminProject = shopifyApiProject({
    apiType: ApiType.Admin,
    apiVersion: ApiVersion.July26,
    documents: [
      "./app/**/*.{js,ts,jsx,tsx}",
      "./app/.server/**/*.{js,ts,jsx,tsx}",
    ],
    outputDir: "./app/types",
  });
  adminProject.extensions = {
    ...adminProject.extensions,
    codegen: {
      ...adminProject.extensions?.codegen,
      ignoreNoDocuments: true,
    },
  };

  const config: IGraphQLConfig = {
    projects: {
      default: adminProject,
    },
  };

  let extensions: string[] = [];
  try {
    extensions = fs.readdirSync("./extensions");
  } catch {
    // ignore if no extensions
  }

  for (const entry of extensions) {
    const extensionPath = `./extensions/${entry}`;
    const schema = `${extensionPath}/schema.graphql`;
    if (!fs.existsSync(schema)) {
      continue;
    }
    config.projects[entry] = {
      schema,
      documents: [`${extensionPath}/**/*.graphql`],
    };
  }

  return config;
}

const config = getConfig();

export default config;
