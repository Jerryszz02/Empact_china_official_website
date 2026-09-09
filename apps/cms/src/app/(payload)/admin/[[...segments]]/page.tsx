import config from "@payload-config";
import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import { importMap } from "../importMap.js";
export const generateMetadata = ({
  params,
  searchParams,
}: {
  params: Promise<Record<string, string | string[]>>;
  searchParams: Promise<Record<string, string | string[]>>;
}) => generatePageMetadata({ config, params, searchParams });
export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  return (
    <RootPage
      config={config}
      importMap={importMap}
      params={params}
      searchParams={searchParams}
    />
  );
}
