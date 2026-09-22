import "../../admin.css";
import "@payloadcms/next/css";
import type { ReactNode } from "react";
import type { ServerFunctionClient } from "payload";
import { RootLayout, handleServerFunctions } from "@payloadcms/next/layouts";
import config from "@payload-config";
import { importMap } from "./admin/importMap.js";
const serverFunction: ServerFunctionClient = async (args) => {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      <nav className="cms-home-nav" aria-label="官网入口">
        <a href="/" target="_blank" rel="noopener noreferrer">
          返回官网首页 <span aria-hidden="true">↗</span>
        </a>
      </nav>
      {children}
    </RootLayout>
  );
}
